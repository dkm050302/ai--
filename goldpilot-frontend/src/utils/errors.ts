import { message } from 'antd';
import { logger } from './logger';
import type { ApiResponse } from '@/types';

/**
 * API错误类
 */
export class ApiError extends Error {
  code: string;
  statusCode: number;

  constructor(
    code: string,
    statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * 处理API响应错误
 */
export function handleApiError<T>(
  response: ApiResponse<T>,
  silent = false
): T | null {
  if (!response.success) {
    const error = new ApiError(
      response.error?.code || 'UNKNOWN_ERROR',
      0,
      response.error?.message || 'Unknown error'
    );

    logger.error(`API Error: ${error.code}`, error);

    if (!silent) {
      message.error(error.message);
    }

    throw error;
  }

  return response.data || null;
}

/**
 * 处理异步API错误
 */
export function withApiErrorHandler<T>(
  promise: Promise<ApiResponse<T>>,
  silent = false
): Promise<T> {
  return promise.then(response => {
    if (!response.success) {
      const error = new ApiError(
        response.error?.code || 'UNKNOWN_ERROR',
        0,
        response.error?.message || 'Unknown error'
      );

      logger.error(`API Error: ${error.code}`, error);

      if (!silent) {
        message.error(error.message);
      }

      throw error;
    }

    return response.data as T;
  }).catch(error => {
    // 如果已经是ApiError，直接抛出
    if (error instanceof ApiError) {
      throw error;
    }

    // 处理网络错误
    logger.error('Network Error:', error);
    if (!silent) {
      message.error('网络连接失败，请检查网络设置');
    }

    throw error;
  });
}

/**
 * 显示成功消息
 */
export function showSuccess(msg: string): void {
  message.success(msg);
  logger.info(`Success: ${msg}`);
}

/**
 * 显示警告消息
 */
export function showWarning(msg: string): void {
  message.warning(msg);
  logger.warn(`Warning: ${msg}`);
}

/**
 * 显示信息消息
 */
export function showInfo(msg: string): void {
  message.info(msg);
  logger.info(`Info: ${msg}`);
}
