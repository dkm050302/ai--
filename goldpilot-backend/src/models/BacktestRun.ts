import mongoose, { Schema, Model, Document } from 'mongoose';

export interface BacktestRunDocument extends Document {
  userAccountId: string;
  reportId?: string;
  period: string;
  candleCount: number;
  assumption: string;
  results: unknown[];
  createdAt: Date;
  updatedAt: Date;
}

const BacktestRunSchema = new Schema<BacktestRunDocument>({
  userAccountId: {
    type: String,
    required: true,
    index: true,
  },
  reportId: {
    type: String,
  },
  period: {
    type: String,
    required: true,
    default: '1m',
  },
  candleCount: {
    type: Number,
    required: true,
    default: 0,
  },
  assumption: {
    type: String,
    required: true,
  },
  results: {
    type: [Schema.Types.Mixed],
    default: [],
  },
}, {
  timestamps: true,
});

BacktestRunSchema.index({ createdAt: -1 });

export const BacktestRunModel: Model<BacktestRunDocument> =
  (mongoose.models.BacktestRun as Model<BacktestRunDocument>) ||
  mongoose.model<BacktestRunDocument>('BacktestRun', BacktestRunSchema);
