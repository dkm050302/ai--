import { api } from './api';

export interface AnalysisReport {
  _id: string;
  currentPrice: number;
  candleCount: number;
  modelName: string;
  promptVersion: string;
  result: {
    reportId?: string;
    decision: {
      headline: string;
      summary: string;
      eventCountdown: string;
      aiReason: string;
    };
    probability: {
      upProb: number;
      downProb: number;
      reason: string;
    };
    risk: {
      risk: number;
      riskLevel: 'low' | 'medium' | 'high';
      positionAdvice: number;
      stopLoss: number;
      reason: string;
    };
    actions: Array<{
      title: string;
      text: string;
    }>;
  };
  createdAt: string;
}

export interface PaperTrade {
  reportId?: string;
  direction: 'long' | 'short';
  status: 'open' | 'closed' | 'skipped' | 'held';
  entryPrice: number;
  exitPrice?: number;
  volume: number;
  stopLoss: number;
  takeProfit: number;
  pnl: number;
  reason: string;
  openedAt: string;
  closedAt?: string;
}

export interface EquitySnapshot {
  time: string;
  price: number;
  balance: number;
  equity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  openDirection?: 'long' | 'short';
  openVolume?: number;
  reason: string;
}

export interface PaperAccount {
  _id: string;
  profileId: 'conservative' | 'balanced' | 'aggressive' | 'event';
  name: string;
  description: string;
  riskPerTradePct: number;
  maxPositionPct: number;
  minConfidence: number;
  maxRiskScore: number;
  balance: number;
  equity: number;
  realizedPnl: number;
  openTrade?: PaperTrade;
  tradeLog: PaperTrade[];
  equitySnapshots?: EquitySnapshot[];
  updatedAt: string;
}

export interface BacktestProfileResult {
  profileId: string;
  name: string;
  direction?: 'long' | 'short';
  trades: number;
  winRate: number;
  netPnl: number;
  maxDrawdown: number;
  endingBalance: number;
  profitFactor?: number;
  avgWin?: number;
  avgLoss?: number;
  expectancy?: number;
  totalCost?: number;
  robustnessScore?: number;
  sampleWarning?: boolean;
  equityCurve?: Array<{
    time: number;
    equity: number;
    drawdownPct: number;
  }>;
  stressTests?: Array<{
    label: string;
    passed: boolean;
    trades: number;
    winRate: number;
    netPnl: number;
    maxDrawdown: number;
    profitFactor: number;
  }>;
  note: string;
}

export interface BacktestConfig {
  period: string;
  limit: number;
  exitBars: number;
  slippagePct: number;
  commissionPct: number;
}

export interface BacktestRun {
  _id: string;
  reportId?: string;
  period: string;
  candleCount: number;
  assumption: string;
  config?: BacktestConfig;
  results: BacktestProfileResult[];
  createdAt: string;
}

export interface ResearchSummary {
  latestReport: AnalysisReport | null;
  accounts: PaperAccount[];
  settlements?: Array<{
    profileId: string;
    name: string;
    action: 'closed' | 'mark';
    direction?: 'long' | 'short';
    exitPrice?: number;
    reason: string;
  }>;
  markPrice?: number;
  autoTrading?: {
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
    paused: number;
    errors: string[];
  };
  latestBacktest: BacktestRun | null;
}

export type QuantInterventionMode = 'normal' | 'paused' | 'reduce_risk';

export interface QuantChain {
  updatedAt: string;
  version: string;
  initialBalance: number;
  alpha: {
    usable: boolean;
    status: string;
    direction: 'long' | 'short' | 'neutral';
    confidence: number;
    riskScore: number;
    headline: string;
    source: string;
    updatedAt: string | null;
  };
  marketState: {
    state: 'trend_up' | 'trend_down' | 'range' | 'high_volatility' | 'insufficient_data';
    stateLabel: string;
    source: string;
    lastPrice: number;
    kalmanPrice: number;
    trendScore: number;
    volatilityPct: number;
    transitionProbabilities: Array<{
      name: string;
      probability: number;
    }>;
    recommendation: string;
  };
  allocation: Array<{
    profileId: 'conservative' | 'balanced' | 'aggressive' | 'event';
    name: string;
    role: string;
    baseWeight: number;
    suggestedWeight: number;
    score: number;
    basis: string;
    capital: number;
  }>;
  execution: {
    mode: QuantInterventionMode;
    modeLabel: string;
    note: string;
    updatedAt: string;
    updatedBy: 'human' | 'model';
    canOpenNewTrades: boolean;
    riskScale: number;
    gridHint: string;
  };
}

export interface StrategyScreenResult {
  strategyId: string;
  name: string;
  description: string;
  parameters?: StrategyParameterDefinition[];
  trades: number;
  winRate: number;
  netPnl: number;
  endingBalance: number;
  maxDrawdown: number;
  profitFactor: number;
  expectancy: number;
  totalCost: number;
  score: number;
  sampleWarning: boolean;
  train: {
    trades: number;
    winRate: number;
    netPnl: number;
    profitFactor: number;
  };
  validation: {
    trades: number;
    winRate: number;
    netPnl: number;
    profitFactor: number;
  };
  stressTests: Array<{
    label: string;
    passed: boolean;
    trades: number;
    netPnl: number;
    maxDrawdown: number;
    profitFactor: number;
  }>;
  note: string;
}

export interface StrategyParameterDefinition {
  key: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  description: string;
}

export interface StrategyDefinition {
  strategyId: string;
  name: string;
  description: string;
  logic: string[];
  parameters: StrategyParameterDefinition[];
}

export interface StrategyOverride {
  strategyId: string;
  enabled?: boolean;
  parameters?: Record<string, number>;
  reason?: string;
}

export interface StrategySettingSuggestion {
  latestRunId: string | null;
  suggestion: {
    mode: 'llm' | 'rule_based';
    summary: string;
    suggestedOverrides: StrategyOverride[];
    focus: string[];
  };
}

export interface StrategyScreenRun {
  _id: string;
  period: string;
  requestedLimit: number;
  candleCount: number;
  dataSource: 'live' | 'cache' | 'stale_cache' | 'unavailable';
  dataStart?: string;
  dataEnd?: string;
  assumption: string;
  config: {
    initialBalance: number;
    riskPerTradePct: number;
    maxPositionPct: number;
    slippagePct: number;
    commissionPct: number;
  };
  results: StrategyScreenResult[];
  recommendation?: {
    strategyId?: string;
    name?: string;
    score?: number;
    reason: string;
    warnings: string[];
  };
  createdAt: string;
}

export interface StrategyLabOverview {
  historyCaches: Array<{
    source: 'live' | 'cache' | 'stale_cache' | 'unavailable';
    provider: string;
    symbol: string;
    period: string;
    requestedLimit: number;
    candleCount: number;
    startTime?: string;
    endTime?: string;
    updatedAt?: string;
    message: string;
    quality?: {
      duplicateCount: number;
      invalidCount: number;
      gapCount: number;
      largestGapSeconds: number;
      warnings: string[];
    };
    session?: {
      rawCount: number;
      tradableCount: number;
      removedNonTradingCount: number;
      removedWeekendCount: number;
      nonTradingRatio: number;
      gapCount: number;
      largestGapSeconds: number;
      warnings: string[];
    };
  }>;
  paperTrading: {
    accountCount: number;
    tradeCount: number;
    openCount: number;
    closedCount: number;
    skippedCount: number;
    heldCount: number;
    realizedPnl: number;
    totalEquity: number;
    firstTradeAt: string | null;
    lastSnapshotAt: string | null;
    message: string;
  };
  liveTrading: {
    snapshotCount: number;
    positionCount: number;
    balance: number;
    equity: number;
    dailyPnl: number;
    updatedAt: string | null;
    message: string;
  };
  aiReportCount: number;
  aiBacktestCount: number;
  strategyScreenCount: number;
  latestScreenRun: StrategyScreenRun | null;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

export const researchApi = {
  async getSummary(): Promise<ResearchSummary> {
    const response = await api.get<ApiEnvelope<ResearchSummary>>('/api/research/summary');
    return response.data;
  },

  async getReports(): Promise<AnalysisReport[]> {
    const response = await api.get<ApiEnvelope<{ reports: AnalysisReport[] }>>('/api/research/reports');
    return response.data.reports;
  },

  async getPaperAccounts(): Promise<{ accounts: PaperAccount[]; settlements?: any[]; price?: number }> {
    const response = await api.get<ApiEnvelope<{ accounts: PaperAccount[]; settlements?: any[]; price?: number }>>('/api/research/paper-accounts');
    return response.data;
  },

  async settlePaperAccounts(): Promise<{ accounts: PaperAccount[]; settlements: any[]; price: number }> {
    const response = await api.post<ApiEnvelope<{ accounts: PaperAccount[]; settlements: any[]; price: number }>>(
      '/api/research/paper-accounts/settle'
    );
    return response.data;
  },

  async executePaperTrading(reportId?: string): Promise<{ decisions: any[]; accounts: PaperAccount[] }> {
    const response = await api.post<ApiEnvelope<{ decisions: any[]; accounts: PaperAccount[] }>>(
      '/api/research/paper-accounts/execute',
      reportId ? { reportId } : {}
    );
    return response.data;
  },

  async resetPaperAccounts(): Promise<PaperAccount[]> {
    const response = await api.post<ApiEnvelope<{ accounts: PaperAccount[] }>>('/api/research/paper-accounts/reset');
    return response.data.accounts;
  },

  async runBacktest(reportId?: string, config?: Partial<BacktestConfig>): Promise<BacktestRun> {
    const response = await api.post<ApiEnvelope<{ backtest: BacktestRun }>>(
      '/api/research/backtests/run',
      {
        reportId,
        period: config?.period || '1m',
        limit: config?.limit || 240,
        exitBars: config?.exitBars || 8,
        slippagePct: config?.slippagePct ?? 0.03,
        commissionPct: config?.commissionPct ?? 0.01,
      }
    );
    return response.data.backtest;
  },

  async getBacktests(): Promise<BacktestRun[]> {
    const response = await api.get<ApiEnvelope<{ runs: BacktestRun[] }>>('/api/research/backtests');
    return response.data.runs;
  },

  async getQuantChain(): Promise<QuantChain> {
    const response = await api.get<ApiEnvelope<QuantChain>>('/api/research/quant-chain');
    return response.data;
  },

  async updateQuantIntervention(
    mode: QuantInterventionMode,
    note?: string,
    updatedBy: 'human' | 'model' = 'human'
  ): Promise<QuantChain> {
    const response = await api.post<ApiEnvelope<QuantChain>>(
      '/api/research/quant-chain/intervention',
      { mode, note, updatedBy }
    );
    return response.data;
  },

  async getStrategyLabOverview(): Promise<StrategyLabOverview> {
    const response = await api.get<ApiEnvelope<StrategyLabOverview>>('/api/research/strategy-lab/overview');
    return response.data;
  },

  async runStrategyScreening(config: {
    period: string;
    limit: number;
    initialBalance?: number;
    riskPerTradePct?: number;
    maxPositionPct?: number;
    slippagePct?: number;
    commissionPct?: number;
    strategyOverrides?: StrategyOverride[];
  }): Promise<{ history: StrategyLabOverview['historyCaches'][number]; run: StrategyScreenRun }> {
    const response = await api.post<ApiEnvelope<{ history: StrategyLabOverview['historyCaches'][number]; run: StrategyScreenRun }>>(
      '/api/research/strategy-lab/screen',
      config
    );
    return response.data;
  },

  async getStrategyScreenRuns(): Promise<StrategyScreenRun[]> {
    const response = await api.get<ApiEnvelope<{ runs: StrategyScreenRun[] }>>('/api/research/strategy-lab/screens');
    return response.data.runs;
  },

  async getStrategyDefinitions(): Promise<StrategyDefinition[]> {
    const response = await api.get<ApiEnvelope<{ strategies: StrategyDefinition[] }>>('/api/research/strategy-lab/strategies');
    return response.data.strategies;
  },

  async suggestStrategySettings(useLLM = true): Promise<StrategySettingSuggestion> {
    const response = await api.post<ApiEnvelope<StrategySettingSuggestion>>(
      '/api/research/strategy-lab/suggest-settings',
      { useLLM },
      { timeout: 35000 }
    );
    return response.data;
  },
};
