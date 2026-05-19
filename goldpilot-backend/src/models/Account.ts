import mongoose, { Schema, Model, Document } from 'mongoose';
import type { Account, Position } from '../types';

interface AccountDocument extends Document, Omit<Account, '_id'> {}

const PositionSchema = new Schema({
  symbol: { type: String, required: true },
  volume: { type: Number, required: true },
  type: { type: String, required: true, enum: ['buy', 'sell'] },
  profit: { type: Number, required: true, default: 0 },
}, { _id: false });

const AccountSchema = new Schema<AccountDocument>({
  accountId: {
    type: String,
    required: true,
    unique: true,
  },
  server: {
    type: String,
    required: true,
  },
  balance: {
    type: Number,
    required: true,
    default: 0,
  },
  equity: {
    type: Number,
    required: true,
    default: 0,
  },
  margin: {
    type: Number,
    required: true,
    default: 0,
  },
  freeMargin: {
    type: Number,
    required: true,
    default: 0,
  },
  positions: {
    type: [PositionSchema],
    default: [],
  },
  dailyPnl: {
    type: Number,
    default: 0,
  },
  riskUsed: {
    type: Number,
    default: 0,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// 添加索引
AccountSchema.index({ accountId: 1, server: 1 }, { unique: true });

export const AccountModel: Model<AccountDocument> = mongoose.models.Account ||
  mongoose.model<AccountDocument>('Account', AccountSchema);
