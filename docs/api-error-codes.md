# API 错误码说明

## HTTP 状态码

| 状态码 | 含义 | 说明 |
|--------|------|------|
| 200 | OK | 请求成功 |
| 201 | Created | 创建成功 |
| 400 | Bad Request | 请求参数错误 |
| 401 | Unauthorized | 未认证或 Token 无效 |
| 403 | Forbidden | 无权限访问 |
| 404 | Not Found | 资源不存在 |
| 409 | Conflict | 资源冲突 |
| 422 | Unprocessable Entity | 请求格式正确但语义错误 |
| 429 | Too Many Requests | 请求过于频繁 |
| 500 | Internal Server Error | 服务器内部错误 |
| 502 | Bad Gateway | 网关错误 |
| 503 | Service Unavailable | 服务不可用 |

## 业务错误码

### 通用错误 (1xxxxx)

| 错误码 | 错误信息 | 说明 |
|--------|----------|------|
| 100001 | 参数验证失败 | 请求参数不符合要求 |
| 100002 | 请求体格式错误 | JSON 格式不正确 |
| 100003 | 缺少必要参数 | 必填参数未提供 |
| 100004 | 参数类型错误 | 参数类型不匹配 |
| 100005 | 参数超出范围 | 参数值超出允许范围 |

### 认证错误 (2xxxxx)

| 错误码 | 错误信息 | 说明 |
|--------|----------|------|
| 200001 | 未提供认证信息 | 缺少 Authorization 头 |
| 200002 | 认证格式错误 | Token 格式不正确 |
| 200003 | Token 已过期 | JWT 或 API Token 已过期 |
| 200004 | Token 无效 | Token 不存在或已被删除 |
| 200005 | Token 已被禁用 | Token 被管理员禁用 |
| 200006 | Token 尚未生效 | 未到生效时间 |
| 200007 | 用户名或密码错误 | 登录凭证不正确 |
| 200008 | 账户已被锁定 | 多次登录失败被锁定 |
| 200009 | 账户已被禁用 | 用户账户被禁用 |
| 200010 | 需要双因素认证 | 2FA 验证失败或未提供 |
| 200011 | 双因素认证码错误 | TOTP 验证码不正确 |
| 200012 | 备份码已用完 | 所有备份码都已使用 |
| 200013 | OAuth 认证失败 | 第三方登录失败 |
| 200014 | OAuth 账号未绑定 | 需要先绑定 OAuth 账号 |

### 权限错误 (3xxxxx)

| 错误码 | 错误信息 | 说明 |
|--------|----------|------|
| 300001 | 权限不足 | 当前用户/Token 权限不够 |
| 300002 | 需要管理员权限 | 需要管理员或超级管理员 |
| 300003 | 需要超级管理员权限 | 仅超级管理员可操作 |
| 300004 | 无权访问该域名 | Token 未授权此域名 |
| 300005 | 无权访问该记录 | 对该记录无操作权限 |
| 300006 | 无权访问该账号 | 对该 DNS 账号无权限 |
| 300007 | 子域名权限受限 | 对该子域名无权限 |
| 300008 | 团队成员权限受限 | 团队成员权限不足 |

### 资源错误 (4xxxxx)

| 错误码 | 错误信息 | 说明 |
|--------|----------|------|
| 400001 | 资源不存在 | 请求的资源未找到 |
| 400002 | 域名不存在 | 域名 ID 不存在 |
| 400003 | 记录不存在 | 解析记录 ID 不存在 |
| 400004 | 用户不存在 | 用户 ID 不存在 |
| 400005 | 账号不存在 | DNS 账号 ID 不存在 |
| 400006 | Token 不存在 | API Token ID 不存在 |
| 400007 | 团队不存在 | 团队 ID 不存在 |
| 400008 | 资源已存在 | 重复创建相同资源 |
| 400009 | 域名已存在 | 该域名已添加 |
| 400010 | 记录冲突 | 相同记录已存在 |
| 400011 | 用户名已存在 | 用户名已被使用 |
| 400012 | 邮箱已存在 | 邮箱已被注册 |
| 400013 | CNAME 冲突 | CNAME 与其他记录冲突 |

### DNS 服务商错误 (5xxxxx)

| 错误码 | 错误信息 | 说明 |
|--------|----------|------|
| 500001 | DNS 服务商调用失败 | 服务商 API 返回错误 |
| 500002 | DNS 账号认证失败 | 服务商凭证无效 |
| 500003 | 服务商限流 | 触发服务商 API 限流 |
| 500004 | 服务商响应超时 | 服务商 API 超时 |
| 500005 | 域名在服务商不存在 | 服务商处无此域名 |
| 500006 | 记录同步失败 | 从服务商同步记录失败 |
| 500007 | 不支持的服务商 | 该服务商暂未支持 |
| 500008 | 服务商配置错误 | 服务商配置参数错误 |

### 系统错误 (9xxxxx)

| 错误码 | 错误信息 | 说明 |
|--------|----------|------|
| 900001 | 服务器内部错误 | 未知服务器错误 |
| 900002 | 数据库错误 | 数据库操作失败 |
| 900003 | 缓存错误 | 缓存操作失败 |
| 900004 | 邮件发送失败 | SMTP 发送失败 |
| 900005 | 通知发送失败 | Webhook/通知发送失败 |
| 900006 | 文件操作失败 | 文件读写错误 |
| 900007 | 系统维护中 | 系统正在维护 |

## 错误响应格式

```json
{
  "code": 200003,
  "msg": "Token has expired",
  "data": null,
  "timestamp": "2025-01-15T10:30:00Z",
  "request_id": "req_abc123def456"
}
```

## 常见错误处理示例

### Token 过期处理

```python
import requests
from datetime import datetime

class DNSMgrClient:
    def __init__(self, base_url, token):
        self.base_url = base_url
        self.token = token
    
    def request(self, method, path, **kwargs):
        headers = kwargs.pop('headers', {})
        headers['Authorization'] = f'Bearer {self.token}'
        
        response = requests.request(
            method, 
            f'{self.base_url}{path}',
            headers=headers,
            **kwargs
        )
        
        data = response.json()
        
        # 处理 Token 过期
        if data.get('code') == 200003:
            raise TokenExpiredError("Token expired, please refresh")
        
        # 处理权限不足
        if data.get('code') == 300001:
            raise PermissionError(f"Permission denied: {data.get('msg')}")
        
        # 处理资源不存在
        if data.get('code') == 400001:
            raise ResourceNotFoundError(f"Resource not found: {data.get('msg')}")
        
        if data.get('code') != 0:
            raise APIError(f"API error {data.get('code')}: {data.get('msg')}")
        
        return data
```

### 重试机制

```python
import time
from functools import wraps

def retry_on_error(max_retries=3, delay=1.0, backoff=2.0):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            current_delay = delay
            
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except (requests.exceptions.RequestException, APIError) as e:
                    if attempt == max_retries - 1:
                        raise
                    
                    # 5xx 错误才重试
                    if isinstance(e, APIError) and not str(e).startswith('9'):
                        raise
                    
                    time.sleep(current_delay)
                    current_delay *= backoff
            
            return func(*args, **kwargs)
        return wrapper
    return decorator

@retry_on_error(max_retries=3)
def create_record(client, domain_id, record):
    return client.request('POST', f'/api/domains/{domain_id}/records', json=record)
```
