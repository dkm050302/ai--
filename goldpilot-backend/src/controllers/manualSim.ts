import type { Request, Response } from 'express';
import { ManualSimAccountModel } from '../models';
import { UserModel } from '../models/User';
import type {
  ManualSimAccountDocument,
  ManualSimOrder,
  ManualSimOrderType,
  ManualSimPosition,
  ManualSimSide,
  ManualSimTradeAction,
} from '../models/ManualSimAccount';
import { marketDataService } from '../services/marketData';
import { logger } from '../utils/logger';
import { logAction } from '../services/actionLogger';

const INITIAL_BALANCE = 1_000_000;
const SYMBOL = 'XAU/USD';
const CONTRACT_SIZE = 100;
const MARGIN_RATE = 0.02;
const MAX_TRADE_LOG = 200;

function getUserAccountId(req: Request): string | null {
  return req.user?.accountId || null;
}

async function logTradeAction(req: Request, category: 'trade_open' | 'trade_close' | 'trade_cancel' | 'trade_reset', action: string, detail?: any): Promise<void> {
  const accountId = getUserAccountId(req);
  if (!accountId) return;
  try {
    const user = await UserModel.findById(req.user!.userId);
    if (user) {
      await logAction({ accountId, role: user.role, category, action, detail, page: '/manual-sim' });
    }
  } catch { /* never block */ }
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function roundMoney(value: number): number {
  return Number((Number(value) || 0).toFixed(2));
}

function roundLots(value: number): number {
  return Number((Number(value) || 0).toFixed(2));
}

function calculatePnl(side: ManualSimSide, entryPrice: number, exitPrice: number, lots: number): number {
  const diff = side === 'buy' ? exitPrice - entryPrice : entryPrice - exitPrice;
  return roundMoney(diff * lots * CONTRACT_SIZE);
}

function calculateMargin(price: number, lots: number): number {
  return roundMoney(price * lots * CONTRACT_SIZE * MARGIN_RATE);
}

function normalizeSide(value: unknown): ManualSimSide {
  return value === 'sell' ? 'sell' : 'buy';
}

function normalizeOrderType(value: unknown): ManualSimOrderType {
  if (value === 'limit' || value === 'stop') return value;
  return 'market';
}

function normalizeLots(value: unknown): number {
  const lots = roundLots(Number(value || 0));
  if (!Number.isFinite(lots) || lots < 0.01) {
    throw new Error('手数不能小于0.01');
  }
  if (lots > 100) {
    throw new Error('单笔手数不能超过100');
  }
  return lots;
}

function normalizeOptionalPrice(value: unknown): number | undefined {
  const price = Number(value || 0);
  return Number.isFinite(price) && price > 0 ? roundMoney(price) : undefined;
}

async function ensureManualAccount(userAccountId: string): Promise<ManualSimAccountDocument> {
  const existing = await ManualSimAccountModel.findOne({ userAccountId });
  if (existing) return existing;

  return ManualSimAccountModel.create({
    userAccountId,
    name: '手动模拟账户',
    symbol: SYMBOL,
    initialBalance: INITIAL_BALANCE,
    balance: INITIAL_BALANCE,
    equity: INITIAL_BALANCE,
    freeMargin: INITIAL_BALANCE,
    tradeLog: [{
      tradeId: createId('log'),
      action: 'reset',
      symbol: SYMBOL,
      pnl: 0,
      balanceAfter: INITIAL_BALANCE,
      reason: '初始化100万手动模拟账户',
      createdAt: new Date(),
    }],
  });
}

function pushLog(
  account: ManualSimAccountDocument,
  action: ManualSimTradeAction,
  reason: string,
  extra: Partial<{
    orderId: string;
    positionId: string;
    side: ManualSimSide;
    lots: number;
    price: number;
    pnl: number;
  }> = {}
): void {
  account.tradeLog.unshift({
    tradeId: createId('log'),
    orderId: extra.orderId,
    positionId: extra.positionId,
    action,
    symbol: SYMBOL,
    side: extra.side,
    lots: extra.lots,
    price: extra.price,
    pnl: roundMoney(extra.pnl || 0),
    balanceAfter: roundMoney(account.balance),
    reason,
    createdAt: new Date(),
  });
  account.tradeLog = account.tradeLog.slice(0, MAX_TRADE_LOG);
}

function markToMarket(account: ManualSimAccountDocument, currentPrice: number): void {
  let unrealizedPnl = 0;
  let margin = 0;

  account.positions = (account.positions || []).map((position) => {
    const pnl = calculatePnl(position.side, position.entryPrice, currentPrice, position.lots);
    const positionMargin = calculateMargin(position.entryPrice, position.lots);
    unrealizedPnl += pnl;
    margin += positionMargin;

    return {
      ...position,
      currentPrice: roundMoney(currentPrice),
      pnl,
      margin: positionMargin,
    };
  });

  account.unrealizedPnl = roundMoney(unrealizedPnl);
  account.margin = roundMoney(margin);
  account.equity = roundMoney(account.balance + unrealizedPnl);
  account.freeMargin = roundMoney(account.equity - account.margin);
}

function canFill(account: ManualSimAccountDocument, price: number, lots: number): boolean {
  const requiredMargin = calculateMargin(price, lots);
  return account.freeMargin >= requiredMargin;
}

function createPosition(
  account: ManualSimAccountDocument,
  side: ManualSimSide,
  lots: number,
  entryPrice: number,
  reason: string,
  stopLoss?: number,
  takeProfit?: number,
  orderId?: string
): ManualSimPosition {
  markToMarket(account, entryPrice);

  if (!canFill(account, entryPrice, lots)) {
    throw new Error('可用保证金不足，无法成交');
  }

  const position: ManualSimPosition = {
    positionId: createId('pos'),
    symbol: SYMBOL,
    side,
    lots,
    contractSize: CONTRACT_SIZE,
    entryPrice: roundMoney(entryPrice),
    currentPrice: roundMoney(entryPrice),
    stopLoss,
    takeProfit,
    margin: calculateMargin(entryPrice, lots),
    pnl: 0,
    openedAt: new Date(),
    note: reason,
  };

  account.positions.unshift(position);
  pushLog(account, orderId ? 'fill' : 'open', reason, {
    orderId,
    positionId: position.positionId,
    side,
    lots,
    price: position.entryPrice,
  });
  markToMarket(account, entryPrice);
  return position;
}

function shouldTrigger(order: ManualSimOrder, currentPrice: number): boolean {
  const target = Number(order.targetPrice || 0);
  if (!target) return false;

  if (order.type === 'limit') {
    return order.side === 'buy' ? currentPrice <= target : currentPrice >= target;
  }

  if (order.type === 'stop') {
    return order.side === 'buy' ? currentPrice >= target : currentPrice <= target;
  }

  return true;
}

function getPositionExit(position: ManualSimPosition, currentPrice: number): { price: number; reason: string } | null {
  if (position.side === 'buy') {
    if (position.takeProfit && currentPrice >= position.takeProfit) {
      return { price: position.takeProfit, reason: '触发止盈，自动平仓' };
    }
    if (position.stopLoss && currentPrice <= position.stopLoss) {
      return { price: position.stopLoss, reason: '触发止损，自动平仓' };
    }
    return null;
  }

  if (position.takeProfit && currentPrice <= position.takeProfit) {
    return { price: position.takeProfit, reason: '触发止盈，自动平仓' };
  }
  if (position.stopLoss && currentPrice >= position.stopLoss) {
    return { price: position.stopLoss, reason: '触发止损，自动平仓' };
  }
  return null;
}

function closePositionAt(
  account: ManualSimAccountDocument,
  position: ManualSimPosition,
  exitPrice: number,
  reason: string
): void {
  const pnl = calculatePnl(position.side, position.entryPrice, exitPrice, position.lots);
  account.balance = roundMoney(account.balance + pnl);
  account.realizedPnl = roundMoney(account.realizedPnl + pnl);
  account.positions = account.positions.filter((item) => item.positionId !== position.positionId);
  pushLog(account, 'close', reason, {
    positionId: position.positionId,
    side: position.side,
    lots: position.lots,
    price: roundMoney(exitPrice),
    pnl,
  });
}

function processProtectiveExits(account: ManualSimAccountDocument, currentPrice: number): void {
  const positions = [...(account.positions || [])];

  for (const position of positions) {
    const exit = getPositionExit(position, currentPrice);
    if (!exit) continue;
    closePositionAt(account, position, exit.price, exit.reason);
  }

  markToMarket(account, currentPrice);
}

function syncAccountWithMarket(account: ManualSimAccountDocument, currentPrice: number): void {
  processPendingOrders(account, currentPrice);
  processProtectiveExits(account, currentPrice);
  markToMarket(account, currentPrice);
}

function processPendingOrders(account: ManualSimAccountDocument, currentPrice: number): void {
  const activeOrders: ManualSimOrder[] = [];

  for (const order of account.pendingOrders || []) {
    if (order.status !== 'pending') continue;

    if (!shouldTrigger(order, currentPrice)) {
      activeOrders.push(order);
      continue;
    }

    try {
      createPosition(
        account,
        order.side,
        order.lots,
        currentPrice,
        `${order.type === 'limit' ? '限价' : '突破'}预下单触发成交`,
        order.stopLoss,
        order.takeProfit,
        order.orderId
      );
      order.status = 'filled';
      order.filledAt = new Date();
      order.filledPrice = roundMoney(currentPrice);
    } catch (error) {
      order.status = 'rejected';
      pushLog(account, 'cancel', error instanceof Error ? error.message : '预下单成交失败', {
        orderId: order.orderId,
        side: order.side,
        lots: order.lots,
        price: currentPrice,
      });
    }
  }

  account.pendingOrders = activeOrders;
  markToMarket(account, currentPrice);
}

async function getQuote() {
  const quote = await marketDataService.getPriceQuote();
  return {
    ...quote,
    price: roundMoney(quote.price),
  };
}

async function loadAccount(userAccountId: string) {
  const [account, quote] = await Promise.all([
    ensureManualAccount(userAccountId),
    getQuote(),
  ]);

  syncAccountWithMarket(account, quote.price);
  await account.save();

  return { account, quote };
}

export async function getManualSimAccount(req: Request, res: Response): Promise<void> {
  try {
    const userAccountId = getUserAccountId(req);
    if (!userAccountId) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const result = await loadAccount(userAccountId);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('[ManualSim] 获取手动模拟账户失败:', error);
    res.status(500).json({ success: false, message: '获取手动模拟账户失败' });
  }
}

export async function placeManualSimOrder(req: Request, res: Response): Promise<void> {
  try {
    const userAccountId = getUserAccountId(req);
    if (!userAccountId) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const account = await ensureManualAccount(userAccountId);
    const quote = await getQuote();
    syncAccountWithMarket(account, quote.price);

    const type = normalizeOrderType(req.body?.type);
    const side = normalizeSide(req.body?.side);
    const lots = normalizeLots(req.body?.lots);
    const targetPrice = normalizeOptionalPrice(req.body?.targetPrice);
    const stopLoss = normalizeOptionalPrice(req.body?.stopLoss);
    const takeProfit = normalizeOptionalPrice(req.body?.takeProfit);
    const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 120) : '';

    if (type === 'market') {
      createPosition(account, side, lots, quote.price, note || '手动市价开仓', stopLoss, takeProfit);
    } else {
      if (!targetPrice) {
        res.status(400).json({ success: false, message: '预下单必须填写触发价格' });
        return;
      }

      const order: ManualSimOrder = {
        orderId: createId('ord'),
        symbol: SYMBOL,
        type,
        side,
        lots,
        contractSize: CONTRACT_SIZE,
        targetPrice,
        stopLoss,
        takeProfit,
        status: 'pending',
        createdAt: new Date(),
        note: note || '手动预下单',
      };
      account.pendingOrders.unshift(order);
      pushLog(account, 'open', `${type === 'limit' ? '限价' : '突破'}预下单已创建`, {
        orderId: order.orderId,
        side,
        lots,
        price: targetPrice,
      });
    }

    markToMarket(account, quote.price);
    await account.save();
    await logTradeAction(req, 'trade_open', type === 'market' ? 'market_order' : 'pending_order', { type, side, lots, targetPrice });
    res.json({ success: true, data: { account, quote } });
  } catch (error) {
    logger.error('[ManualSim] 下单失败:', error);
    res.status(400).json({ success: false, message: error instanceof Error ? error.message : '下单失败' });
  }
}

export async function closeManualSimPosition(req: Request, res: Response): Promise<void> {
  try {
    const userAccountId = getUserAccountId(req);
    if (!userAccountId) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const account = await ensureManualAccount(userAccountId);
    const quote = await getQuote();
    syncAccountWithMarket(account, quote.price);
    const positionId = String(req.params.positionId || '');
    const position = account.positions.find((item) => item.positionId === positionId);

    if (!position) {
      res.status(404).json({ success: false, message: '持仓不存在' });
      return;
    }

    closePositionAt(account, position, quote.price, '手动平仓');
    markToMarket(account, quote.price);
    await account.save();
    await logTradeAction(req, 'trade_close', 'close_position', { positionId, pnl: calculatePnl(position.side, position.entryPrice, quote.price, position.lots) });
    res.json({ success: true, data: { account, quote } });
  } catch (error) {
    logger.error('[ManualSim] 平仓失败:', error);
    res.status(500).json({ success: false, message: '平仓失败' });
  }
}

export async function cancelManualSimOrder(req: Request, res: Response): Promise<void> {
  try {
    const userAccountId = getUserAccountId(req);
    if (!userAccountId) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const account = await ensureManualAccount(userAccountId);
    const quote = await getQuote();
    syncAccountWithMarket(account, quote.price);
    const orderId = String(req.params.orderId || '');
    const order = account.pendingOrders.find((item) => item.orderId === orderId);

    if (!order) {
      res.status(404).json({ success: false, message: '预下单不存在' });
      return;
    }

    account.pendingOrders = account.pendingOrders.filter((item) => item.orderId !== orderId);
    pushLog(account, 'cancel', '手动取消预下单', {
      orderId,
      side: order.side,
      lots: order.lots,
      price: order.targetPrice,
    });
    markToMarket(account, quote.price);
    await account.save();
    await logTradeAction(req, 'trade_cancel', 'cancel_order', { orderId });
    res.json({ success: true, data: { account, quote } });
  } catch (error) {
    logger.error('[ManualSim] 取消预下单失败:', error);
    res.status(500).json({ success: false, message: '取消预下单失败' });
  }
}

export async function settleManualSimAccount(req: Request, res: Response): Promise<void> {
  try {
    const userAccountId = getUserAccountId(req);
    if (!userAccountId) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const result = await loadAccount(userAccountId);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('[ManualSim] 刷新模拟账户失败:', error);
    res.status(500).json({ success: false, message: '刷新模拟账户失败' });
  }
}

export async function resetManualSimAccount(req: Request, res: Response): Promise<void> {
  try {
    const userAccountId = getUserAccountId(req);
    if (!userAccountId) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    await ManualSimAccountModel.deleteOne({ userAccountId });
    const result = await loadAccount(userAccountId);
    await logTradeAction(req, 'trade_reset', 'reset_account');
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('[ManualSim] 重置模拟账户失败:', error);
    res.status(500).json({ success: false, message: '重置模拟账户失败' });
  }
}
