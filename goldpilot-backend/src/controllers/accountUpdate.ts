import { Request, Response } from 'express';
import { UserModel } from '../models/User';
import { authMiddleware } from '../middleware/auth';
import { logger } from '../utils/logger';

/**
 * PUT /api/account/update
 * 更新账号数据
 */
export async function updateAccount(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '未授权',
      });
    }

    const { balance, equity, margin, freeMargin, dailyPnl } = req.body;

    // 查找用户
    const user = await UserModel.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在',
      });
    }

    // 更新账号信息
    if (balance !== undefined) user.accountInfo.balance = Number(balance);
    if (equity !== undefined) user.accountInfo.equity = Number(equity);
    if (margin !== undefined) user.accountInfo.margin = Number(margin);
    if (freeMargin !== undefined) user.accountInfo.freeMargin = Number(freeMargin);
    if (dailyPnl !== undefined) user.accountInfo.dailyPnl = Number(dailyPnl);

    await user.save();

    logger.info(`Account updated: ${user.accountId}@${user.server}`);

    return res.json({
      success: true,
      message: '账号信息更新成功',
      data: {
        accountId: user.accountId,
        server: user.server,
        accountInfo: user.accountInfo,
      },
    });
  } catch (error) {
    logger.error('Update account error:', error);
    return res.status(500).json({
      success: false,
      message: '服务器错误，请稍后重试',
    });
  }
}
