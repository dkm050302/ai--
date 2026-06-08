import { api } from './api';

export type ManualSimSide = 'buy' | 'sell';
export type ManualSimOrderType = 'market' | 'limit' | 'stop';
export type ManualSimOrderStatus = 'pending' | 'filled' | 'cancelled' | 'rejected';
export type ManualSimTradeAction = 'open' | 'close' | 'fill' | 'cancel' | 'reset';

export interface ManualSimQuote {
  price: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  source: string;
}

export interface ManualSimPosition {
  positionId: string;
  symbol: string;
  side: ManualSimSide;
  lots: number;
  contractSize: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  margin: number;
  pnl: number;
  openedAt: string;
  note?: string;
}

export interface ManualSimOrder {
  orderId: string;
  symbol: string;
  type: ManualSimOrderType;
  side: ManualSimSide;
  lots: number;
  contractSize: number;
  targetPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  status: ManualSimOrderStatus;
  createdAt: string;
  filledAt?: string;
  filledPrice?: number;
  note?: string;
}

export interface ManualSimTradeLog {
  tradeId: string;
  orderId?: string;
  positionId?: string;
  action: ManualSimTradeAction;
  symbol: string;
  side?: ManualSimSide;
  lots?: number;
  price?: number;
  pnl: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
}

export interface ManualSimAccount {
  _id: string;
  userAccountId: string;
  name: string;
  symbol: string;
  initialBalance: number;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  realizedPnl: number;
  unrealizedPnl: number;
  positions: ManualSimPosition[];
  pendingOrders: ManualSimOrder[];
  tradeLog: ManualSimTradeLog[];
  updatedAt: string;
}

export interface ManualSimPayload {
  account: ManualSimAccount;
  quote: ManualSimQuote;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

export const manualSimApi = {
  async getAccount(): Promise<ManualSimPayload> {
    const response = await api.get<ApiEnvelope<ManualSimPayload>>('/api/manual-sim/account');
    return response.data;
  },

  async placeOrder(order: {
    type: ManualSimOrderType;
    side: ManualSimSide;
    lots: number;
    targetPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
    note?: string;
  }): Promise<ManualSimPayload> {
    const response = await api.post<ApiEnvelope<ManualSimPayload>>('/api/manual-sim/orders', order);
    return response.data;
  },

  async closePosition(positionId: string): Promise<ManualSimPayload> {
    const response = await api.post<ApiEnvelope<ManualSimPayload>>(`/api/manual-sim/positions/${positionId}/close`);
    return response.data;
  },

  async cancelOrder(orderId: string): Promise<ManualSimPayload> {
    const response = await api.post<ApiEnvelope<ManualSimPayload>>(`/api/manual-sim/orders/${orderId}/cancel`);
    return response.data;
  },

  async settle(): Promise<ManualSimPayload> {
    const response = await api.post<ApiEnvelope<ManualSimPayload>>('/api/manual-sim/settle');
    return response.data;
  },

  async reset(): Promise<ManualSimPayload> {
    const response = await api.post<ApiEnvelope<ManualSimPayload>>('/api/manual-sim/reset');
    return response.data;
  },
};
