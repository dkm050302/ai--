import mongoose, { Schema, Model, Document } from 'mongoose';

export type ActionCategory =
  | 'page_visit'
  | 'ai_question'
  | 'suggestion'
  | 'trade_open'
  | 'trade_close'
  | 'trade_order'
  | 'trade_cancel'
  | 'trade_reset'
  | 'button_click'
  | 'other';

export interface IUserActionLog extends Document {
  accountId: string;
  role: 'admin' | 'tester';
  category: ActionCategory;
  action: string;
  detail?: any;
  page?: string;
  timestamp: Date;
}

const UserActionLogSchema = new Schema<IUserActionLog>({
  accountId: { type: String, required: true, index: true },
  role: { type: String, enum: ['admin', 'tester'], required: true },
  category: { type: String, required: true, index: true },
  action: { type: String, required: true },
  detail: { type: Schema.Types.Mixed },
  page: { type: String },
  timestamp: { type: Date, default: Date.now, index: true },
});

UserActionLogSchema.index({ accountId: 1, timestamp: -1 });
UserActionLogSchema.index({ category: 1, timestamp: -1 });

export const UserActionLogModel: Model<IUserActionLog> =
  (mongoose.models.UserActionLog as Model<IUserActionLog>) ||
  mongoose.model<IUserActionLog>('UserActionLog', UserActionLogSchema);
