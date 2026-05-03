/**
 * DNSMgr 统一日志系统
 * 
 * 项目理念：详细的日志是调试和监控的基础
 * 所有模块都应该使用此日志系统记录关键操作
 * 
 * 审查要求：
 * - 日志必须包含上下文信息（模块名、函数名、行号等）
 * - 日志必须包含详细错误信息（错误类型、错误消息、错误栈等）
 * - 日志必须包含详细操作信息（操作类型、操作对象、操作结果等）
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: unknown;
  context?: LogContext;
}

interface LogContext {
  function?: string;
  line?: number;
  column?: number;
  file?: string;
}

interface ErrorDetails {
  type: string;
  message: string;
  stack?: string;
  code?: string | number;
  [key: string]: unknown;
}

class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;

  private constructor() {
    // 从独立的环境变量 DNSMGR_LOG_LEVEL 读取日志级别，默认为 'info'
    const envLevel = (typeof process !== 'undefined' && process.env?.DNSMGR_LOG_LEVEL) as LogLevel | undefined;
    const validLevels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    this.logLevel = envLevel && validLevels.includes(envLevel) ? envLevel : 'info';
    
    // 初始化时记录日志级别
    console.info(`[Logger] Log level set to: ${this.logLevel}`);
  }

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

  private getCallerInfo(): LogContext {
    const stack = new Error().stack;
    if (!stack) return {};

    const lines = stack.split('\n');
    // 跳过前3行（Error、getCallerInfo、log方法本身）
    const callerLine = lines[4] || lines[3];
    if (!callerLine) return {};

    const match = callerLine.match(/at\s+(?:(\S+)\s+\()?([^)]+)\)?/);
    if (!match) return {};

    const functionName = match[1] || 'anonymous';
    const location = match[2];
    
    const locationMatch = location.match(/([^:]+):(\d+):(\d+)$/);
    if (locationMatch) {
      return {
        function: functionName,
        file: locationMatch[1],
        line: parseInt(locationMatch[2], 10),
        column: parseInt(locationMatch[3], 10),
      };
    }

    return { function: functionName, file: location };
  }

  private formatError(error: unknown): ErrorDetails {
    if (error instanceof Error) {
      return {
        type: error.constructor.name,
        message: error.message,
        stack: error.stack,
        ...(error as any).code && { code: (error as any).code },
      };
    }
    // 处理普通对象类型的错误数据
    if (error && typeof error === 'object') {
      const obj = error as Record<string, unknown>;
      return {
        type: 'Object',
        message: obj.message ? String(obj.message) : JSON.stringify(error),
        ...obj,
      };
    }
    return {
      type: typeof error,
      message: String(error),
    };
  }

  private formatMessage(entry: LogEntry): string {
    const time = entry.timestamp;
    const level = entry.level.toUpperCase().padStart(5);
    const module = `[${entry.module}]`;
    const context = entry.context?.function ? ` [${entry.context.function}]` : '';
    return `${time} ${level} ${module}${context} ${entry.message}`;
  }

  private log(level: LogLevel, module: string, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) return;

    const context = this.getCallerInfo();
    
    // 如果数据是错误类型，格式化为详细错误信息
    let formattedData = data;
    if (data instanceof Error || (data && typeof data === 'object' && 'message' in data)) {
      formattedData = this.formatError(data);
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      data: formattedData,
      context,
    };

    const formatted = this.formatMessage(entry);

    switch (level) {
      case 'debug':
        console.debug(formatted, formattedData !== undefined ? formattedData : '');
        break;
      case 'info':
        console.info(formatted, formattedData !== undefined ? formattedData : '');
        break;
      case 'warn':
        console.warn(formatted, formattedData !== undefined ? formattedData : '');
        break;
      case 'error':
        console.error(formatted, formattedData !== undefined ? formattedData : '');
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
    // DNS 请求日志降级为 debug，避免生产环境日志过多
    this.debug(`DNS:${provider}`, `Request: ${method} ${url.substring(0, 200)}`, {
      operationType: 'DNS_REQUEST',
      provider,
      method,
      url: url.substring(0, 200),
      params,
    });
  }

  logProviderResponse(provider: string, status: number, success: boolean, data?: unknown): void {
    // DNS 响应日志降级为 debug，错误响应使用 warn
    const logData = {
      operationType: 'DNS_RESPONSE',
      provider,
      status,
      success,
      data,
    };
    if (!success || status >= 400) {
      this.warn(`DNS:${provider}`, `Response: status=${status}, success=${success}`, logData);
    } else {
      this.debug(`DNS:${provider}`, `Response: status=${status}, success=${success}`, logData);
    }
  }

  logProviderError(provider: string, error: unknown): void {
    this.error(`DNS:${provider}`, 'API Error', {
      operationType: 'DNS_ERROR',
      provider,
      error: this.formatError(error),
    });
  }

  // 数据库操作日志
  logDbQuery(operation: string, sql: string, params?: unknown): void {
    this.debug('DB', `${operation}: ${sql.substring(0, 100)}`, {
      operationType: 'DB_QUERY',
      operation,
      sql: sql.substring(0, 100),
      params,
    });
  }

  logDbError(operation: string, error: unknown): void {
    this.error('DB', `Error in ${operation}`, {
      operationType: 'DB_ERROR',
      operation,
      error: this.formatError(error),
    });
  }

  // HTTP 请求日志
  logHttpRequest(method: string, path: string, body?: unknown): void {
    this.debug('HTTP', `Request: ${method} ${path}`, {
      operationType: 'HTTP_REQUEST',
      method,
      path,
      body,
    });
  }

  logHttpResponse(method: string, path: string, status: number, duration: number): void {
    // HTTP 响应日志降级为 debug，避免生产环境日志过多
    // 错误响应（>=400）仍使用 warn 级别
    const logData = {
      operationType: 'HTTP_RESPONSE',
      method,
      path,
      status,
      duration,
    };
    if (status >= 400) {
      this.warn('HTTP', `Response: ${method} ${path} - ${status} (${duration}ms)`, logData);
    } else {
      this.debug('HTTP', `Response: ${method} ${path} - ${status} (${duration}ms)`, logData);
    }
  }

  // 业务操作日志
  logBusiness(operation: string, message: string, data?: unknown): void {
    this.info('Business', `${operation}: ${message}`, {
      operationType: 'BUSINESS',
      operation,
      ...((typeof data === 'object' && data !== null) ? data : { data }),
    });
  }

  logBusinessError(operation: string, error: unknown): void {
    this.error('Business', `Error in ${operation}`, {
      operationType: 'BUSINESS_ERROR',
      operation,
      error: this.formatError(error),
    });
  }

  // 用户操作日志
  logUserAction(userId: number, action: string, target?: string, details?: unknown): void {
    this.info('User', `User ${userId} performed ${action}`, {
      operationType: 'USER_ACTION',
      userId,
      action,
      target,
      details,
    });
  }

  // 审计日志
  logAudit(userId: number, action: string, domain: string, data?: unknown): void {
    this.info('Audit', `User ${userId} ${action} on ${domain}`, {
      operationType: 'AUDIT',
      userId,
      action,
      domain,
      data,
    });
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
  
  // User
  userAction: (userId: number, action: string, target?: string, details?: unknown) =>
    logger.logUserAction(userId, action, target, details),
  
  // Audit
  audit: (userId: number, action: string, domain: string, data?: unknown) =>
    logger.logAudit(userId, action, domain, data),
};

export default logger;
