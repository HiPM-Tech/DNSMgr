/**
 * HiDNS 统一日志系统
 * 
 * 项目理念：详细的日志是调试和监控的基础
 * 所有模块都应该使用此日志系统记录关键操作
 * 
 * 审查要求：
 * - 日志必须包含上下文信息（模块名、函数名、行号等）
 * - 日志必须包含详细错误信息（错误类型、错误消息、错误栈等）
 * - 日志必须包含详细操作信息（操作类型、操作对象、操作结果等）
 */

/**
 * 日志级别
 *
 * - trace: 高频率的底层调试信息（协议帧、原始报文、循环/定时器每次触发等），仅开发环境开启
 * - debug: 低频率的调试信息（请求参数、响应摘要、状态变化等），开发环境默认开启
 * - info:  正常业务流程的关键节点信息（操作成功、任务启停、连接建立等），生产环境默认开启
 * - warn:  预期内的异常或降级处理（重试、限流、熔断、降级、配置回退等），需要关注但无需立即处理
 * - error: 预期外的错误或异常（数据库失败、第三方服务故障、未捕获异常等），需要立即关注和处理
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

/** 绑定模块名的子日志器类型 */
export interface SubLogger {
  /** 高频率底层调试信息，仅开发环境开启 */
  trace: (message: string, data?: unknown) => void;
  /** 低频率调试信息，开发环境默认开启 */
  debug: (message: string, data?: unknown) => void;
  /** 正常业务流程关键节点信息，生产环境默认开启 */
  info: (message: string, data?: unknown) => void;
  /** 预期内的异常或降级处理，需关注但无需立即处理 */
  warn: (message: string, data?: unknown) => void;
  /** 预期外的错误或异常，需立即关注和处理 */
  error: (message: string, data?: unknown) => void;
  /** 创建嵌套子模块日志器，输出为 [父模块] [子模块] */
  sub: (name: string) => SubLogger;
  /** 添加自定义标签，输出为 ["标签1"] ["标签2"] */
  tag: (...args: string[]) => SubLogger;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  subModules?: string[];
  tags?: string[];
  message: string;
  data?: unknown;
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
  private useColors: boolean;

  // ANSI 颜色代码
  private readonly colors = {
    reset: '\x1b[0m',
    trace: '\x1b[90m',     // 深灰色（比 debug 更淡）
    debug: '\x1b[36m',      // 青色
    info: '\x1b[32m',       // 绿色
    warn: '\x1b[33m',       // 黄色
    error: '\x1b[31m',      // 红色
    timestamp: '\x1b[90m',  // 灰色
    module: '\x1b[35m',     // 紫色
    context: '\x1b[34m',    // 蓝色
  };

  private constructor() {
    // 从独立的环境变量 HIDNS_LOG_LEVEL 读取日志级别，默认为 'info'
    const envLevel = (typeof process !== 'undefined' && process.env?.HIDNS_LOG_LEVEL) as LogLevel | undefined;
    const validLevels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error'];
    this.logLevel = envLevel && validLevels.includes(envLevel) ? envLevel : 'info';
    
    // 检测是否支持彩色输出（默认启用，可通过 HIDNS_NO_COLOR=1 禁用）
    const noColor = typeof process !== 'undefined' && (
      process.env?.NO_COLOR === '1' || 
      process.env?.HIDNS_NO_COLOR === '1'
    );
    const hasTTY = typeof process !== 'undefined' && process.stdout?.isTTY;
    this.useColors = !noColor && (hasTTY || true); // 默认启用彩色
    
    // 初始化时记录日志级别
    console.info(`[Logger] Log level set to: ${this.logLevel}, Colors: ${this.useColors ? 'enabled' : 'disabled'}`);
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
    const levels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
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
    // 构建模块路径: [主模块] [子模块1] [子模块2] ["标签1"] ["标签2"]
    const modules = [entry.module, ...(entry.subModules || [])].map(m => `[${m}]`).join(' ');
    const tagStr = (entry.tags || []).map(t => `["${t}"]`).join(' ');
    const moduleSection = tagStr ? `${modules} ${tagStr}` : modules;
    
    if (!this.useColors) {
      return `${time} ${level} ${moduleSection} ${entry.message}`;
    }
    
    // 应用颜色
    const coloredTime = `${this.colors.timestamp}${time}${this.colors.reset}`;
    const coloredLevel = this.getColorForLevel(entry.level) + level + this.colors.reset;
    const coloredModules = modules.split(' ').map(m => `${this.colors.module}${m}${this.colors.reset}`).join(' ');
    const coloredTags = tagStr ? ' ' + tagStr.split(' ').map(t => `${this.colors.context}${t}${this.colors.reset}`).join(' ') : '';
    
    return `${coloredTime} ${coloredLevel} ${coloredModules}${coloredTags} ${entry.message}`;
  }

  private getColorForLevel(level: LogLevel): string {
    return this.colors[level] || this.colors.reset;
  }

  /* 内部日志方法，SubLoggerImpl 通过 logger 实例调用 */
  log(level: LogLevel, module: string, message: string, data?: unknown, subModules?: string[], tags?: string[]): void {
    if (!this.shouldLog(level)) return;

    // 如果数据是错误类型，格式化为详细错误信息
    let formattedData = data;
    if (data instanceof Error || (data && typeof data === 'object' && 'message' in data)) {
      formattedData = this.formatError(data);
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      subModules,
      tags,
      message,
      data: formattedData,
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

  trace(module: string, message: string, data?: unknown): void {
    this.log('trace', module, message, data);
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

  /** 创建嵌套模块日志器 */
  createSubLogger(module: string): SubLogger {
    return new SubLoggerImpl(this, [module], []);
  }
}

/** 嵌套模块日志器实现，支持 .sub() 和 .tag() 链式调用 */
class SubLoggerImpl implements SubLogger {
  constructor(
    private logger: Logger,
    private modules: string[],
    private tags: string[]
  ) {}

  sub(name: string): SubLogger {
    return new SubLoggerImpl(this.logger, [...this.modules, name], this.tags);
  }

  tag(...args: string[]): SubLogger {
    return new SubLoggerImpl(this.logger, this.modules, [...this.tags, ...args]);
  }

  trace(message: string, data?: unknown) { this.emit('trace', message, data); }
  debug(message: string, data?: unknown) { this.emit('debug', message, data); }
  info(message: string, data?: unknown) { this.emit('info', message, data); }
  warn(message: string, data?: unknown) { this.emit('warn', message, data); }
  error(message: string, data?: unknown) { this.emit('error', message, data); }

  private emit(level: LogLevel, message: string, data?: unknown) {
    const [primaryModule, ...subModules] = this.modules;
    this.logger.log(level, primaryModule, message, data, subModules, this.tags);
  }
}

export const logger = Logger.getInstance();

// 便捷导出
export const log = {
  trace: (module: string, message: string, data?: unknown) => logger.trace(module, message, data),
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

/** 创建绑定模块名的日志器，调用时无需重复传入 module 参数 */
export const createLogger = (module: string) => logger.createSubLogger(module);
