import mongoose, { Schema, Model, Document } from 'mongoose';

export type PaperProfileId = 'conservative' | 'balanced' | 'aggressive' | 'event';
export type PaperTradeDirection = 'long' | 'short';
export type PaperTradeStatus = 'open' | 'closed' | 'skipped' | 'held';

export interface PaperTrade {
  reportId?: string;
  direction: PaperTradeDirection;
  status: PaperTradeStatus;
  entryPrice: number;
  exitPrice?: number;
  volume: number;
  stopLoss: number;
  takeProfit: number;
  pnl: number;
  reason: string;
  openedAt: Date;
  closedAt?: Date;
}

export interface PaperAccountDocument extends Document {
  userAccountId: string;
  profileId: PaperProfileId;
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
  createdAt: Date;
  updatedAt: Date;
}

const PaperTradeSchema = new Schema<PaperTrade>({
  reportId: { type: String },
  direction: { type: String, enum: ['long', 'short'], required: true },
  status: { type: String, enum: ['open', 'closed', 'skipped', 'held'], required: true },
  entryPrice: { type: Number, required: true },
  exitPrice: { type: Number },
  volume: { type: Number, required: true },
  stopLoss: { type: Number, required: true },
  takeProfit: { type: Number, required: true },
  pnl: { type: Number, required: true, default: 0 },
  reason: { type: String, required: true },
  openedAt: { type: Date, required: true, default: Date.now },
  closedAt: { type: Date },
}, { _id: false });

const PaperAccountSchema = new Schema<PaperAccountDocument>({
  userAccountId: {
    type: String,
    required: true,
    index: true,
  },
  profileId: {
    type: String,
    required: true,
    enum: ['conservative', 'balanced', 'aggressive', 'event'],
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  riskPerTradePct: {
    type: Number,
    required: true,
  },
  maxPositionPct: {
    type: Number,
    required: true,
  },
  minConfidence: {
    type: Number,
    required: true,
  },
  maxRiskScore: {
    type: Number,
    required: true,
  },
  balance: {
    type: Number,
    required: true,
    default: 10000,
  },
  equity: {
    type: Number,
    required: true,
    default: 10000,
  },
  realizedPnl: {
    type: Number,
    required: true,
    default: 0,
  },
  openTrade: {
    type: PaperTradeSchema,
    default: undefined,
  },
  tradeLog: {
    type: [PaperTradeSchema],
    default: [],
  },
}, {
  timestamps: true,
});

PaperAccountSchema.index({ userAccountId: 1, profileId: 1 }, { unique: true });

export const PaperAccountModel: Model<PaperAccountDocument> =
  (mongoose.models.PaperAccount as Model<PaperAccountDocument>) ||
  mongoose.model<PaperAccountDocument>('PaperAccount', PaperAccountSchema);
