import mongoose, { Schema, Model, Document } from 'mongoose';
import type { Signal, SignalDirection, SignalStatus, SignalPeriod } from '../types';

interface SignalDocument extends Document, Omit<Signal, '_id'> {}

const SignalSchema = new Schema<SignalDocument>({
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
  },
  direction: {
    type: String,
    required: true,
    enum: ['long', 'short'] as SignalDirection[],
  },
  entryPrice: {
    type: Number,
    required: true,
  },
  exitPrice: {
    type: Number,
  },
  takeProfit: {
    type: Number,
  },
  stopLoss: {
    type: Number,
  },
  profit: {
    type: Number,
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'profit', 'loss'] as SignalStatus[],
    default: 'pending',
  },
  period: {
    type: String,
    required: true,
    enum: ['1m', '5m', '15m', '1h', '4h', '1d'] as SignalPeriod[],
  },
  atr: {
    type: Number,
    required: true,
  },
}, {
  timestamps: true,
});

// 添加索引
SignalSchema.index({ timestamp: -1 });
SignalSchema.index({ status: 1 });
SignalSchema.index({ period: 1 });

export const SignalModel: Model<SignalDocument> = mongoose.models.Signal ||
  mongoose.model<SignalDocument>('Signal', SignalSchema);
