import mongoose, { Schema, Model, Document } from 'mongoose';

export interface Position {
  symbol: string;
  volume: number;
  type: 'buy' | 'sell';
  profit: number;
}

export interface AccountInfo {
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  positions: Position[];
  dailyPnl: number;
}

export interface AIConfig {
  provider: string;
  apiKey: string;
  status: 'connected' | 'disconnected';
  lastUsed?: Date;
}

export interface IUser extends Document {
  accountId: string;
  password: string;
  server: string;
  accountInfo?: AccountInfo;
  aiConfig?: AIConfig;
  createdAt: Date;
  updatedAt: Date;
}

interface IUserModel extends Model<IUser> {
  findByAccountId(accountId: string, server: string): Promise<IUser | null>;
}

const PositionSchema = new Schema({
  symbol: { type: String, required: true },
  volume: { type: Number, required: true },
  type: { type: String, required: true, enum: ['buy', 'sell'] },
  profit: { type: Number, required: true, default: 0 },
}, { _id: false });

const AccountInfoSchema = new Schema({
  balance: { type: Number, default: 0 },
  equity: { type: Number, default: 0 },
  margin: { type: Number, default: 0 },
  freeMargin: { type: Number, default: 0 },
  positions: { type: [PositionSchema], default: [] },
  dailyPnl: { type: Number, default: 0 },
}, { _id: false });

const AIConfigSchema = new Schema({
  provider: { type: String, default: 'deepseek' },
  apiKey: { type: String },
  status: { type: String, enum: ['connected', 'disconnected'], default: 'disconnected' },
  lastUsed: { type: Date },
}, { _id: false });

const UserSchema = new Schema<IUser, IUserModel>({
  accountId: {
    type: String,
    required: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  server: {
    type: String,
    required: true,
    trim: true,
  },
  accountInfo: {
    type: AccountInfoSchema,
    default: {},
  },
  aiConfig: {
    type: AIConfigSchema,
    default: undefined,
  },
}, {
  timestamps: true,
});

// 复合唯一索引
UserSchema.index({ accountId: 1, server: 1 }, { unique: true });

// 静态方法
UserSchema.statics.findByAccountId = function(accountId: string, server: string) {
  return this.findOne({ accountId, server });
};

export const UserModel: IUserModel = (mongoose.models.User as IUserModel) ||
  mongoose.model<IUser, IUserModel>('User', UserSchema);
