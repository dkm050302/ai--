/**
 * 前端日志工具
 */

const LogLevel = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG',
} as const;

type LogLevelType = typeof LogLevel[keyof typeof LogLevel];

class Logger {
  private isDevelopment = import.meta.env.DEV;

  /**
   * 格式化时间戳
   */
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * 格式化日志消息
   */
  private format(level: LogLevelType, message: string, meta?: any): string {
    const timestamp = this.getTimestamp();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level}] ${message}${metaStr}`;
  }

  /**
   * 错误日志
   */
  error(message: string, error?: Error | any): void {
    console.error(this.format(LogLevel.ERROR, message));
    if (error) {
      if (error instanceof Error) {
        console.error(`  Message: ${error.message}`);
        console.error(`  Stack: ${error.stack}`);
      } else {
        console.error(`  Details:`, error);
      }
    }
  }

  /**
   * 警告日志
   */
  warn(message: string, meta?: any): void {
    console.warn(this.format(LogLevel.WARN, message, meta));
  }

  /**
   * 信息日志
   */
  info(message: string, meta?: any): void {
    console.log(this.format(LogLevel.INFO, message, meta));
  }

  /**
   * 调试日志（仅在开发环境输出）
   */
  debug(message: string, meta?: any): void {
    if (this.isDevelopment) {
      console.log(this.format(LogLevel.DEBUG, message, meta));
    }
  }

  /**
   * API请求日志
   */
  api(method: string, url: string, status?: number, duration?: number): void {
    const statusStr = status ? ` ${status}` : '';
    const durationStr = duration ? ` ${duration}ms` : '';
    console.log(`[API] ${method} ${url}${statusStr}${durationStr}`);
  }
}

export const logger = new Logger();
