# 西部数码 DNS（West）接入说明

本项目的西部数码 DNS 适配器基于《业务API接口文档（v2）》中的“域名解析”相关接口实现。

## 1. 账号配置

在“添加 DNS 账号”中选择“西部数码”后，需要填写：

- `username`：西部数码账号用户名
- `api_password`：API 密码（在西部数码后台的 API 接口配置页面获取）

## 2. 认证方式

每次请求都需要带上：

- `username`
- `time`（毫秒时间戳）
- `token = md5(username + api_password + time)`

## 3. 解析记录相关接口

统一入口：

- `https://api.west.cn/api/v2/domain/`

通过 `act` 区分操作：

- `getdnsrecord`：获取解析记录列表
- `adddnsrecord`：新增解析记录
- `moddnsrecord`：修改解析记录
- `deldnsrecord`：删除解析记录
- `pause`：暂停/启用解析记录

## 4. 线路与 TTL

线路编码：

- `默认` -> `""`（空字符串）
- `电信` -> `LTEL`
- `联通` -> `LCNC`
- `移动` -> `LMOB`
- `教育网` -> `LEDU`
- `搜索引擎` -> `LSEO`

TTL 范围：`60 ~ 86400`，默认 `900`。

## 5. 备注

- 西部数码 DNS API 不支持通过接口创建域名。
- 解析记录暂停通过 `act=pause`，`val=1` 表示暂停，`val=0` 表示启用。
