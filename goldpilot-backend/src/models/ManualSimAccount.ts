import mongoose, { Schema, Model, Document } from 'mongoose';

export type ManualSimSide = 'buy' | 'sell';
export type ManualSimOrderType = 'market' | 'limit' | 'stop';
export type ManualSimOrderStatus = 'pending' | 'filled' | 'cancelled' | 'rejected';
export type ManualSimTradeAction = 'open' | 'close' | 'fill' | 'cancel' | 'reset';

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
  openedAt: Date;
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
  createdAt: Date;
  filledAt?: Date;
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
  createdAt: Date;
}

export interface ManualSimAccountDocument extends Document {
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
  createdAt: Date;
  updatedAt: Date;
}

const ManualSimPositionSchema = new Schema<ManualSimPosition>({
  positionId: { type: String, required: true },
  symbol: { type: String, required: true, default: 'XAU/USD' },
  side: { type: String, enum: ['buy', 'sell'], required: true },
  lots: { type: Number, required: true },
  contractSize: { type: Number, required: true, default: 100 },
  entryPrice: { type: Number, required: true },
  currentPrice: { type: Number, required: true },
  stopLoss: { type: Number },
  takeProfit: { type: Number },
  margin: { type: Number, required: true, default: 0 },
  pnl: { type: Number, required: true, default: 0 },
  openedAt: { type: Date, required: true, default: Date.now },
  note: { type: String },
}, { _id: false });

const ManualSimOrderSchema = new Schema<ManualSimOrder>({
  orderId: { type: String, required: true },
  symbol: { type: String, required: true, default: 'XAU/USD' },
  type: { type: String, enum: ['market', 'limit', 'stop'], required: true },
  side: { type: String, enum: ['buy', 'sell'], required: true },
  lots: { type: Number, required: true },
  contractSize: { type: Number, required: true, default: 100 },
  targetPrice: { type: Number },
  stopLoss: { type: Number },
  takeProfit: { type: Number },
  status: { type: String, enum: ['pending', 'filled', 'cancelled', 'rejected'], required: true, default: 'pending' },
  createdAt: { type: Date, required: true, default: Date.now },
  filledAt: { type: Date },
  filledPrice: { type: Number },
  note: { type: String },
}, { _id: false });

const ManualSimTradeLogSchema = new Schema<ManualSimTradeLog>({
  tradeId: { type: String, required: true },
  orderId: { type: String },
  positionId: { type: String },
  action: { type: String, enum: ['open', 'close', 'fill', 'cancel', 'reset'], required: true },
  symbol: { type: String, required: true, default: 'XAU/USD' },
  side: { type: String, enum: ['buy', 'sell'] },
  lots: { type: Number },
  price: { type: Number },
  pnl: { type: Number, required: true, default: 0 },
  balanceAfter: { type: Number, required: true },
  reason: { type: String, required: true },
  createdAt: { type: Date, required: true, default: Date.now },
}, { _id: false });

const ManualSimAccountSchema = new Schema<ManualSimAccountDocument>({
  userAccountId: {
    type: String,
    required: true,
    index: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
    default: '手动模拟账户',
  },
  symbol: {
    type: String,
    required: true,
    default: 'XAU/USD',
  },
  initialBalance: {
    type: Number,
    required: true,
    default: 1_000_000,
  },
  balance: {
    type: Number,
    required: true,
    default: 1_000_000,
  },
  equity: {
    type: Number,
    required: true,
    default: 1_000_000,
  },
  margin: {
    type: Number,
    required: true,
    default: 0,
  },
  freeMargin: {
    type: Number,
    required: true,
    default: 1_000_000,
  },
  realizedPnl: {
    type: Number,
    required: true,
    default: 0,
  },
  unrealizedPnl: {
    type: Number,
    required: true,
    default: 0,
  },
  positions: {
    type: [ManualSimPositionSchema],
    default: [],
  },
  pendingOrders: {
    type: [ManualSimOrderSchema],
    default: [],
  },
  tradeLog: {
    type: [ManualSimTradeLogSchema],
    default: [],
  },
}, {
  timestamps: true,
});

export const ManualSimAccountModel: Model<ManualSimAccountDocument> =
  (mongoose.models.ManualSimAccount as Model<ManualSimAccountDocument>) ||
  mongoose.model<ManualSimAccountDocument>('ManualSimAccount', ManualSimAccountSchema);
