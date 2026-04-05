import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * 登录速率限制 - 防止暴力破解
 * 默认：15 分钟内最多 5 个失败尝试
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 5, // 限制登录尝试次数
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // 使用用户名或邮箱作为 key，而不是 IP
    return (req.body?.username || req.body?.email || req.ip || 'unknown').toLowerCase();
  },
});

/**
 * 注册速率限制 - 防止滥用注册
 * 默认：1 小时内最多 3 个注册
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 小时
  max: 3, // 限制注册次数
  message: 'Too many accounts created from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * 邮件发送速率限制 - 防止邮件轰炸
 * 默认：1 小时内最多 5 封邮件
 */
export const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 小时
  max: 5, // 限制邮件发送次数
  message: 'Too many emails sent, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // 使用邮箱地址作为 key
    return (req.body?.email || req.ip || 'unknown').toLowerCase();
  },
});

/**
 * API 端点速率限制 - 防止特定端点被滥用
 * 默认：1 分钟内最多 30 个请求
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 120, // 限制请求数
  message: 'Too many requests to this endpoint, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * 严格的 API 端点速率限制 - 用于敏感操作
 * 默认：1 分钟内最多 120 个请求
 */
export const strictApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 120, // 限制请求数
  message: 'Too many requests to this endpoint, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * 自定义速率限制器工厂函数
 * @param windowMs 时间窗口（毫秒）
 * @param max 最大请求数
 * @param message 错误消息
 */
export function createLimiter(
  windowMs: number,
  max: number,
  message: string = 'Too many requests, please try again later.'
) {
  return rateLimit({
    windowMs,
    max,
    message,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/**
 * 基于用户 ID 的速率限制器
 * 用于已认证的用户
 */
export function createUserLimiter(windowMs: number, max: number) {
  return rateLimit({
    windowMs,
    max,
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      // 使用用户 ID 作为 key（需要在 auth 中间件后使用）
      return (req as any).user?.id?.toString() || req.ip || 'unknown';
    },
  });
}
