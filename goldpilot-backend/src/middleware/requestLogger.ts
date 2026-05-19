import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * 请求日志中间件
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // 记录请求开始
  logger.debug(`Request started: ${req.method} ${req.path}`);

  // 监听响应完成
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // 根据状态码决定日志级别
    if (statusCode >= 500) {
      logger.error(`Request failed: ${req.method} ${req.path} - ${statusCode} (${duration}ms)`);
    } else if (statusCode >= 400) {
      logger.warn(`Request error: ${req.method} ${req.path} - ${statusCode} (${duration}ms)`);
    } else {
      logger.debug(`Request completed: ${req.method} ${req.path} - ${statusCode} (${duration}ms)`);
    }
  });

  next();
}

/**
 * 详细的请求日志（仅开发环境）
 */
export function detailedRequestLogger(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV !== 'development') {
    return next();
  }

  const startTime = Date.now();

  // 打印请求详情
  console.log('\n' + '='.repeat(60));
  console.log(`📥 ${new Date().toISOString()}`);
  console.log(`${req.method} ${req.path}`);
  if (Object.keys(req.query || {}).length > 0) {
    console.log('Query:', req.query);
  }
  if (Object.keys(req.body || {}).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  console.log('IP:', req.ip);
  console.log('='.repeat(60));

  // 监听响应完成
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusEmoji = res.statusCode < 300 ? '✅' : res.statusCode < 500 ? '⚠️' : '❌';
    console.log(`${statusEmoji} Response: ${res.statusCode} - ${duration}ms\n`);
  });

  next();
}
