import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { logAction } from '../services/actionLogger';
import { UserModel } from '../models/User';
import type { ActionCategory } from '../models/UserActionLog';

const router = Router();

// POST /api/actions/log - 记录单条用户行为
router.post('/log', authMiddleware, async (req, res) => {
  try {
    const { category, action, detail, page } = req.body;

    if (!category || !action) {
      return res.status(400).json({ success: false, message: '缺少 category 或 action' });
    }

    const user = await UserModel.findById(req.user!.userId);
    if (!user) {
      return res.status(401).json({ success: false, message: '用户不存在' });
    }

    await logAction({
      accountId: user.accountId,
      role: user.role,
      category: category as ActionCategory,
      action,
      detail,
      page,
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: '记录行为失败' });
  }
});

// POST /api/actions/log-batch - 批量记录用户行为
router.post('/log-batch', authMiddleware, async (req, res) => {
  try {
    const { actions } = req.body;

    if (!Array.isArray(actions)) {
      return res.status(400).json({ success: false, message: 'actions 必须是数组' });
    }

    const user = await UserModel.findById(req.user!.userId);
    if (!user) {
      return res.status(401).json({ success: false, message: '用户不存在' });
    }

    for (const act of actions.slice(0, 50)) {
      await logAction({
        accountId: user.accountId,
        role: user.role,
        category: act.category as ActionCategory,
        action: act.action,
        detail: act.detail,
        page: act.page,
      });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: '批量记录失败' });
  }
});

export default router;
