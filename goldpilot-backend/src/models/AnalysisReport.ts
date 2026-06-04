import mongoose, { Schema, Model, Document } from 'mongoose';

export interface AnalysisReportDocument extends Document {
  userAccountId: string;
  modelName: string;
  promptVersion: string;
  currentPrice: number;
  candleCount: number;
  events: unknown[];
  flashes: unknown[];
  signals: unknown[];
  result: any;
  createdAt: Date;
  updatedAt: Date;
}

const AnalysisReportSchema = new Schema<AnalysisReportDocument>({
  userAccountId: {
    type: String,
    required: true,
    index: true,
  },
  modelName: {
    type: String,
    required: true,
    default: 'deepseek-chat',
  },
  promptVersion: {
    type: String,
    required: true,
    default: 'goldpilot-analysis-v1',
  },
  currentPrice: {
    type: Number,
    required: true,
  },
  candleCount: {
    type: Number,
    required: true,
    default: 0,
  },
  events: {
    type: [Schema.Types.Mixed],
    default: [],
  },
  flashes: {
    type: [Schema.Types.Mixed],
    default: [],
  },
  signals: {
    type: [Schema.Types.Mixed],
    default: [],
  },
  result: {
    type: Schema.Types.Mixed,
    required: true,
  },
}, {
  timestamps: true,
});

AnalysisReportSchema.index({ createdAt: -1 });

export const AnalysisReportModel: Model<AnalysisReportDocument> =
  (mongoose.models.AnalysisReport as Model<AnalysisReportDocument>) ||
  mongoose.model<AnalysisReportDocument>('AnalysisReport', AnalysisReportSchema);
