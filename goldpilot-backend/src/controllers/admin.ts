import type { Request, Response } from 'express';
import { UserModel } from '../models/User';
import { UserActionLogModel } from '../models/UserActionLog';
import { ManualSimAccountModel } from '../models/ManualSimAccount';
import { logger } from '../utils/logger';

/**
 * GET /api/admin/stats - 聚合统计
 */
export async function getAdminStats(req: Request, res: Response): Promise<void> {
  try {
    const [totalActions, actionsByCategory, actionsByTester] = await Promise.all([
      UserActionLogModel.countDocuments({}),
      UserActionLogModel.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      UserActionLogModel.aggregate([
        { $group: { _id: '$accountId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    res.json({ success: true, data: { totalActions, actionsByCategory, actionsByTester } });
  } catch (error) {
    logger.error('[Admin] getAdminStats error:', error);
    res.status(500).json({ success: false, message: '获取统计数据失败' });
  }
}

/**
 * GET /api/admin/testers - 列出所有测试员及摘要
 */
export async function getTesters(req: Request, res: Response): Promise<void> {
  try {
    const testers = await UserModel.find({ role: 'tester' }).select('-password').lean();

    const results = await Promise.all(testers.map(async (tester) => {
      const [simAccount, actionCount, lastAction] = await Promise.all([
        ManualSimAccountModel.findOne({ userAccountId: tester.accountId }).lean(),
        UserActionLogModel.countDocuments({ accountId: tester.accountId }),
        UserActionLogModel.findOne({ accountId: tester.accountId })
          .sort({ timestamp: -1 }).select('timestamp').lean(),
      ]);

      return {
        accountId: tester.accountId,
        role: tester.role,
        createdAt: tester.createdAt,
        lastActionAt: lastAction?.timestamp || null,
        actionCount,
        simSummary: simAccount ? {
          balance: simAccount.balance,
          equity: simAccount.equity,
          realizedPnl: simAccount.realizedPnl,
          unrealizedPnl: simAccount.unrealizedPnl,
          positionCount: simAccount.positions?.length || 0,
          orderCount: simAccount.pendingOrders?.length || 0,
          tradeCount: simAccount.tradeLog?.length || 0,
        } : null,
      };
    }));

    res.json({ success: true, data: results });
  } catch (error) {
    logger.error('[Admin] getTesters error:', error);
    res.status(500).json({ success: false, message: '获取测试员列表失败' });
  }
}

/**
 * GET /api/admin/testers/:accountId/actions - 获取测试员操作日志
 */
export async function getTesterActions(req: Request, res: Response): Promise<void> {
  try {
    const { accountId } = req.params;
    const { category, limit = 100, offset = 0 } = req.query;

    const filter: any = { accountId: String(accountId) };
    if (category) filter.category = String(category);

    const [actions, total] = await Promise.all([
      UserActionLogModel.find(filter)
        .sort({ timestamp: -1 })
        .skip(Number(offset))
        .limit(Number(limit))
        .lean(),
      UserActionLogModel.countDocuments(filter),
    ]);

    res.json({ success: true, data: { actions, total } });
  } catch (error) {
    logger.error('[Admin] getTesterActions error:', error);
    res.status(500).json({ success: false, message: '获取操作日志失败' });
  }
}

/**
 * GET /api/admin/testers/:accountId/sim-account - 获取测试员模拟账户
 */
export async function getTesterSimAccount(req: Request, res: Response): Promise<void> {
  try {
    const { accountId } = req.params;
    const simAccount = await ManualSimAccountModel.findOne({
      userAccountId: String(accountId),
    }).lean();

    res.json({ success: true, data: simAccount || null });
  } catch (error) {
    logger.error('[Admin] getTesterSimAccount error:', error);
    res.status(500).json({ success: false, message: '获取模拟账户失败' });
  }
}
