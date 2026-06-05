import type { Request, Response } from 'express';
import { AnalysisReportModel, BacktestRunModel, PaperAccountModel } from '../models';
import type { AnalysisReportDocument } from '../models/AnalysisReport';
import type { EquitySnapshot, PaperAccountDocument, PaperProfileId, PaperTrade } from '../models/PaperAccount';
import { marketDataService } from '../services/marketData';
import { logger } from '../utils/logger';

interface RiskProfile {
  profileId: PaperProfileId;
  name: string;
  description: string;
  riskPerTradePct: number;
  maxPositionPct: number;
  minConfidence: number;
  maxRiskScore: number;
  stopMultiplier: number;
  rewardRisk: number;
}

const INITIAL_BALANCE = 10000;
const EQUITY_SNAPSHOT_LIMIT = 2880;
export const PAPER_TRADING_AUTO_INTERVAL_MS = 60 * 1000;

export interface PaperTradingAutoStatus {
  enabled: boolean;
  intervalMs: number;
  lastRunAt?: string;
  lastPrice?: number;
  lastSource?: string;
  usersProcessed: number;
  reportsEvaluated: number;
  opened: number;
  closed: number;
  marked: number;
  skipped: number;
  held: number;
  alreadyEvaluated: number;
  errors: string[];
}

const emptyAutoStatus = (): PaperTradingAutoStatus => ({
  enabled: true,
  intervalMs: PAPER_TRADING_AUTO_INTERVAL_MS,
  usersProcessed: 0,
  reportsEvaluated: 0,
  opened: 0,
  closed: 0,
  marked: 0,
  skipped: 0,
  held: 0,
  alreadyEvaluated: 0,
  errors: [],
});

let paperTradingAutoStatus: PaperTradingAutoStatus = emptyAutoStatus();

const RISK_PROFILES: RiskProfile[] = [
  {
    profileId: 'conservative',
    name: '保守型',
    description: '低仓位，只在置信度较高且风险较低时交易',
    riskPerTradePct: 0.5,
    maxPositionPct: 20,
    minConfidence: 45,
    maxRiskScore: 55,
    stopMultiplier: 0.8,
    rewardRisk: 1.2,
  },
  {
    profileId: 'balanced',
    name: '稳健型',
    description: '中低仓位，趋势确认后参与',
    riskPerTradePct: 1,
    maxPositionPct: 35,
    minConfidence: 30,
    maxRiskScore: 70,
    stopMultiplier: 1,
    rewardRisk: 1.5,
  },
  {
    profileId: 'aggressive',
    name: '进取型',
    description: '较高仓位，允许更频繁地跟随 AI 方向',
    riskPerTradePct: 2,
    maxPositionPct: 60,
    minConfidence: 18,
    maxRiskScore: 85,
    stopMultiplier: 1.2,
    rewardRisk: 2,
  },
  {
    profileId: 'event',
    name: '事件型',
    description: '偏向事件驱动交易，风险限制介于稳健和进取之间',
    riskPerTradePct: 1.2,
    maxPositionPct: 40,
    minConfidence: 25,
    maxRiskScore: 80,
    stopMultiplier: 1.1,
    rewardRisk: 1.8,
  },
];

function getUserAccountId(req: Request): string | null {
  return req.user?.accountId || null;
}

async function ensurePaperAccounts(userAccountId: string): Promise<PaperAccountDocument[]> {
  for (const profile of RISK_PROFILES) {
    const existing = await PaperAccountModel.findOne({
      userAccountId,
      profileId: profile.profileId,
    });

    if (!existing) {
      await PaperAccountModel.create({
        userAccountId,
        profileId: profile.profileId,
        name: profile.name,
        description: profile.description,
        riskPerTradePct: profile.riskPerTradePct,
        maxPositionPct: profile.maxPositionPct,
        minConfidence: profile.minConfidence,
        maxRiskScore: profile.maxRiskScore,
        balance: INITIAL_BALANCE,
        equity: INITIAL_BALANCE,
        realizedPnl: 0,
        tradeLog: [],
      });
    }
  }

  return PaperAccountModel.find({ userAccountId }).sort({ profileId: 1 });
}

function getProfile(profileId: PaperProfileId): RiskProfile {
  return RISK_PROFILES.find((profile) => profile.profileId === profileId) || RISK_PROFILES[1];
}

function getReportDirection(report: AnalysisReportDocument | any): 'long' | 'short' {
  const upProb = Number(report.result?.probability?.upProb || 0);
  const downProb = Number(report.result?.probability?.downProb || 0);
  return upProb >= downProb ? 'long' : 'short';
}

function getConfidence(report: AnalysisReportDocument | any): number {
  const upProb = Number(report.result?.probability?.upProb || 0);
  const downProb = Number(report.result?.probability?.downProb || 0);
  return Math.abs(upProb - downProb);
}

function calculatePnl(direction: 'long' | 'short', entryPrice: number, exitPrice: number, volume: number): number {
  const diff = direction === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice;
  return Number((diff * volume).toFixed(2));
}

function buildTrade(
  account: PaperAccountDocument,
  report: AnalysisReportDocument | any,
  profile: RiskProfile,
  executionPrice?: number
): PaperTrade {
  const direction = getReportDirection(report);
  const confidence = getConfidence(report);
  const rawPrice = executionPrice ?? Number(report.currentPrice || 0);
  const currentPrice = Number.isFinite(rawPrice) ? Number(rawPrice) : 0;
  const aiRisk = Number(report.result?.risk?.risk || 0);
  const baseStopPct = Math.max(Number(report.result?.risk?.stopLoss || 2), 0.5);
  const stopPct = baseStopPct * profile.stopMultiplier;
  const stopDistance = currentPrice * (stopPct / 100);
  const riskBudget = account.balance * (profile.riskPerTradePct / 100);
  const volumeByRisk = riskBudget / Math.max(stopDistance, 0.01);
  const maxNotional = account.balance * (profile.maxPositionPct / 100);
  const volumeByCap = maxNotional / Math.max(currentPrice, 0.01);
  const volume = Number(Math.max(0, Math.min(volumeByRisk, volumeByCap)).toFixed(4));
  const takeDistance = stopDistance * profile.rewardRisk;

  const stopLoss = direction === 'long'
    ? currentPrice - stopDistance
    : currentPrice + stopDistance;
  const takeProfit = direction === 'long'
    ? currentPrice + takeDistance
    : currentPrice - takeDistance;

  const shouldTrade = confidence >= profile.minConfidence && aiRisk <= profile.maxRiskScore && volume > 0;
  const reason = shouldTrade
    ? `${profile.name}执行${direction === 'long' ? '做多' : '做空'}：置信差${confidence}，AI风险${aiRisk}`
    : `${profile.name}跳过：置信差${confidence}/${profile.minConfidence}，AI风险${aiRisk}/${profile.maxRiskScore}`;

  return {
    reportId: report._id.toString(),
    direction,
    status: shouldTrade ? 'open' : 'skipped',
    entryPrice: currentPrice,
    volume: shouldTrade ? volume : 0,
    stopLoss: Number(stopLoss.toFixed(2)),
    takeProfit: Number(takeProfit.toFixed(2)),
    pnl: 0,
    reason,
    openedAt: new Date(),
  };
}

function markAccountToMarket(account: PaperAccountDocument, currentPrice: number): void {
  const openTrade = account.openTrade;
  if (!openTrade || openTrade.status !== 'open') {
    account.equity = account.balance;
    return;
  }

  const unrealized = calculatePnl(openTrade.direction, openTrade.entryPrice, currentPrice, openTrade.volume);
  account.equity = Number((account.balance + unrealized).toFixed(2));
}

function appendEquitySnapshot(
  account: PaperAccountDocument,
  currentPrice: number,
  reason: string,
  force = false
): void {
  const now = new Date();
  const latestSnapshot = account.equitySnapshots?.[0];
  const latestSnapshotTime = latestSnapshot?.time ? new Date(latestSnapshot.time).getTime() : 0;

  if (!force && latestSnapshotTime && now.getTime() - latestSnapshotTime < 55 * 1000) {
    return;
  }

  const openTrade = account.openTrade?.status === 'open' ? account.openTrade : undefined;
  const unrealizedPnl = openTrade
    ? calculatePnl(openTrade.direction, openTrade.entryPrice, currentPrice, openTrade.volume)
    : 0;

  const snapshot: EquitySnapshot = {
    time: now,
    price: Number(currentPrice.toFixed(2)),
    balance: Number((account.balance || 0).toFixed(2)),
    equity: Number((account.equity || 0).toFixed(2)),
    realizedPnl: Number((account.realizedPnl || 0).toFixed(2)),
    unrealizedPnl,
    reason,
  };

  if (openTrade) {
    snapshot.openDirection = openTrade.direction;
    snapshot.openVolume = openTrade.volume;
  }

  account.equitySnapshots = [snapshot, ...(account.equitySnapshots || [])].slice(0, EQUITY_SNAPSHOT_LIMIT);
}

function closeOpenTrade(account: PaperAccountDocument, currentPrice: number, reason: string): void {
  const openTrade = account.openTrade;
  if (!openTrade || openTrade.status !== 'open') {
    return;
  }

  const pnl = calculatePnl(openTrade.direction, openTrade.entryPrice, currentPrice, openTrade.volume);
  const closedTrade: PaperTrade = {
    ...openTrade,
    status: 'closed',
    exitPrice: currentPrice,
    pnl,
    reason,
    closedAt: new Date(),
  };

  account.realizedPnl = Number((account.realizedPnl + pnl).toFixed(2));
  account.balance = Number((account.balance + pnl).toFixed(2));
  account.equity = account.balance;
  account.tradeLog = [closedTrade, ...account.tradeLog].slice(0, 100);
  account.openTrade = undefined;
}

function getSettlementPriceAndReason(openTrade: PaperTrade, currentPrice: number): { price: number; reason: string } | null {
  if (openTrade.status !== 'open') {
    return null;
  }

  if (openTrade.direction === 'long') {
    if (currentPrice >= openTrade.takeProfit) {
      return { price: openTrade.takeProfit, reason: '触发止盈，自动平仓' };
    }
    if (currentPrice <= openTrade.stopLoss) {
      return { price: openTrade.stopLoss, reason: '触发止损，自动平仓' };
    }
    return null;
  }

  if (currentPrice <= openTrade.takeProfit) {
    return { price: openTrade.takeProfit, reason: '触发止盈，自动平仓' };
  }
  if (currentPrice >= openTrade.stopLoss) {
    return { price: openTrade.stopLoss, reason: '触发止损，自动平仓' };
  }

  return null;
}

export async function settlePaperAccounts(userAccountId: string, currentPrice?: number) {
  const price = currentPrice ?? await marketDataService.getPrice();
  const accounts = await ensurePaperAccounts(userAccountId);
  const settlements = [];

  for (const account of accounts) {
    const openTrade = account.openTrade;
    if (!openTrade || openTrade.status !== 'open') {
      account.equity = account.balance;
      appendEquitySnapshot(account, price, '空仓，记录实时权益');
      await account.save();
      continue;
    }

    const settlement = getSettlementPriceAndReason(openTrade, price);
    if (settlement) {
      closeOpenTrade(account, settlement.price, settlement.reason);
      appendEquitySnapshot(account, settlement.price, settlement.reason, true);
      settlements.push({
        profileId: account.profileId,
        name: account.name,
        action: 'closed',
        direction: openTrade.direction,
        exitPrice: settlement.price,
        reason: settlement.reason,
      });
    } else {
      markAccountToMarket(account, price);
      appendEquitySnapshot(account, price, '持仓按实时价更新权益');
      settlements.push({
        profileId: account.profileId,
        name: account.name,
        action: 'mark',
        direction: openTrade.direction,
        reason: '未触发止盈止损，按当前价更新权益',
      });
    }

    await account.save();
  }

  const updatedAccounts = await PaperAccountModel.find({ userAccountId }).sort({ profileId: 1 }).lean();
  return { price, settlements, accounts: updatedAccounts };
}

export async function executePaperTradingForReport(userAccountId: string, reportId?: string, executionPrice?: number) {
  const report = reportId
    ? await AnalysisReportModel.findOne({ _id: reportId, userAccountId })
    : await AnalysisReportModel.findOne({ userAccountId }).sort({ createdAt: -1 });

  if (!report) {
    throw new Error('还没有AI分析报告，请先运行AI分析');
  }

  const rawCurrentPrice = Number(executionPrice ?? report.currentPrice);
  const currentPrice = Number.isFinite(rawCurrentPrice) && rawCurrentPrice > 0
    ? rawCurrentPrice
    : await marketDataService.getPrice();
  const settlementResult = await settlePaperAccounts(userAccountId, currentPrice);
  const accounts = await ensurePaperAccounts(userAccountId);
  const currentReportId = report._id.toString();
  const decisions = [];

  for (const account of accounts) {
    const alreadyEvaluated = account.tradeLog?.some((trade) => trade.reportId === currentReportId);

    if (alreadyEvaluated) {
      markAccountToMarket(account, currentPrice);
      decisions.push({
        profileId: account.profileId,
        name: account.name,
        action: 'already_evaluated',
        reason: '这份AI报告已经评估过，未重复写入交易记录',
      });
      await account.save();
      continue;
    }

    const profile = getProfile(account.profileId);
    const nextTrade = buildTrade(account, report, profile, currentPrice);

    if (account.openTrade?.status === 'open') {
      if (account.openTrade.direction !== nextTrade.direction && nextTrade.status === 'open') {
        closeOpenTrade(account, currentPrice, 'AI方向反转，先平旧仓');
      } else {
        markAccountToMarket(account, currentPrice);
        const unrealizedPnl = calculatePnl(
          account.openTrade.direction,
          account.openTrade.entryPrice,
          currentPrice,
          account.openTrade.volume
        );
        const heldTrade: PaperTrade = {
          reportId: currentReportId,
          direction: account.openTrade.direction,
          status: 'held',
          entryPrice: account.openTrade.entryPrice,
          exitPrice: currentPrice,
          volume: account.openTrade.volume,
          stopLoss: account.openTrade.stopLoss,
          takeProfit: account.openTrade.takeProfit,
          pnl: unrealizedPnl,
          reason: '已有同向持仓，继续观察',
          openedAt: new Date(),
        };
        account.tradeLog = [heldTrade, ...account.tradeLog].slice(0, 100);
        appendEquitySnapshot(account, currentPrice, '同向持仓继续观察', true);
        decisions.push({
          profileId: account.profileId,
          name: account.name,
          action: 'hold',
          reason: '已有同向持仓，继续观察',
        });
        await account.save();
        continue;
      }
    }

    if (nextTrade.status === 'open') {
      account.openTrade = nextTrade;
    }

    account.tradeLog = [nextTrade, ...account.tradeLog].slice(0, 100);
    markAccountToMarket(account, currentPrice);
    appendEquitySnapshot(account, currentPrice, nextTrade.reason, true);
    await account.save();

    decisions.push({
      profileId: account.profileId,
      name: account.name,
      action: nextTrade.status === 'open' ? 'open' : 'skip',
      direction: nextTrade.direction,
      volume: nextTrade.volume,
      reason: nextTrade.reason,
    });
  }

  const updatedAccounts = await PaperAccountModel.find({ userAccountId }).sort({ profileId: 1 }).lean();
  return {
    report,
    decisions,
    settlements: settlementResult.settlements,
    price: currentPrice,
    accounts: updatedAccounts,
  };
}

function countDecision(status: PaperTradingAutoStatus, action?: string): void {
  if (action === 'open') {
    status.opened += 1;
  } else if (action === 'skip') {
    status.skipped += 1;
  } else if (action === 'hold') {
    status.held += 1;
  } else if (action === 'already_evaluated') {
    status.alreadyEvaluated += 1;
  }
}

function countSettlement(status: PaperTradingAutoStatus, action?: string): void {
  if (action === 'closed') {
    status.closed += 1;
  } else if (action === 'mark') {
    status.marked += 1;
  }
}

async function getPaperTradingUserAccountIds(): Promise<string[]> {
  const [accountUserIds, reportUserIds] = await Promise.all([
    PaperAccountModel.distinct('userAccountId'),
    AnalysisReportModel.distinct('userAccountId'),
  ]);

  return Array.from(new Set([...accountUserIds, ...reportUserIds]))
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
}

export function getPaperTradingAutoStatus(): PaperTradingAutoStatus {
  return { ...paperTradingAutoStatus, errors: [...paperTradingAutoStatus.errors] };
}

export async function runRealtimePaperTradingTick(): Promise<PaperTradingAutoStatus> {
  const status = {
    ...emptyAutoStatus(),
    lastRunAt: new Date().toISOString(),
  };

  try {
    const userAccountIds = await getPaperTradingUserAccountIds();
    status.usersProcessed = userAccountIds.length;

    if (userAccountIds.length === 0) {
      paperTradingAutoStatus = status;
      return getPaperTradingAutoStatus();
    }

    const quote = await marketDataService.getPriceQuote();
    status.lastPrice = quote.price;
    status.lastSource = quote.source;

    for (const userAccountId of userAccountIds) {
      const latestReport = await AnalysisReportModel.findOne({ userAccountId }).sort({ createdAt: -1 });

      if (latestReport) {
        status.reportsEvaluated += 1;
        const result = await executePaperTradingForReport(userAccountId, latestReport._id.toString(), quote.price);
        result.settlements.forEach((settlement) => countSettlement(status, settlement.action));
        result.decisions.forEach((decision) => countDecision(status, decision.action));
      } else {
        const settlementResult = await settlePaperAccounts(userAccountId, quote.price);
        settlementResult.settlements.forEach((settlement) => countSettlement(status, settlement.action));
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '自动实时模拟交易失败';
    status.errors.push(message);
    logger.error('[Research] 自动实时模拟交易失败:', error);
  }

  paperTradingAutoStatus = status;
  return getPaperTradingAutoStatus();
}

export async function getAnalysisReports(req: Request, res: Response): Promise<void> {
  try {
    const userAccountId = getUserAccountId(req);
    if (!userAccountId) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const limit = Math.min(Number(req.query.limit || 20), 100);
    const reports = await AnalysisReportModel.find({ userAccountId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ success: true, data: { reports } });
  } catch (error) {
    logger.error('[Research] 获取AI报告失败:', error);
    res.status(500).json({ success: false, message: '获取AI报告失败' });
  }
}

export async function getPaperAccounts(req: Request, res: Response): Promise<void> {
  try {
    const userAccountId = getUserAccountId(req);
    if (!userAccountId) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const result = await settlePaperAccounts(userAccountId);

    res.json({ success: true, data: { accounts: result.accounts, settlements: result.settlements, price: result.price } });
  } catch (error) {
    logger.error('[Research] 获取模拟账号失败:', error);
    res.status(500).json({ success: false, message: '获取模拟账号失败' });
  }
}

export async function settlePaperAccountsEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const userAccountId = getUserAccountId(req);
    if (!userAccountId) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const result = await settlePaperAccounts(userAccountId);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('[Research] 结算模拟持仓失败:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '结算模拟持仓失败',
    });
  }
}

export async function executePaperTrading(req: Request, res: Response): Promise<void> {
  try {
    const userAccountId = getUserAccountId(req);
    if (!userAccountId) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const reportId = req.body?.reportId;
    const result = await executePaperTradingForReport(userAccountId, reportId);
    res.json({
      success: true,
      data: {
        reportId: result.report._id,
        decisions: result.decisions,
        accounts: result.accounts,
      },
    });
  } catch (error) {
    logger.error('[Research] 执行模拟交易失败:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '执行模拟交易失败',
    });
  }
}

export async function resetPaperAccounts(req: Request, res: Response): Promise<void> {
  try {
    const userAccountId = getUserAccountId(req);
    if (!userAccountId) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    await PaperAccountModel.deleteMany({ userAccountId });
    const accounts = await ensurePaperAccounts(userAccountId);
    res.json({ success: true, data: { accounts } });
  } catch (error) {
    logger.error('[Research] 重置模拟账号失败:', error);
    res.status(500).json({ success: false, message: '重置模拟账号失败' });
  }
}

interface BacktestOptions {
  exitBars: number;
  slippagePct: number;
  commissionPct: number;
  stopScale: number;
  rewardRiskScale: number;
}

interface BacktestStressCase {
  label: string;
  options: BacktestOptions;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

function getCandleTime(candle: any, fallbackSeconds: number): number {
  if (!candle?.time) {
    return fallbackSeconds;
  }

  if (typeof candle.time === 'number') {
    return candle.time > 1_000_000_000_000 ? Math.floor(candle.time / 1000) : candle.time;
  }

  const timestamp = new Date(candle.time).getTime();
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : fallbackSeconds;
}

function getExecutionPrice(direction: 'long' | 'short', price: number, slippagePct: number, side: 'entry' | 'exit'): number {
  const slippage = slippagePct / 100;
  if (direction === 'long') {
    return side === 'entry' ? price * (1 + slippage) : price * (1 - slippage);
  }
  return side === 'entry' ? price * (1 - slippage) : price * (1 + slippage);
}

function calculateTradeExecution(
  direction: 'long' | 'short',
  rawEntry: number,
  rawExit: number,
  volume: number,
  options: BacktestOptions
) {
  const entry = getExecutionPrice(direction, rawEntry, options.slippagePct, 'entry');
  const exit = getExecutionPrice(direction, rawExit, options.slippagePct, 'exit');
  const grossPnl = calculatePnl(direction, entry, exit, volume);
  const tradedNotional = (Math.abs(entry) + Math.abs(exit)) * volume;
  const cost = tradedNotional * (options.commissionPct / 100);
  const pnl = Number((grossPnl - cost).toFixed(2));

  return {
    entry: Number(entry.toFixed(2)),
    exit: Number(exit.toFixed(2)),
    grossPnl: Number(grossPnl.toFixed(2)),
    cost: Number(cost.toFixed(2)),
    pnl,
  };
}

function calculateProfitFactor(trades: Array<{ pnl: number }>): number {
  const grossProfit = trades
    .filter((trade) => trade.pnl > 0)
    .reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(trades
    .filter((trade) => trade.pnl < 0)
    .reduce((sum, trade) => sum + trade.pnl, 0));

  if (grossProfit > 0 && grossLoss === 0) {
    return 99;
  }
  if (grossProfit === 0 && grossLoss === 0) {
    return 0;
  }
  return Number((grossProfit / Math.max(grossLoss, 0.01)).toFixed(2));
}

function simulateProfileBacktest(
  profile: RiskProfile,
  candles: any[],
  report: AnalysisReportDocument | any,
  options: BacktestOptions
) {
  const direction = getReportDirection(report);
  const confidence = getConfidence(report);
  const aiRisk = Number(report.result?.risk?.risk || 0);
  const baseStopPct = Math.max(Number(report.result?.risk?.stopLoss || 2), 0.5);
  const shouldTrade = confidence >= profile.minConfidence && aiRisk <= profile.maxRiskScore;
  let balance = INITIAL_BALANCE;
  let peak = INITIAL_BALANCE;
  let maxDrawdown = 0;
  const trades: any[] = [];
  const startTime = getCandleTime(candles[0], Math.floor(Date.now() / 1000));
  const equityCurve = [
    {
      time: startTime,
      equity: INITIAL_BALANCE,
      drawdownPct: 0,
    },
  ];

  if (!shouldTrade || candles.length < 30) {
    return {
      profileId: profile.profileId,
      name: profile.name,
      trades: 0,
      winRate: 0,
      netPnl: 0,
      maxDrawdown: 0,
      endingBalance: balance,
      profitFactor: 0,
      avgWin: 0,
      avgLoss: 0,
      expectancy: 0,
      totalCost: 0,
      robustnessScore: 0,
      equityCurve,
      stressTests: [],
      sampleWarning: true,
      note: shouldTrade ? 'K线数量不足' : 'AI置信度或风险不满足该账号规则',
    };
  }

  for (let i = 20; i < candles.length - options.exitBars; i += options.exitBars) {
    const window = candles.slice(i - 20, i);
    const ma20 = average(window.map((c) => Number(c.close)));
    const rawEntry = Number(candles[i].close);
    const trendOk = direction === 'long' ? rawEntry > ma20 : rawEntry < ma20;

    if (!trendOk) {
      continue;
    }

    const stopPct = baseStopPct * profile.stopMultiplier * options.stopScale;
    const stopDistance = rawEntry * (stopPct / 100);
    const takeDistance = stopDistance * profile.rewardRisk * options.rewardRiskScale;
    const stopPrice = direction === 'long' ? rawEntry - stopDistance : rawEntry + stopDistance;
    const takePrice = direction === 'long' ? rawEntry + takeDistance : rawEntry - takeDistance;
    const riskBudget = balance * (profile.riskPerTradePct / 100);
    const volumeByRisk = riskBudget / Math.max(stopDistance, 0.01);
    const volumeByCap = (balance * (profile.maxPositionPct / 100)) / Math.max(rawEntry, 0.01);
    const volume = Math.min(volumeByRisk, volumeByCap);
    const exitIndex = Math.min(i + options.exitBars, candles.length - 1);
    let rawExit = Number(candles[exitIndex].close);
    let exitReason = 'time';

    for (let j = i + 1; j <= exitIndex; j++) {
      const high = Number(candles[j].high);
      const low = Number(candles[j].low);

      if (direction === 'long') {
        if (low <= stopPrice) {
          rawExit = stopPrice;
          exitReason = 'stop';
          break;
        }
        if (high >= takePrice) {
          rawExit = takePrice;
          exitReason = 'take';
          break;
        }
      } else {
        if (high >= stopPrice) {
          rawExit = stopPrice;
          exitReason = 'stop';
          break;
        }
        if (low <= takePrice) {
          rawExit = takePrice;
          exitReason = 'take';
          break;
        }
      }
    }

    const execution = calculateTradeExecution(direction, rawEntry, rawExit, volume, options);
    const pnl = execution.pnl;
    balance = Number((balance + pnl).toFixed(2));
    peak = Math.max(peak, balance);
    maxDrawdown = Math.max(maxDrawdown, ((peak - balance) / peak) * 100);
    const drawdownPct = Number((((peak - balance) / peak) * 100).toFixed(2));
    const closeTime = getCandleTime(candles[exitIndex], startTime + trades.length * 60);

    equityCurve.push({
      time: closeTime,
      equity: balance,
      drawdownPct,
    });
    trades.push({
      entry: execution.entry,
      exit: execution.exit,
      rawEntry: Number(rawEntry.toFixed(2)),
      rawExit: Number(rawExit.toFixed(2)),
      volume: Number(volume.toFixed(4)),
      pnl,
      grossPnl: execution.grossPnl,
      cost: execution.cost,
      exitReason,
      closedAt: closeTime,
      balance,
    });
  }

  const wins = trades.filter((trade) => trade.pnl > 0).length;
  const winTrades = trades.filter((trade) => trade.pnl > 0);
  const lossTrades = trades.filter((trade) => trade.pnl < 0);
  const netPnl = Number((balance - INITIAL_BALANCE).toFixed(2));
  const avgWin = winTrades.length ? average(winTrades.map((trade) => trade.pnl)) : 0;
  const avgLoss = lossTrades.length ? average(lossTrades.map((trade) => Math.abs(trade.pnl))) : 0;
  const avgPnl = trades.length ? average(trades.map((trade) => trade.pnl)) : 0;
  const totalCost = trades.reduce((sum, trade) => sum + trade.cost, 0);
  const profitFactor = calculateProfitFactor(trades);

  return {
    profileId: profile.profileId,
    name: profile.name,
    direction,
    trades: trades.length,
    winRate: trades.length ? Number(((wins / trades.length) * 100).toFixed(1)) : 0,
    netPnl,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    endingBalance: balance,
    profitFactor,
    avgWin: Number(avgWin.toFixed(2)),
    avgLoss: Number(avgLoss.toFixed(2)),
    expectancy: Number(avgPnl.toFixed(2)),
    totalCost: Number(totalCost.toFixed(2)),
    robustnessScore: 0,
    equityCurve,
    stressTests: [],
    sampleWarning: trades.length < 30,
    sampleTrades: trades.slice(-5),
    note: trades.length < 30
      ? '样本量偏少：结果只能做演示参考'
      : 'AI方向 + MA20趋势过滤 + 固定止盈止损 + 滑点手续费',
  };
}

function summarizeStressResult(label: string, result: any) {
  const passed = result.trades >= 5 && result.netPnl >= 0 && result.profitFactor >= 1;
  return {
    label,
    passed,
    trades: result.trades,
    winRate: result.winRate,
    netPnl: result.netPnl,
    maxDrawdown: result.maxDrawdown,
    profitFactor: result.profitFactor,
  };
}

function runProfileBacktest(
  profile: RiskProfile,
  candles: any[],
  report: AnalysisReportDocument | any,
  options: BacktestOptions
) {
  const baseline = simulateProfileBacktest(profile, candles, report, options);
  const stressCases: BacktestStressCase[] = [
    {
      label: '滑点加倍',
      options: { ...options, slippagePct: Number((options.slippagePct * 2).toFixed(4)) },
    },
    {
      label: '手续费加倍',
      options: { ...options, commissionPct: Number((options.commissionPct * 2).toFixed(4)) },
    },
    {
      label: '止损缩窄25%',
      options: { ...options, stopScale: 0.75 },
    },
    {
      label: '盈亏比降低20%',
      options: { ...options, rewardRiskScale: 0.8 },
    },
  ];

  const stressTests = stressCases.map((item) => (
    summarizeStressResult(item.label, simulateProfileBacktest(profile, candles, report, item.options))
  ));
  const passedCount = stressTests.filter((item) => item.passed).length;

  return {
    ...baseline,
    stressTests,
    robustnessScore: stressTests.length ? Number(((passedCount / stressTests.length) * 100).toFixed(0)) : 0,
  };
}

export async function runBacktest(req: Request, res: Response): Promise<void> {
  try {
    const userAccountId = getUserAccountId(req);
    if (!userAccountId) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const {
      reportId,
      period = '1m',
      limit = 240,
      exitBars,
      slippagePct,
      commissionPct,
    } = req.body || {};
    const backtestOptions: BacktestOptions = {
      exitBars: Math.round(clampNumber(exitBars, 3, 48, 8)),
      slippagePct: clampNumber(slippagePct, 0, 0.5, 0.03),
      commissionPct: clampNumber(commissionPct, 0, 0.5, 0.01),
      stopScale: 1,
      rewardRiskScale: 1,
    };
    const report = reportId
      ? await AnalysisReportModel.findOne({ _id: reportId, userAccountId })
      : await AnalysisReportModel.findOne({ userAccountId }).sort({ createdAt: -1 });

    if (!report) {
      res.status(400).json({ success: false, message: '还没有AI分析报告，请先运行AI分析' });
      return;
    }

    const candleLimit = Math.round(clampNumber(limit, 60, 1500, 240));
    const candles = await marketDataService.getCandles(period, candleLimit);
    if (!candles || candles.length < 30) {
      res.status(400).json({ success: false, message: 'K线数量不足，无法回测' });
      return;
    }

    const results = RISK_PROFILES.map((profile) => runProfileBacktest(profile, candles, report, backtestOptions));
    const backtest = await BacktestRunModel.create({
      userAccountId,
      reportId: report._id.toString(),
      period,
      candleCount: candles.length,
      assumption: [
        '升级回测：沿用选定AI报告方向，不逐根调用大模型',
        '含风险阈值、仓位上限、MA20趋势过滤、止盈止损、滑点、手续费和压力测试',
      ].join('；'),
      config: {
        period,
        limit: candleLimit,
        exitBars: backtestOptions.exitBars,
        slippagePct: backtestOptions.slippagePct,
        commissionPct: backtestOptions.commissionPct,
      },
      results,
    });

    res.json({ success: true, data: { backtest } });
  } catch (error) {
    logger.error('[Research] 回测失败:', error);
    res.status(500).json({ success: false, message: '回测失败' });
  }
}

export async function getBacktests(req: Request, res: Response): Promise<void> {
  try {
    const userAccountId = getUserAccountId(req);
    if (!userAccountId) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const runs = await BacktestRunModel.find({ userAccountId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({ success: true, data: { runs } });
  } catch (error) {
    logger.error('[Research] 获取回测记录失败:', error);
    res.status(500).json({ success: false, message: '获取回测记录失败' });
  }
}

export async function getResearchSummary(req: Request, res: Response): Promise<void> {
  try {
    const userAccountId = getUserAccountId(req);
    if (!userAccountId) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const [latestReport, settlementResult, latestBacktest] = await Promise.all([
      AnalysisReportModel.findOne({ userAccountId }).sort({ createdAt: -1 }).lean(),
      settlePaperAccounts(userAccountId),
      BacktestRunModel.findOne({ userAccountId }).sort({ createdAt: -1 }).lean(),
    ]);

    res.json({
      success: true,
      data: {
        latestReport,
        accounts: settlementResult.accounts,
        settlements: settlementResult.settlements,
        markPrice: settlementResult.price,
        autoTrading: getPaperTradingAutoStatus(),
        latestBacktest,
      },
    });
  } catch (error) {
    logger.error('[Research] 获取研究中心概览失败:', error);
    res.status(500).json({ success: false, message: '获取研究中心概览失败' });
  }
}
