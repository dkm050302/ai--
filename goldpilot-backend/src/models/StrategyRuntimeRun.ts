import mongoose, { Schema, Model, Document } from 'mongoose';

export interface StrategyRuntimeRunDocument extends Document {
  userAccountId: string;
  period: string;
  requestedLimit: number;
  candleCount: number;
  dataSource: string;
  dataStart?: Date;
  dataEnd?: Date;
  initialBalance: number;
  summary: unknown;
  strategyResults: unknown[];
  dailySnapshots: unknown[];
  assumption: string;
  createdAt: Date;
  updatedAt: Date;
}

const StrategyRuntimeRunSchema = new Schema<StrategyRuntimeRunDocument>({
  userAccountId: {
    type: String,
    required: true,
    index: true,
  },
  period: {
    type: String,
    required: true,
  },
  requestedLimit: {
    type: Number,
    required: true,
  },
  candleCount: {
    type: Number,
    required: true,
  },
  dataSource: {
    type: String,
    required: true,
  },
  dataStart: {
    type: Date,
  },
  dataEnd: {
    type: Date,
  },
  initialBalance: {
    type: Number,
    required: true,
    default: 1_000_000,
  },
  summary: {
    type: Schema.Types.Mixed,
    default: undefined,
  },
  strategyResults: {
    type: [Schema.Types.Mixed],
    default: [],
  },
  dailySnapshots: {
    type: [Schema.Types.Mixed],
    default: [],
  },
  assumption: {
    type: String,
    required: true,
  },
}, {
  timestamps: true,
});

StrategyRuntimeRunSchema.index({ userAccountId: 1, createdAt: -1 });

export const StrategyRuntimeRunModel: Model<StrategyRuntimeRunDocument> =
  (mongoose.models.StrategyRuntimeRun as Model<StrategyRuntimeRunDocument>) ||
  mongoose.model<StrategyRuntimeRunDocument>('StrategyRuntimeRun', StrategyRuntimeRunSchema);
