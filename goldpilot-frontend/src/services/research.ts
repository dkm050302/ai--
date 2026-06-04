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
  status: 'open' | 'closed' | 'skipped';
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
  note: string;
}

export interface BacktestRun {
  _id: string;
  reportId?: string;
  period: string;
  candleCount: number;
  assumption: string;
  results: BacktestProfileResult[];
  createdAt: string;
}

export interface ResearchSummary {
  latestReport: AnalysisReport | null;
  accounts: PaperAccount[];
  latestBacktest: BacktestRun | null;
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

  async getPaperAccounts(): Promise<PaperAccount[]> {
    const response = await api.get<ApiEnvelope<{ accounts: PaperAccount[] }>>('/api/research/paper-accounts');
    return response.data.accounts;
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

  async runBacktest(reportId?: string): Promise<BacktestRun> {
    const response = await api.post<ApiEnvelope<{ backtest: BacktestRun }>>(
      '/api/research/backtests/run',
      reportId ? { reportId, period: '1m', limit: 240 } : { period: '1m', limit: 240 }
    );
    return response.data.backtest;
  },

  async getBacktests(): Promise<BacktestRun[]> {
    const response = await api.get<ApiEnvelope<{ runs: BacktestRun[] }>>('/api/research/backtests');
    return response.data.runs;
  },
};
