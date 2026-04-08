/**
 * DNSMgr 统一日志系统
 * 
 * 项目理念：详细的日志是调试和监控的基础
 * 所有模块都应该使用此日志系统记录关键操作
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: unknown;
}

class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = 'info';

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  private formatMessage(entry: LogEntry): string {
    const time = entry.timestamp;
    const level = entry.level.toUpperCase().padStart(5);
    const module = `[${entry.module}]`;
    return `${time} ${level} ${module} ${entry.message}`;
  }

  private log(level: LogLevel, module: string, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      data,
    };

    const formatted = this.formatMessage(entry);

    switch (level) {
      case 'debug':
        console.debug(formatted, data !== undefined ? data : '');
        break;
      case 'info':
        console.info(formatted, data !== undefined ? data : '');
        break;
      case 'warn':
        console.warn(formatted, data !== undefined ? data : '');
        break;
      case 'error':
        console.error(formatted, data !== undefined ? data : '');
        break;
    }
  }

  debug(module: string, message: string, data?: unknown): void {
    this.log('debug', module, message, data);
  }

  info(module: string, message: string, data?: unknown): void {
    this.log('info', module, message, data);
  }

  warn(module: string, message: string, data?: unknown): void {
    this.log('warn', module, message, data);
  }

  error(module: string, message: string, data?: unknown): void {
    this.log('error', module, message, data);
  }

  // DNS Provider 专用日志方法
  logProviderRequest(provider: string, method: string, url: string, params?: unknown): void {
    this.info(`DNS:${provider}`, `Request: ${method} ${url.substring(0, 200)}`, params);
  }

  logProviderResponse(provider: string, status: number, success: boolean, data?: unknown): void {
    this.info(`DNS:${provider}`, `Response: status=${status}, success=${success}`, data);
  }

  logProviderError(provider: string, error: unknown): void {
    this.error(`DNS:${provider}`, 'API Error', error);
  }

  // 数据库操作日志
  logDbQuery(operation: string, sql: string, params?: unknown): void {
    this.debug('DB', `${operation}: ${sql.substring(0, 100)}`, params);
  }

  logDbError(operation: string, error: unknown): void {
    this.error('DB', `Error in ${operation}`, error);
  }

  // HTTP 请求日志
  logHttpRequest(method: string, path: string, body?: unknown): void {
    this.debug('HTTP', `Request: ${method} ${path}`, body);
  }

  logHttpResponse(method: string, path: string, status: number, duration: number): void {
    this.info('HTTP', `Response: ${method} ${path} - ${status} (${duration}ms)`);
  }

  // 业务操作日志
  logBusiness(operation: string, message: string, data?: unknown): void {
    this.info('Business', `${operation}: ${message}`, data);
  }

  logBusinessError(operation: string, error: unknown): void {
    this.error('Business', `Error in ${operation}`, error);
  }
}

export const logger = Logger.getInstance();

// 便捷导出
export const log = {
  debug: (module: string, message: string, data?: unknown) => logger.debug(module, message, data),
  info: (module: string, message: string, data?: unknown) => logger.info(module, message, data),
  warn: (module: string, message: string, data?: unknown) => logger.warn(module, message, data),
  error: (module: string, message: string, data?: unknown) => logger.error(module, message, data),
  
  // DNS Provider
  providerRequest: (provider: string, method: string, url: string, params?: unknown) => 
    logger.logProviderRequest(provider, method, url, params),
  providerResponse: (provider: string, status: number, success: boolean, data?: unknown) => 
    logger.logProviderResponse(provider, status, success, data),
  providerError: (provider: string, error: unknown) => 
    logger.logProviderError(provider, error),
  
  // Database
  dbQuery: (operation: string, sql: string, params?: unknown) => 
    logger.logDbQuery(operation, sql, params),
  dbError: (operation: string, error: unknown) => 
    logger.logDbError(operation, error),
  
  // HTTP
  httpRequest: (method: string, path: string, body?: unknown) => 
    logger.logHttpRequest(method, path, body),
  httpResponse: (method: string, path: string, status: number, duration: number) => 
    logger.logHttpResponse(method, path, status, duration),
  
  // Business
  business: (operation: string, message: string, data?: unknown) => 
    logger.logBusiness(operation, message, data),
  businessError: (operation: string, error: unknown) => 
    logger.logBusinessError(operation, error),
};

export default logger;
