# 密码加密回退策略

## 概述

HiDNS 使用 RSA-OAEP（通过 Web Crypto API）在密码传输到服务器之前进行加密。本文档描述加密不可用时的回退策略。

## 协议检测

| 协议 | 加密可用 | 行为 |
|------|---------|------|
| HTTPS | 是（Web Crypto API 可用） | 加密**必须**；失败则阻止登录 |
| HTTP | 否（非安全上下文中 Web Crypto API 不可用） | 加密**尝试**；失败则触发用户确认回退 |

## 流程图

```
登录尝试
     │
     ▼
┌─────────────────────┐
│ encryptPassword()   │
│ (RSA-OAEP)          │
└─────────┬───────────┘
          │
    ┌─────┴─────┐
    │ 成功？    │
    └─────┬─────┘
     是   │  否
     │    │
     ▼    ▼
  密文   ┌──────────────────────────┐
  登录   │ 协议 = HTTPS？           │
         └──────┬───────────────────┘
           是   │  否
           │    │
           ▼    ▼
        阻止   显示警告弹窗
        登录   （明文传输风险）
               │
         ┌─────┴─────┐
         │ 用户      │
         │ 确认？    │
         └─────┬─────┘
          是   │  否
          │    │
          ▼    ▼
       明文   阻止
       登录   登录
```

## 安全考量

1. **HTTPS 模式**：密码在传输前始终进行 RSA 加密。加密失败（如服务器公钥不可用）会硬性阻止——用户无法继续登录。

2. **HTTP 模式**：Web Crypto API 的 `SubtleCrypto.encrypt()` 仅在安全上下文（HTTPS 或 localhost）中可用。在纯 HTTP 下，`encryptPassword()` 会抛出异常。回退策略允许用户在通过弹窗确认风险后，以明文方式传输密码继续登录。

3. **服务端接受**：服务端需配置为同时接受加密和明文密码（登录 API 中的 `encrypted` 布尔标志用于指示密码是否经过 RSA 加密）。

## 实现

### 客户端（`LoginCard.tsx`）

```typescript
async function encryptWithFallback(
  password: string,
  confirmFn: () => Promise<boolean>,
  encryptionFailed: string,
): Promise<{ encrypted: string; plaintext: boolean }> {
  try {
    const encrypted = await encryptPassword(password);
    return { encrypted, plaintext: false };
  } catch {
    // HTTPS：加密失败是致命错误
    if (window.location.protocol === 'https:') {
      throw new Error(encryptionFailed);
    }
    // HTTP：显示确认弹窗，等待用户选择
    const confirmed = await confirmFn();
    if (!confirmed) throw new Error(encryptionFailed);
    return { encrypted: password, plaintext: true };
  }
}
```

### i18n 键

| 键 | 用途 | 示例（中文） |
|----|------|-------------|
| `login.httpWarning` | 弹窗正文 | "当前使用 HTTP 协议，密码将以明文传输，存在安全风险。是否继续？" |
| `login.httpWarningTitle` | 弹窗标题 | "不安全的连接" |
| `login.httpWarningConfirm` | 确认按钮 | "继续" |
| `login.httpWarningCancel` | 取消按钮 | "取消" |

### 登录 API 标志

登录请求包含 `encrypted` 布尔值，告知服务端如何解析密码：

```json
{
  "username": "admin",
  "password": "...",
  "encrypted": true   // 使用明文回退时为 false
}
```

## 何时触发？

- 用户通过 `http://`（非 `https://`）访问 HiDNS
- 服务端 RSA 公钥端点（`/api/auth/public-key`）不可达
- Web Crypto API 不可用（旧版浏览器、非安全上下文）
