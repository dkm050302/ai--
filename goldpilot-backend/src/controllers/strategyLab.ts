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
import { externalGoldCsvImportService } from '../services/externalGoldCsvImport';
import {
  getStrategyDefinitions,
  runStrategyScreening,
  type StrategyOverride,
  type PublicStrategyDefinition,
} from '../services/strategyScreening';
import { getUserApiKey } from './ai';
import { DEEPSEEK_MODEL, getDeepSeekChatCompletionsUrl } from '../config';
import { logger } from '../utils/logger';

function getUserAccountId(req: Request): string | null {
  return req.user?.accountId || null;
}

function extractJsonObject(text: string): any | null {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function clampSuggestionOverrides(definitions: PublicStrategyDefinition[], input: any): StrategyOverride[] {
  const definitionMap = new Map(definitions.map((definition) => [definition.strategyId, definition]));
  const rawOverrides = Array.isArray(input) ? input : [];
  const overrides: StrategyOverride[] = [];

  for (const item of rawOverrides) {
    const definition = definitionMap.get(String(item?.strategyId || ''));
    if (!definition) {
      continue;
    }

    const parameters: Record<string, number> = {};
    for (const parameter of definition.parameters) {
      const rawValue = item?.parameters?.[parameter.key];
      const value = Number(rawValue);
      if (!Number.isFinite(value)) {
        continue;
      }
      parameters[parameter.key] = Math.min(Math.max(value, parameter.min), parameter.max);
    }

    overrides.push({
      strategyId: definition.strategyId,
      enabled: item?.enabled === false ? false : true,
      parameters,
    });
  }

  return overrides;
}

function buildRuleBasedSuggestion(definitions: PublicStrategyDefinition[], latestRun: any | null) {
  const results = latestRun?.results || [];
  const suggestions: Array<StrategyOverride & { reason: string }> = [];

  for (const result of results) {
    const definition = definitions.find((item) => item.strategyId === result.strategyId);
    if (!definition) {
      continue;
    }

    const parameters = Object.fromEntries(definition.parameters.map((parameter) => [parameter.key, parameter.value]));
    const nextParameters: Record<string, number> = {};
    const reasons: string[] = [];

    if (Number(result.validation?.netPnl || 0) < 0) {
      if (result.strategyId === 'mean-reversion-band') {
        nextParameters.deviationStd = Number(Math.min(Number(parameters.deviationStd || 1.4) + 0.3, 3).toFixed(2));
        nextParameters.maxHoldBars = Math.max(Number(parameters.maxHoldBars || 10) - 2, 3);
        reasons.push('验证段亏损，建议提高偏离阈值并缩短持仓，减少逆势接刀。');
      } else {
        nextParameters.maxHoldBars = Math.max(Number(parameters.maxHoldBars || 12) - 2, 3);
        reasons.push('验证段亏损，建议先缩短持仓窗口，降低策略暴露时间。');
      }
    }

    if (Number(result.maxDrawdown || 0) > 10) {
      nextParameters.stopAtr = Number(Math.max(Number(parameters.stopAtr || 2) - 0.2, 0.6).toFixed(2));
      reasons.push('最大回撤偏高，建议略微收紧 ATR 止损，下一轮观察是否牺牲过多收益。');
    }

    if (Number(result.profitFactor || 0) >= 1.25 && Number(result.validation?.netPnl || 0) > 0) {
      nextParameters.rewardRisk = Number(Math.min(Number(parameters.rewardRisk || 1.5) + 0.1, 4).toFixed(2));
      reasons.push('PF 和验证段表现尚可，可小幅提高盈亏比测试收益平台是否稳定。');
    }

    if (Object.keys(nextParameters).length > 0) {
      suggestions.push({
        strategyId: result.strategyId,
        enabled: true,
        parameters: nextParameters,
        reason: reasons.join(' '),
      });
    }
  }

  return {
    mode: 'rule_based',
    summary: suggestions.length
      ? '已根据最近筛选结果生成参数微调建议。建议每次只改小步，并重新跑长期筛选验证。'
      : '最近筛选结果没有触发明显调参规则，建议先保持默认参数并扩大样本周期。',
    suggestedOverrides: suggestions,
    focus: [
      '先看验证段收益，而不是只看总收益。',
      '调参必须保留滑点手续费压力测试。',
      '每次小步调整，避免追逐单次最优参数。',
    ],
  };
}

async function buildLlmSuggestion(accountId: string, definitions: PublicStrategyDefinition[], latestRun: any | null) {
  const apiKey = await getUserApiKey(accountId);
  if (!apiKey) {
    return null;
  }

  const prompt = [
    '你是一个严格的量化回测审查助手。请只输出 JSON，不要输出解释性 Markdown。',
    '目标：根据策略定义和最近长期黄金回测结果，提出小步、保守、可验证的参数修改建议。',
    '约束：不要建议扩大到参数范围外；不要追求单次收益最高；优先验证段、PF、最大回撤、样本量和压力测试。',
    'JSON 格式：{"summary":"...","suggestedOverrides":[{"strategyId":"...","enabled":true,"parameters":{"参数key":数值},"reason":"..."}],"focus":["..."]}',
    `策略定义：${JSON.stringify(definitions)}`,
    `最近筛选结果：${JSON.stringify(latestRun?.results || [])}`,
  ].join('\n');

  const response = await fetch(getDeepSeekChatCompletionsUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 1200,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM 请求失败: ${response.status}`);
  }

  const data: any = await response.json();
  const content = data?.choices?.[0]?.message?.content || '';
  const parsed = extractJsonObject(content);
  if (!parsed) {
    throw new Error('LLM 返回不是有效 JSON');
  }

  return {
    mode: 'llm',
    summary: String(parsed.summary || '大模型已生成参数建议。'),
    suggestedOverrides: clampSuggestionOverrides(definitions, parsed.suggestedOverrides).map((override, index) => ({
      ...override,
      reason: String(parsed.suggestedOverrides?.[index]?.reason || '大模型建议'),
    })),
    focus: Array.isArray(parsed.focus) ? parsed.focus.slice(0, 5).map(String) : [],
  };
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

export async function getStrategyDefinitionsEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const userAccountId = getUserAccountId(req);
    if (!userAccountId) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    res.json({ success: true, data: { strategies: getStrategyDefinitions() } });
  } catch (error) {
    logger.error('[StrategyLab] 获取策略定义失败:', error);
    res.status(500).json({ success: false, message: '获取策略定义失败' });
  }
}

export async function importBaseMaxXau15mHistory(req: Request, res: Response): Promise<void> {
  try {
    const userAccountId = getUserAccountId(req);
    if (!userAccountId) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const sourceUrl = typeof req.body?.sourceUrl === 'string' && req.body.sourceUrl.startsWith('https://raw.githubusercontent.com/')
      ? req.body.sourceUrl
      : undefined;
    const result = await externalGoldCsvImportService.importBaseMaxXau15m(sourceUrl);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('[StrategyLab] 导入 BaseMax XAUUSD 15m 历史失败:', error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : '导入 BaseMax XAUUSD 15m 历史失败' });
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

    const definitions = getStrategyDefinitions();
    const strategyOverrides = clampSuggestionOverrides(definitions, req.body?.strategyOverrides || []);
    const output = runStrategyScreening(
      history.candles,
      {
        initialBalance: Number(req.body?.initialBalance || 1_000_000),
        riskPerTradePct: Number(req.body?.riskPerTradePct || 1),
        maxPositionPct: Number(req.body?.maxPositionPct || 35),
        slippagePct: Number(req.body?.slippagePct ?? 0.04),
        commissionPct: Number(req.body?.commissionPct ?? 0.01),
      },
      strategyOverrides
    );
    const sessionNote = history.meta.session?.removedNonTradingCount
      ? `交易时段清洗：已剔除 ${history.meta.session.removedNonTradingCount} 根非交易时段K线，使用 ${history.meta.candleCount} 根可交易K线`
      : '交易时段清洗：未发现需要剔除的周末/非交易K线';
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
        sessionNote,
        '入场使用下一根K线开盘价，包含滑点、手续费、训练/验证分段和压力测试',
        strategyOverrides.length ? '本轮使用了前端传入的策略参数覆盖值' : '本轮使用默认策略参数',
      ].join('；'),
      config: output.config,
      results: output.results,
      recommendation: {
        ...output.recommendation,
        strategyOverrides,
      },
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

export async function suggestStrategySettings(req: Request, res: Response): Promise<void> {
  try {
    const userAccountId = getUserAccountId(req);
    if (!userAccountId) {
      res.status(401).json({ success: false, message: '未授权' });
      return;
    }

    const definitions = getStrategyDefinitions();
    const latestRun = await StrategyScreenRunModel.findOne({ userAccountId }).sort({ createdAt: -1 }).lean();

    let suggestion = null;
    if (req.body?.useLLM !== false) {
      try {
        suggestion = await buildLlmSuggestion(userAccountId, definitions, latestRun);
      } catch (error) {
        logger.warn('[StrategyLab] LLM策略参数建议失败，回退到规则建议:', error);
      }
    }

    if (!suggestion) {
      suggestion = buildRuleBasedSuggestion(definitions, latestRun);
    }

    res.json({
      success: true,
      data: {
        latestRunId: latestRun?._id?.toString() || null,
        suggestion,
      },
    });
  } catch (error) {
    logger.error('[StrategyLab] 生成策略参数建议失败:', error);
    res.status(500).json({ success: false, message: '生成策略参数建议失败' });
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
