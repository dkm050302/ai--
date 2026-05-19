import { Router } from 'express';
import { authService } from '../services/auth';
import { authMiddleware } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/auth/register
 * 用户注册
 */
router.post('/register', async (req, res) => {
  try {
    const { accountId, password, server } = req.body;

    // 验证必填字段
    if (!accountId || !password || !server) {
      return res.status(400).json({
        success: false,
        message: '请填写完整的注册信息',
      });
    }

    // 验证账号格式
    if (typeof accountId !== 'string' || accountId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: '账号格式不正确',
      });
    }

    // 验证密码长度
    if (typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({
        success: false,
        message: '密码长度至少4位',
      });
    }

    // 调用注册服务
    const result = await authService.register({
      accountId: accountId.trim(),
      password,
      server: server.trim(),
    });

    if (result.success) {
      logger.info(`User registered: ${accountId}@${server}`);
      return res.status(201).json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Register endpoint error:', error);
    return res.status(500).json({
      success: false,
      message: '服务器错误，请稍后重试',
    });
  }
});

/**
 * POST /api/auth/login
 * 用户登录
 */
router.post('/login', async (req, res) => {
  try {
    const { accountId, password, server } = req.body;

    // 验证必填字段
    if (!accountId || !password || !server) {
      return res.status(400).json({
        success: false,
        message: '请填写完整的登录信息',
      });
    }

    // 调用登录服务
    const result = await authService.login({
      accountId: accountId.trim(),
      password,
      server: server.trim(),
    });

    if (result.success) {
      logger.info(`User logged in: ${accountId}@${server}`);
      return res.json(result);
    } else {
      // 如果是用户不存在，提示去注册
      if (result.message === '账号或密码错误') {
        return res.status(401).json({
          success: false,
          message: '账号或密码错误，如果是首次使用请先注册',
        });
      }
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Login endpoint error:', error);
    return res.status(500).json({
      success: false,
      message: '服务器错误，请稍后重试',
    });
  }
});

/**
 * GET /api/auth/me
 * 获取当前用户信息
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '未授权',
      });
    }

    // 获取完整用户信息
    const user = await authService.getUserById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在',
      });
    }

    return res.json({
      success: true,
      data: {
        accountId: user.accountId,
        server: user.server,
        accountInfo: user.accountInfo,
      },
    });
  } catch (error) {
    logger.error('Get user endpoint error:', error);
    return res.status(500).json({
      success: false,
      message: '服务器错误，请稍后重试',
    });
  }
});

/**
 * POST /api/auth/logout
 * 用户登出（前端删除token即可）
 */
router.post('/logout', (req, res) => {
  return res.json({
    success: true,
    message: '登出成功',
  });
});

export default router;
