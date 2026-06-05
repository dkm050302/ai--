import mongoose, { Schema, Model, Document } from 'mongoose';

export interface StrategyScreenRunDocument extends Document {
  userAccountId: string;
  period: string;
  requestedLimit: number;
  candleCount: number;
  dataSource: string;
  dataStart?: Date;
  dataEnd?: Date;
  assumption: string;
  config: unknown;
  results: unknown[];
  recommendation?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const StrategyScreenRunSchema = new Schema<StrategyScreenRunDocument>({
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
  assumption: {
    type: String,
    required: true,
  },
  config: {
    type: Schema.Types.Mixed,
    default: undefined,
  },
  results: {
    type: [Schema.Types.Mixed],
    default: [],
  },
  recommendation: {
    type: Schema.Types.Mixed,
    default: undefined,
  },
}, {
  timestamps: true,
});

StrategyScreenRunSchema.index({ userAccountId: 1, createdAt: -1 });

export const StrategyScreenRunModel: Model<StrategyScreenRunDocument> =
  (mongoose.models.StrategyScreenRun as Model<StrategyScreenRunDocument>) ||
  mongoose.model<StrategyScreenRunDocument>('StrategyScreenRun', StrategyScreenRunSchema);
