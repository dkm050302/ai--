import type { Request, Response } from 'express';
import { AnalysisReportModel, BacktestRunModel, PaperAccountModel } from '../models';
import type { AnalysisReportDocument } from '../models/AnalysisReport';
import type { PaperAccountDocument, PaperProfileId, PaperTrade } from '../models/PaperAccount';
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

function buildTrade(account: PaperAccountDocument, report: AnalysisReportDocument | any, profile: RiskProfile): PaperTrade {
  const direction = getReportDirection(report);
  const confidence = getConfidence(report);
  const currentPrice = Number(report.currentPrice || 0);
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

    const price = await marketDataService.getPrice();
    const accounts = await ensurePaperAccounts(userAccountId);
    for (const account of accounts) {
      markAccountToMarket(account, price);
      await account.save();
    }

    res.json({ success: true, data: { accounts } });
  } catch (error) {
    logger.error('[Research] 获取模拟账号失败:', error);
    res.status(500).json({ success: false, message: '获取模拟账号失败' });
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
    const report = reportId
      ? await AnalysisReportModel.findOne({ _id: reportId, userAccountId })
      : await AnalysisReportModel.findOne({ userAccountId }).sort({ createdAt: -1 });

    if (!report) {
      res.status(400).json({ success: false, message: '还没有AI分析报告，请先运行AI分析' });
      return;
    }

    const accounts = await ensurePaperAccounts(userAccountId);
    const currentPrice = Number(report.currentPrice);
    const decisions = [];

    for (const account of accounts) {
      const profile = getProfile(account.profileId);
      const nextTrade = buildTrade(account, report, profile);

      if (account.openTrade?.status === 'open') {
        if (account.openTrade.direction !== nextTrade.direction && nextTrade.status === 'open') {
          closeOpenTrade(account, currentPrice, 'AI方向反转，先平旧仓');
        } else {
          markAccountToMarket(account, currentPrice);
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
    res.json({ success: true, data: { reportId: report._id, decisions, accounts: updatedAccounts } });
  } catch (error) {
    logger.error('[Research] 执行模拟交易失败:', error);
    res.status(500).json({ success: false, message: '执行模拟交易失败' });
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

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function runProfileBacktest(profile: RiskProfile, candles: any[], report: AnalysisReportDocument | any) {
  const direction = getReportDirection(report);
  const confidence = getConfidence(report);
  const aiRisk = Number(report.result?.risk?.risk || 0);
  const baseStopPct = Math.max(Number(report.result?.risk?.stopLoss || 2), 0.5);
  const shouldTrade = confidence >= profile.minConfidence && aiRisk <= profile.maxRiskScore;
  let balance = INITIAL_BALANCE;
  let peak = INITIAL_BALANCE;
  let maxDrawdown = 0;
  const trades: any[] = [];

  if (!shouldTrade || candles.length < 30) {
    return {
      profileId: profile.profileId,
      name: profile.name,
      trades: 0,
      winRate: 0,
      netPnl: 0,
      maxDrawdown: 0,
      endingBalance: balance,
      note: shouldTrade ? 'K线数量不足' : 'AI置信度或风险不满足该账号规则',
    };
  }

  for (let i = 20; i < candles.length - 8; i += 8) {
    const window = candles.slice(i - 20, i);
    const ma20 = average(window.map((c) => Number(c.close)));
    const entry = Number(candles[i].close);
    const trendOk = direction === 'long' ? entry > ma20 : entry < ma20;

    if (!trendOk) {
      continue;
    }

    const stopPct = baseStopPct * profile.stopMultiplier;
    const stopDistance = entry * (stopPct / 100);
    const takeDistance = stopDistance * profile.rewardRisk;
    const stopPrice = direction === 'long' ? entry - stopDistance : entry + stopDistance;
    const takePrice = direction === 'long' ? entry + takeDistance : entry - takeDistance;
    const riskBudget = balance * (profile.riskPerTradePct / 100);
    const volumeByRisk = riskBudget / Math.max(stopDistance, 0.01);
    const volumeByCap = (balance * (profile.maxPositionPct / 100)) / Math.max(entry, 0.01);
    const volume = Math.min(volumeByRisk, volumeByCap);
    let exit = Number(candles[i + 8].close);
    let exitReason = 'time';

    for (let j = i + 1; j <= Math.min(i + 8, candles.length - 1); j++) {
      const high = Number(candles[j].high);
      const low = Number(candles[j].low);

      if (direction === 'long') {
        if (low <= stopPrice) {
          exit = stopPrice;
          exitReason = 'stop';
          break;
        }
        if (high >= takePrice) {
          exit = takePrice;
          exitReason = 'take';
          break;
        }
      } else {
        if (high >= stopPrice) {
          exit = stopPrice;
          exitReason = 'stop';
          break;
        }
        if (low <= takePrice) {
          exit = takePrice;
          exitReason = 'take';
          break;
        }
      }
    }

    const pnl = calculatePnl(direction, entry, exit, volume);
    balance = Number((balance + pnl).toFixed(2));
    peak = Math.max(peak, balance);
    maxDrawdown = Math.max(maxDrawdown, ((peak - balance) / peak) * 100);
    trades.push({ entry, exit, pnl, exitReason });
  }

  const wins = trades.filter((trade) => trade.pnl > 0).length;
  const netPnl = Number((balance - INITIAL_BALANCE).toFixed(2));

  return {
    profileId: profile.profileId,
    name: profile.name,
    direction,
    trades: trades.length,
    winRate: trades.length ? Number(((wins / trades.length) * 100).toFixed(1)) : 0,
    netPnl,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    endingBalance: balance,
    sampleTrades: trades.slice(-5),
    note: '基础规则回测：AI方向 + MA20趋势过滤 + 固定止盈止损',
  };
}

export async function runBacktest(req: Request, res: Response): Promise<void> {
  try {
    const userAccountId = getUserAccountId(req);
    if (!userAccountId) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const { reportId, period = '1m', limit = 240 } = req.body || {};
    const report = reportId
      ? await AnalysisReportModel.findOne({ _id: reportId, userAccountId })
      : await AnalysisReportModel.findOne({ userAccountId }).sort({ createdAt: -1 });

    if (!report) {
      res.status(400).json({ success: false, message: '还没有AI分析报告，请先运行AI分析' });
      return;
    }

    const candles = await marketDataService.getCandles(period, Number(limit));
    if (!candles || candles.length < 30) {
      res.status(400).json({ success: false, message: 'K线数量不足，无法回测' });
      return;
    }

    const results = RISK_PROFILES.map((profile) => runProfileBacktest(profile, candles, report));
    const backtest = await BacktestRunModel.create({
      userAccountId,
      reportId: report._id.toString(),
      period,
      candleCount: candles.length,
      assumption: 'MVP基础回测：沿用最新AI方向，不逐根调用大模型；含风险阈值、仓位上限、止盈止损和趋势过滤。',
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

    const [latestReport, accounts, latestBacktest] = await Promise.all([
      AnalysisReportModel.findOne({ userAccountId }).sort({ createdAt: -1 }).lean(),
      ensurePaperAccounts(userAccountId),
      BacktestRunModel.findOne({ userAccountId }).sort({ createdAt: -1 }).lean(),
    ]);

    res.json({
      success: true,
      data: {
        latestReport,
        accounts,
        latestBacktest,
      },
    });
  } catch (error) {
    logger.error('[Research] 获取研究中心概览失败:', error);
    res.status(500).json({ success: false, message: '获取研究中心概览失败' });
  }
}
