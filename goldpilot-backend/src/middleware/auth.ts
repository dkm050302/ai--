import { Request, Response, NextFunction } from 'express';
import { authService, type TokenPayload } from '../services/auth';

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
      return res.status(401).json({
        success: false,
        message: '未提供认证令牌',
      });
    }

    // Bearer token格式
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    // 验证token
    const decoded = authService.verifyToken(token);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: '认证令牌无效或已过期',
      });
    }

    // 将用户信息挂载到req上
    req.user = decoded;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      message: '认证失败',
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
      }
    }

    next();
  } catch (error) {
    // 忽略错误，继续处理请求
    next();
  }
}
