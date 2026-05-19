import mongoose, { Schema, Model, Document } from 'mongoose';
import type { DailyStats } from '../types';

interface DailyStatsDocument extends Document, Omit<DailyStats, '_id'> {}

const DailyStatsSchema = new Schema<DailyStatsDocument>({
  date: {
    type: Date,
    required: true,
    unique: true,
  },
  signalCount: {
    type: Number,
    required: true,
    default: 0,
  },
  winCount: {
    type: Number,
    required: true,
    default: 0,
  },
  lossCount: {
    type: Number,
    required: true,
    default: 0,
  },
  winRate: {
    type: Number,
    required: true,
    default: 0,
  },
  totalProfit: {
    type: Number,
    required: true,
    default: 0,
  },
  totalLoss: {
    type: Number,
    required: true,
    default: 0,
  },
  netProfit: {
    type: Number,
    required: true,
    default: 0,
  },
}, {
  timestamps: true,
});

// 添加索引
DailyStatsSchema.index({ date: 1 }, { unique: true });

export const DailyStatsModel: Model<DailyStatsDocument> = mongoose.models.DailyStats ||
  mongoose.model<DailyStatsDocument>('DailyStats', DailyStatsSchema);
