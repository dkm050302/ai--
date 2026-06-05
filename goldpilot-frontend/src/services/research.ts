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
};
