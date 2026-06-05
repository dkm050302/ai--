import type { Request, Response } from 'express';
import {
  AccountModel,
  AnalysisReportModel,
  BacktestRunModel,
  PaperAccountModel,
  StrategyScreenRunModel,
  UserModel,
} from '../models';
import { goldHistoryService } from '../services/goldHistory';
import { runStrategyScreening } from '../services/strategyScreening';
import { logger } from '../utils/logger';

function getUserAccountId(req: Request): string | null {
  return req.user?.accountId || null;
}

function summarizeTrades(accounts: any[]) {
  const trades = accounts.flatMap((account) => (
    (account.tradeLog || []).map((trade: any) => ({
      ...trade,
      profileId: account.profileId,
      accountName: account.name,
    }))
  ));
  const snapshots = accounts.flatMap((account) => account.equitySnapshots || []);
  const closed = trades.filter((trade) => trade.status === 'closed');
  const open = trades.filter((trade) => trade.status === 'open');
  const skipped = trades.filter((trade) => trade.status === 'skipped');
  const held = trades.filter((trade) => trade.status === 'held');
  const realizedPnl = accounts.reduce((sum, account) => sum + Number(account.realizedPnl || 0), 0);
  const totalEquity = accounts.reduce((sum, account) => sum + Number(account.equity || 0), 0);
  const firstTradeTime = trades
    .map((trade) => new Date(trade.openedAt).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0];
  const lastSnapshotTime = snapshots
    .map((snapshot) => new Date(snapshot.time).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];

  return {
    accountCount: accounts.length,
    tradeCount: trades.length,
    openCount: open.length,
    closedCount: closed.length,
    skippedCount: skipped.length,
    heldCount: held.length,
    realizedPnl: Number(realizedPnl.toFixed(2)),
    totalEquity: Number(totalEquity.toFixed(2)),
    firstTradeAt: firstTradeTime ? new Date(firstTradeTime).toISOString() : null,
    lastSnapshotAt: lastSnapshotTime ? new Date(lastSnapshotTime).toISOString() : null,
    message: trades.length
      ? '已有模拟盘交易流水，可用于和长期筛选结果做复盘对照'
      : '暂无模拟盘交易流水',
  };
}

async function summarizeLiveAccount(userAccountId: string) {
  const [accountSnapshots, user] = await Promise.all([
    AccountModel.find({ accountId: userAccountId }).lean(),
    UserModel.findOne({ accountId: userAccountId }).lean(),
  ]);
  const accountInfo = user?.accountInfo;
  const directPositions = accountSnapshots.flatMap((account) => account.positions || []);
  const userPositions = accountInfo?.positions || [];
  const positions = directPositions.length ? directPositions : userPositions;
  const balance = accountSnapshots.reduce((sum, account) => sum + Number(account.balance || 0), 0)
    || Number(accountInfo?.balance || 0);
  const equity = accountSnapshots.reduce((sum, account) => sum + Number(account.equity || 0), 0)
    || Number(accountInfo?.equity || 0);
  const dailyPnl = accountSnapshots.reduce((sum, account) => sum + Number(account.dailyPnl || 0), 0)
    || Number(accountInfo?.dailyPnl || 0);
  const updatedAt = accountSnapshots
    .map((account) => new Date(account.updatedAt).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0] || (user?.updatedAt ? new Date(user.updatedAt).getTime() : 0);

  return {
    snapshotCount: accountSnapshots.length + (accountInfo ? 1 : 0),
    positionCount: positions.length,
    balance: Number(balance.toFixed(2)),
    equity: Number(equity.toFixed(2)),
    dailyPnl: Number(dailyPnl.toFixed(2)),
    updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
    message: positions.length || equity > 0
      ? '已有账户快照/持仓数据，但当前系统还没有完整实盘成交流水模型'
      : '暂无实盘账户快照或持仓数据',
  };
}

export async function getStrategyLabOverview(req: Request, res: Response): Promise<void> {
  try {
    const userAccountId = getUserAccountId(req);
    if (!userAccountId) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const [paperAccounts, liveTrading, historyCaches, latestScreenRun, counts] = await Promise.all([
      PaperAccountModel.find({ userAccountId }).lean(),
      summarizeLiveAccount(userAccountId),
      goldHistoryService.getCacheSummaries(),
      StrategyScreenRunModel.findOne({ userAccountId }).sort({ createdAt: -1 }).lean(),
      Promise.all([
        AnalysisReportModel.countDocuments({ userAccountId }),
        BacktestRunModel.countDocuments({ userAccountId }),
        StrategyScreenRunModel.countDocuments({ userAccountId }),
      ]),
    ]);

    res.json({
      success: true,
      data: {
        historyCaches,
        paperTrading: summarizeTrades(paperAccounts),
        liveTrading,
        aiReportCount: counts[0],
        aiBacktestCount: counts[1],
        strategyScreenCount: counts[2],
        latestScreenRun,
      },
    });
  } catch (error) {
    logger.error('[StrategyLab] 获取策略实验室数据概况失败:', error);
    res.status(500).json({ success: false, message: '获取策略实验室数据概况失败' });
  }
}

export async function runStrategyScreen(req: Request, res: Response): Promise<void> {
  try {
    const userAccountId = getUserAccountId(req);
    if (!userAccountId) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const period = req.body?.period || '1d';
    const limit = Number(req.body?.limit || (period === '1d' ? 1825 : 3000));
    const history = await goldHistoryService.getLongHistory(period, limit);

    if (history.candles.length < 220) {
      res.status(400).json({
        success: false,
        message: '长期黄金历史数据不足，无法做可靠筛选',
        data: { history: history.meta },
      });
      return;
    }

    const output = runStrategyScreening(history.candles, {
      initialBalance: Number(req.body?.initialBalance || 1_000_000),
      riskPerTradePct: Number(req.body?.riskPerTradePct || 1),
      maxPositionPct: Number(req.body?.maxPositionPct || 35),
      slippagePct: Number(req.body?.slippagePct ?? 0.04),
      commissionPct: Number(req.body?.commissionPct ?? 0.01),
    });
    const run = await StrategyScreenRunModel.create({
      userAccountId,
      period: history.meta.period,
      requestedLimit: history.meta.requestedLimit,
      candleCount: history.meta.candleCount,
      dataSource: history.meta.source,
      dataStart: history.meta.startTime ? new Date(history.meta.startTime) : undefined,
      dataEnd: history.meta.endTime ? new Date(history.meta.endTime) : undefined,
      assumption: [
        '长期策略筛选：不调用大模型逐根预测，不使用mock收益数据',
        '入场使用下一根K线开盘价，包含滑点、手续费、训练/验证分段和压力测试',
      ].join('；'),
      config: output.config,
      results: output.results,
      recommendation: output.recommendation,
    });

    res.json({
      success: true,
      data: {
        history: history.meta,
        run,
      },
    });
  } catch (error) {
    logger.error('[StrategyLab] 长期策略筛选失败:', error);
    res.status(500).json({ success: false, message: '长期策略筛选失败' });
  }
}

export async function getStrategyScreenRuns(req: Request, res: Response): Promise<void> {
  try {
    const userAccountId = getUserAccountId(req);
    if (!userAccountId) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const runs = await StrategyScreenRunModel.find({ userAccountId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({ success: true, data: { runs } });
  } catch (error) {
    logger.error('[StrategyLab] 获取长期策略筛选记录失败:', error);
    res.status(500).json({ success: false, message: '获取长期策略筛选记录失败' });
  }
}
