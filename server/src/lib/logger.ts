/**
 * HiDNS 统一日志系统
 *
 * 日志格式: 日期 级别 [主模块名] [子模块.三级模块] [函数名] [L行号] ["自定义标签"] 内容
 * 示例:
 *   2026-06-07T12:00:00.000Z  INFO [BAL] [BusinessAdapter] [execQuery] [L42] Executing query ...
 *   2026-06-07T12:00:00.000Z  INFO [DSM] [Reconciler.Table] [reconcile] [L88] ["DRY_RUN"] Would create table: xxx
 *   2026-06-07T12:00:00.000Z DEBUG [DL] [MySQL.Pool] [query] [L55] Creating connection pool ...
 *   2026-06-07T12:00:00.000Z  INFO [DNS] [Provider.Aliyun.Adapter] [getDomainList] [L125] ["SUCCESS"] Query succeeded
 *
 * 项目理念：详细的日志是调试和监控的基础
 * 所有模块都应该使用此日志系统记录关键操作
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export interface SubLogger {
  trace: (message: string, data?: unknown) => void;
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
  /** 创建嵌套子模块日志器；多个子模块输出为 [主模块] [子模块.三级模块] */
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
  callerFunction?: string;
  callerLine?: number;
  message: string;
  data?: unknown;
}

interface ErrorDetails {
  type: string;
  message: string;
  stack?: string;
  code?: string | number;
  cause?: unknown;
  [key: string]: unknown;
}

type Dict = Record<string, unknown>;

const SENSITIVE_KEYS = new Set([
  'password', 'passwd', 'secret', 'token', 'accesstoken', 'access_token', 'refreshtoken', 'refresh_token',
  'apikey', 'api_key', 'key', 'authorization', 'cookie', 'set-cookie', 'privatekey', 'private_key',
  'clientsecret', 'client_secret', 'jwt', 'session', 'signature', 'sign',
]);

class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;
  private useColors: boolean;

  private readonly colors = {
    reset: '\x1b[0m',
    trace: '\x1b[90m',
    debug: '\x1b[36m',
    info: '\x1b[32m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
    timestamp: '\x1b[90m',
    module: '\x1b[35m',
    context: '\x1b[34m',
  };

  private constructor() {
    const envLevel = (typeof process !== 'undefined' && process.env?.HIDNS_LOG_LEVEL) as LogLevel | undefined;
    const validLevels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error'];
    this.logLevel = envLevel && validLevels.includes(envLevel) ? envLevel : 'info';

    const noColor = typeof process !== 'undefined' && (
      process.env?.NO_COLOR === '1' ||
      process.env?.HIDNS_NO_COLOR === '1'
    );
    const hasTTY = typeof process !== 'undefined' && process.stdout?.isTTY;
    this.useColors = !noColor && (hasTTY || true);

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

  private isSensitiveKey(key: string): boolean {
    return SENSITIVE_KEYS.has(key.toLowerCase().replace(/[\s.-]/g, '_')) || SENSITIVE_KEYS.has(key.toLowerCase().replace(/[\s._-]/g, ''));
  }

  private sanitizeData(data: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
    if (data === null || data === undefined) return data;
    if (typeof data === 'string') return data.length > 1000 ? `${data.slice(0, 1000)}...<truncated>` : data;
    if (typeof data === 'number' || typeof data === 'boolean' || typeof data === 'bigint') return data;
    if (typeof data === 'function') return `[Function ${(data as Function).name || 'anonymous'}]`;
    if (Buffer.isBuffer(data)) return `[Buffer length=${data.length}]`;
    if (data instanceof Date) return data.toISOString();
    if (data instanceof Error) return this.formatError(data, depth, seen);
    if (depth >= 5) return '[MaxDepth]';

    if (typeof data === 'object') {
      if (seen.has(data)) return '[Circular]';
      seen.add(data);

      if (Array.isArray(data)) {
        const items = data.slice(0, 50).map((item) => this.sanitizeData(item, depth + 1, seen));
        if (data.length > 50) items.push(`...${data.length - 50} more items`);
        return items;
      }

      const result: Dict = {};
      for (const [key, value] of Object.entries(data as Dict).slice(0, 80)) {
        result[key] = this.isSensitiveKey(key) ? '[REDACTED]' : this.sanitizeData(value, depth + 1, seen);
      }
      return result;
    }

    return String(data);
  }

  private formatError(error: unknown, depth = 0, seen = new WeakSet<object>()): ErrorDetails {
    if (error instanceof Error) {
      const details: ErrorDetails = {
        type: error.constructor.name,
        message: error.message,
        stack: error.stack,
      };
      const err = error as Error & Dict;
      for (const key of ['code', 'errno', 'syscall', 'status', 'statusCode']) {
        if (err[key] !== undefined) details[key] = err[key];
      }
      if (err.cause !== undefined) details.cause = this.sanitizeData(err.cause, depth + 1, seen);
      if ('errors' in error && Array.isArray((error as Error & { errors?: unknown[] }).errors)) {
        details.errors = (error as Error & { errors: unknown[] }).errors.map((item: unknown) => this.sanitizeData(item, depth + 1, seen));
      }
      return details;
    }

    if (error && typeof error === 'object') {
      const obj = error as Dict;
      return {
        type: 'Object',
        message: obj.message ? String(obj.message) : '[object Object]',
        ...this.sanitizeData(obj, depth + 1, seen) as Dict,
      };
    }

    return {
      type: typeof error,
      message: String(error),
    };
  }

  private formatModules(module: string, subModules?: string[]): string {
    const primary = `[${module}]`;
    const subModulePath = (subModules || []).filter(Boolean).join('.');
    return subModulePath ? `${primary} [${subModulePath}]` : primary;
  }

  private formatMessage(entry: LogEntry): string {
    const time = entry.timestamp;
    const level = entry.level.toUpperCase().padStart(5);
    const modules = this.formatModules(entry.module, entry.subModules);
    const showCaller = this.logLevel === 'trace' || entry.level === 'warn' || entry.level === 'error';
    const callerStr = showCaller && entry.callerFunction && entry.callerLine ? ` [${entry.callerFunction}] [L${entry.callerLine}]` : '';
    const tagStr = (entry.tags || []).map(t => `["${t}"]`).join(' ');
    const middleSection = [modules, callerStr, tagStr ? ` ${tagStr}` : ''].filter(Boolean).join('');

    if (!this.useColors) {
      return `${time} ${level} ${middleSection} ${entry.message}`;
    }

    const coloredTime = `${this.colors.timestamp}${time}${this.colors.reset}`;
    const coloredLevel = this.getColorForLevel(entry.level) + level + this.colors.reset;
    const moduleParts = modules.split(' ').map(m => `${this.colors.module}${m}${this.colors.reset}`).join(' ');
    const coloredCaller = callerStr ? callerStr.split(' ').map(m => `${this.colors.context}${m}${this.colors.reset}`).join(' ') : '';
    const coloredTags = tagStr ? ' ' + tagStr.split(' ').map(t => `${this.colors.context}${t}${this.colors.reset}`).join(' ') : '';

    return `${coloredTime} ${coloredLevel} ${moduleParts}${coloredCaller}${coloredTags} ${entry.message}`;
  }

  private getColorForLevel(level: LogLevel): string {
    return this.colors[level] || this.colors.reset;
  }

  log(level: LogLevel, module: string, message: string, data?: unknown, subModules?: string[], tags?: string[], callerFunction?: string, callerLine?: number): void {
    if (!this.shouldLog(level)) return;

    const formattedData = data !== undefined ? this.sanitizeData(data) : undefined;
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      subModules,
      tags,
      callerFunction,
      callerLine,
      message,
      data: formattedData,
    };

    const formatted = this.formatMessage(entry);
    const payload = formattedData !== undefined ? formattedData : '';

    switch (level) {
      case 'trace':
        console.debug(formatted, payload);
        break;
      case 'debug':
        console.debug(formatted, payload);
        break;
      case 'info':
        console.info(formatted, payload);
        break;
      case 'warn':
        console.warn(formatted, payload);
        break;
      case 'error':
        console.error(formatted, payload);
        break;
    }
  }

  createSubLogger(module: string): SubLogger {
    return new SubLoggerImpl(this, [module], []);
  }
}

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

  private getCallerInfo(): { functionName: string; lineNumber: number } | null {
    const stack = new Error().stack;
    if (!stack) return null;

    for (const rawLine of stack.split('\n').slice(1)) {
      const frame = rawLine.trim();
      if (!frame || frame.includes('/lib/logger.') || frame.includes('\\lib\\logger.')) continue;
      const match = frame.match(/(?:at\s+)?(?:(.*?)\s+\()?(.*?):(\d+):(\d+)\)?$/);
      if (!match) continue;
      const functionName = (match[1] || '<anonymous>').replace(/^async\s+/, '');
      return {
        functionName,
        lineNumber: parseInt(match[3], 10),
      };
    }

    return null;
  }

  private emit(level: LogLevel, message: string, data?: unknown) {
    const callerInfo = this.getCallerInfo();
    const [primaryModule, ...subModules] = this.modules;
    this.logger.log(level, primaryModule, message, data, subModules, this.tags, callerInfo?.functionName, callerInfo?.lineNumber);
  }
}

export const logger = Logger.getInstance();

export default logger;

/** 创建绑定模块名的日志器，调用时无需重复传入 module 参数 */
export const createLogger = (module: string) => logger.createSubLogger(module);
