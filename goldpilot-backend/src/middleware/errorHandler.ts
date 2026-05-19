import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * 应用错误类
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public isOperational = true
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 异步路由包装器，捕获未处理的异常
 */
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 全局错误处理中间件
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // 记录错误日志
  logger.error(`Error on ${req.method} ${req.path}`, err);

  // 处理应用错误
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  // 处理Mongoose验证错误
  if (err.name === 'ValidationError') {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: err.message,
      },
    });
    return;
  }

  // 处理Mongoose CastError（无效的ID格式）
  if (err.name === 'CastError') {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_ID',
        message: 'Invalid ID format',
      },
    });
    return;
  }

  // 处理JSON解析错误
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Invalid JSON format',
      },
    });
    return;
  }

  // 默认内部服务器错误
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development'
        ? err.message
        : 'Internal server error',
    },
  });
}

/**
 * 404错误处理
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${req.method} ${req.path} not found`,
    },
  });
}

/**
 * 请求验证错误
 */
export function validationError(message: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', message);
}

/**
 * 未授权错误
 */
export function unauthorizedError(message: string = 'Unauthorized'): AppError {
  return new AppError(401, 'UNAUTHORIZED', message);
}

/**
 * 禁止访问错误
 */
export function forbiddenError(message: string = 'Forbidden'): AppError {
  return new AppError(403, 'FORBIDDEN', message);
}

/**
 * 资源未找到错误
 */
export function notFoundError(message: string = 'Resource not found'): AppError {
  return new AppError(404, 'NOT_FOUND', message);
}
