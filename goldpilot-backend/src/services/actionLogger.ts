import { UserActionLogModel, type ActionCategory } from '../models/UserActionLog';
import { logger } from '../utils/logger';

interface LogActionParams {
  accountId: string;
  role: 'admin' | 'tester';
  category: ActionCategory;
  action: string;
  detail?: any;
  page?: string;
}

export async function logAction(params: LogActionParams): Promise<void> {
  try {
    await UserActionLogModel.create({
      accountId: params.accountId,
      role: params.role,
      category: params.category,
      action: params.action,
      detail: params.detail,
      page: params.page,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error('[ActionLogger] Failed to log action:', error);
  }
}
