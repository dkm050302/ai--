import { Request, Response, NextFunction } from 'express';
import { authService, type TokenPayload } from '../services/auth';
import { UserModel } from '../models/User';
import bcrypt from 'bcryptjs';

const DEMO_MODE = process.env.DEMO_MODE !== 'false';
const DEMO_ACCOUNT_ID = process.env.DEMO_ACCOUNT_ID || '27238218';
const DEMO_SERVER = process.env.DEMO_SERVER || 'VTMarkets-Live 8';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Abc1234@';

async function getDemoUserPayload(): Promise<TokenPayload> {
  let user = await UserModel.findByAccountId(DEMO_ACCOUNT_ID, DEMO_SERVER);

  if (!user) {
    user = await UserModel.create({
      accountId: DEMO_ACCOUNT_ID,
      password: await bcrypt.hash(DEMO_PASSWORD, 10),
      server: DEMO_SERVER,
      accountInfo: {
        balance: 0,
        equity: 0,
        margin: 0,
        freeMargin: 0,
        positions: [],
        dailyPnl: 0,
      },
    });
  }

  return {
    userId: user._id.toString(),
    accountId: user.accountId,
    server: user.server,
  };
}

// 扩展Request类型，添加user属性
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/**
 * JWT认证中间件
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // 从header获取token
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      if (DEMO_MODE) {
        req.user = await getDemoUserPayload();
        return next();
      }

      return res.status(401).json({
        success: false,
        message: '未提供认证令牌',
        code: 'NO_TOKEN',
      });
    }

    // Bearer token格式
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    // 验证token
    const decoded = authService.verifyToken(token);

    if (!decoded) {
      if (DEMO_MODE) {
        req.user = await getDemoUserPayload();
        return next();
      }

      return res.status(401).json({
        success: false,
        message: '认证令牌无效，请清除浏览器缓存后重新登录',
        code: 'INVALID_TOKEN',
      });
    }

    // 将用户信息挂载到req上
    req.user = decoded;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      message: '认证失败，请重新登录',
      code: 'AUTH_ERROR',
    });
  }
}

/**
 * 可选认证中间件（不强制登录）
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader) {
      const token = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : authHeader;

      const decoded = authService.verifyToken(token);
      if (decoded) {
        req.user = decoded;
        return next();
      }
    }

    if (DEMO_MODE) {
      req.user = await getDemoUserPayload();
    }

    next();
  } catch (error) {
    if (DEMO_MODE) {
      try {
        req.user = await getDemoUserPayload();
      } catch {
        // 忽略错误，继续处理请求
      }
    }

    next();
  }
}
