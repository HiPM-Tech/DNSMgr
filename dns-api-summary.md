# DNS API 实现分析与调用总结

本文基于 `RAW` 目录当前实现整理，重点不是官方 API 文档复述，而是说明这个项目是如何封装并调用各家 DNS API 的。

## 1. 总体架构

### 1.1 统一抽象层

- 统一接口定义在 `app/lib/DnsInterface.php`
- 各平台适配器位于 `app/lib/dns/*.php`
- 公共签名客户端位于 `app/lib/client/*.php`
- 动态实例化入口在 `app/lib/DnsHelper.php`
- 控制器调用入口主要在 `app/controller/Domain.php`
- 公共 HTTP/代理工具在 `app/common.php`

`DnsInterface` 规定了统一方法：

- `check()`
- `getDomainList()`
- `getDomainRecords()`
- `getSubDomainRecords()`
- `getDomainRecordInfo()`
- `addDomainRecord()`
- `updateDomainRecord()`
- `updateDomainRecordRemark()`
- `deleteDomainRecord()`
- `setDomainRecordStatus()`
- `getDomainRecordLog()`
- `getRecordLine()`
- `getMinTTL()`
- `addDomain()`

这意味着控制器不关心具体厂商，只调用统一方法。

### 1.2 实际调用链

典型调用链如下：

1. 后台保存 DNS 账户配置到 `account.config`，格式是 JSON。
2. `DnsHelper::getModel($aid, $domain, $domainid)` 读取账号配置，按 `type` 动态实例化 `app\lib\dns\<type>`。
3. 适配器构造函数读取密钥、域名、第三方域名 ID，以及是否走平台代理。
4. 控制器通过统一接口进行列表、增删改查、启停、获取线路、获取最小 TTL。
5. 适配器把统一字段转换成厂商 API 所需的 action/path/header/body，再把返回值映射回通用结构。

### 1.3 统一字段约定

项目在各厂商间尽量把记录映射成统一结构：

- `RecordId`: 厂商侧记录 ID，部分平台会自行拼装
- `Domain`: 主域名
- `Name`: 主机记录，根域名通常用 `@`
- `Type`: A/AAAA/CNAME/TXT/MX/SRV/CAA 等
- `Value`: 记录值
- `Line`: 线路 ID 或伪线路值
- `TTL`: TTL
- `MX`: MX 优先级
- `Status`: `1` 启用，`0` 停用
- `Weight`: 权重
- `Remark`: 备注
- `UpdateTime`: 更新时间

### 1.4 代理与 HTTP 请求

项目的平台代理开关来自账号配置中的 `proxy` 字段。底层有两种实现：

- 直接 cURL 的客户端使用 `curl_set_proxy()`
- 基于 Guzzle 的通用请求使用 `http_request()`

两者都会读取系统代理配置：

- `proxy_server`
- `proxy_port`
- `proxy_user`
- `proxy_pwd`
- `proxy_type`

## 2. 控制器如何驱动 DNS API

`app/controller/Domain.php` 是最核心的业务入口，主要做几件事：

- `account_op()` 在添加/修改 DNS 账号后调用 `$dns->check()` 验证密钥是否可用
- `domain_list()` 调用 `$dns->getDomainList()` 从厂商拉取域名列表
- `domain_op('add')` 可选调用 `$dns->addDomain()` 在厂商侧直接新增域名
- `domain_info()` 调用 `$dns->getRecordLine()` 和 `$dns->getMinTTL()`
- 记录页调用：
  - `$dns->getDomainRecords()`
  - `$dns->getDomainRecordInfo()`
  - `$dns->addDomainRecord()`
  - `$dns->updateDomainRecord()`
  - `$dns->deleteDomainRecord()`
  - `$dns->setDomainRecordStatus()`

统一入口的好处是 UI 和业务流程不需要区分厂商，差异都被收敛在 `app/lib/dns/*.php` 里。

## 3. 关键公共辅助

### 3.1 `DnsHelper`

`app/lib/DnsHelper.php` 做了三件事：

- 定义平台清单、图标、配置项、功能能力
- 提供线路默认值映射 `line_name`
- 动态构造适配器实例

例如：

- `getModel($aid, $domain, $domainid)` 会把 `domain` 和 `domainid` 注入适配器
- `getModel2($account)` 则用于直接根据域名账号对象构造

### 3.2 `http_request()`

`app/common.php` 中的 `http_request()` 是一个通用 HTTP 封装：

- 支持 GET/POST/PUT/PATCH/DELETE
- 支持表单、JSON、multipart
- 支持自定义 header
- 支持平台代理
- 返回统一数组：`code`、`redirect_url`、`headers`、`body`

很多非云厂商适配器都直接基于它实现。

## 4. 重点厂商 DNS API 调用方式

这一节只看“项目里怎么调”，不展开官方文档之外的能力。

### 4.1 阿里云 DNS

- 适配器：`app/lib/dns/aliyun.php`
- 公共客户端：`app/lib/client/Aliyun.php`
- API 入口：`https://alidns.aliyuncs.com/`
- 版本：`2015-01-09`
- 鉴权方式：阿里云 RPC 签名

#### 调用方式

客户端会自动补全以下公共参数：

- `Format=JSON`
- `Version`
- `AccessKeyId`
- `SignatureMethod=HMAC-SHA1`
- `Timestamp`
- `SignatureVersion=1.0`
- `SignatureNonce`

然后对所有参数排序，拼出 canonical query string，再按阿里云 RPC 规则计算 `Signature`。

#### 主要 Action

- `DescribeDomains`
- `DescribeDomainRecords`
- `DescribeSubDomainRecords`
- `DescribeDomainRecordInfo`
- `AddDomainRecord`
- `UpdateDomainRecord`
- `UpdateDomainRecordRemark`
- `DeleteDomainRecord`
- `DeleteSubDomainRecords`
- `SetDomainRecordStatus`
- `DescribeRecordLogs`
- `DescribeDomainInfo`
- `AddDomain`

#### 实现特点

- 线路会经过 `convertLineCode()` 转换
- `MX` 被映射为 `Priority`
- 权重能力通过扩展方法实现：
  - `DescribeDNSSLBSubDomains`
  - `SetDNSSLBStatus`
  - `UpdateDNSSLBWeight`
- 请求失败时会自动重试一次

### 4.2 DNSPod / 腾讯云 DNS

- 适配器：`app/lib/dns/dnspod.php`
- 公共客户端：`app/lib/client/TencentCloud.php`
- API 入口：`https://dnspod.tencentcloudapi.com/`
- 服务名：`dnspod`
- 版本：`2021-03-23`
- 鉴权方式：TC3-HMAC-SHA256

#### 调用方式

底层统一走 JSON POST，请求头包含：

- `Authorization`
- `Content-Type: application/json; charset=utf-8`
- `X-TC-Action`
- `X-TC-Timestamp`
- `X-TC-Version`

签名逻辑由 `TencentCloud` 客户端统一生成。

#### 主要 Action

- `DescribeDomainList`
- `DescribeRecordList`
- `DescribeRecordFilterList`
- `DescribeRecord`
- `CreateRecord`
- `ModifyRecord`
- `ModifyRecordRemark`
- `DeleteRecord`
- `ModifyRecordStatus`
- `DescribeDomainLogList`
- `DescribeRecordLineCategoryList`
- `DescribeRecordLineList`
- `DescribeDomain`
- `DescribeDomainPurview`
- `DescribeUserDetail`
- `CreateDomain`

#### 扩展能力

DNSPod 还额外实现了域名别名：

- `DescribeDomainAliasList`
- `CreateDomainAlias`
- `DeleteDomainAlias`

#### 实现特点

- URL 转发类型在项目里被映射成：
  - `REDIRECT_URL` <-> `显性URL`
  - `FORWARD_URL` <-> `隐性URL`
- 查询列表时，状态和值过滤会走 `DescribeRecordFilterList`
- 获取最小 TTL 不是直接查域名信息，而是从 `DescribeDomainPurview` 里取 `Min TTL value`

### 4.3 华为云 DNS

- 适配器：`app/lib/dns/huawei.php`
- 公共客户端：`app/lib/client/HuaweiCloud.php`
- API 入口：`https://dns.myhuaweicloud.com`
- 鉴权方式：`SDK-HMAC-SHA256`

#### 调用方式

这是标准 REST 风格：

- `Host`
- `X-Sdk-Date`
- `Authorization`

签名按 method/path/query/headers/body 生成 canonical request。

#### 主要路径

- `GET /v2/zones`
- `GET /v2.1/zones/{zoneId}/recordsets`
- `GET /v2.1/zones/{zoneId}/recordsets/{recordId}`
- `POST /v2.1/zones/{zoneId}/recordsets`
- `PUT /v2.1/zones/{zoneId}/recordsets/{recordId}`
- `DELETE /v2.1/zones/{zoneId}/recordsets/{recordId}`
- `PUT /v2.1/recordsets/{recordId}/statuses/set`
- `GET /v2/zones/{zoneId}`
- `POST /v2/zones`

#### 实现特点

- 华为云记录值使用 `records` 数组，项目里会把逗号分隔的多个值拆成数组
- `TXT` 类型会自动补双引号
- 主机名会被拼成全量 FQDN，例如 `www.example.com.`
- 线路列表不是实时接口拉取，而是读取本地静态文件 `app/data/huawei_line.json`
- `updateDomainRecordRemark()` 和日志查询未实现

### 4.4 百度云 DNS

- 适配器：`app/lib/dns/baidu.php`
- 公共客户端：`app/lib/client/BaiduCloud.php`
- API 入口：`https://dns.baidubce.com`
- 鉴权方式：`bce-auth-v1`

#### 调用方式

请求头包含：

- `Host`
- `x-bce-date`
- `Authorization`

签名遵循百度 BCE canonical request 规则。

#### 主要路径

- `GET /v1/dns/zone`
- `GET /v1/dns/zone/{domain}/record`
- `POST /v1/dns/zone/{domain}/record`
- `PUT /v1/dns/zone/{domain}/record/{recordId}`
- `DELETE /v1/dns/zone/{domain}/record/{recordId}`
- `POST /v1/dns/zone`

#### 实现特点

- 写操作会附带 `clientToken=getSid()`，相当于幂等 token
- 取记录列表后，很多筛选是在本地数组里再过滤，不完全依赖服务端
- 启停通过 `PUT /record/{id}` + query 参数 `enable` 或 `disable`
- 获取线路不是远程查询，而是本地硬编码

### 4.5 火山引擎 DNS

- 适配器：`app/lib/dns/huoshan.php`
- 公共客户端：`app/lib/client/Volcengine.php`
- API 入口：`https://open.volcengineapi.com/`
- 服务名：`DNS`
- 版本：`2018-08-01`
- 区域：`cn-north-1`
- 鉴权方式：火山引擎 HMAC-SHA256

#### 调用方式

项目统一把请求打到 `/`，通过 query 指定：

- `Action`
- `Version`

请求头至少包含：

- `Host`
- `X-Date`
- `Authorization`

GET 场景把业务参数放进 query，POST 场景把业务参数放 JSON body。

#### 主要 Action

- `ListZones`
- `ListRecords`
- `QueryRecord`
- `CreateRecord`
- `UpdateRecord`
- `DeleteRecord`
- `UpdateRecordStatus`
- `ListLines`
- `ListCustomLines`
- `QueryZone`
- `CreateZone`

#### 实现特点

- `MX` 的值会在项目里组装成 `"priority value"`
- 最小 TTL 不是单独接口返回，而是根据 `TradeCode` 查本地套餐映射
- 线路列表也会按套餐等级过滤
- 支持自定义线路

### 4.6 京东云 DNS

- 适配器：`app/lib/dns/jdcloud.php`
- 公共客户端：`app/lib/client/Jdcloud.php`
- API 入口：`https://domainservice.jdcloud-api.com`
- 服务名：`domainservice`
- 版本前缀：`/v2`
- 区域：`cn-north-1`
- 鉴权方式：`JDCLOUD2-HMAC-SHA256`

#### 调用方式

最终路径会拼成：

- `/v2/regions/cn-north-1/...`

请求头包含：

- `Host`
- `x-jdcloud-algorithm`
- `x-jdcloud-date`
- `x-jdcloud-nonce`
- `authorization`

#### 主要路径

- `GET /domain`
- `GET /domain/{domainId}/ResourceRecord`
- `POST /domain/{domainId}/ResourceRecord`
- `PUT /domain/{domainId}/ResourceRecord/{recordId}`
- `DELETE /domain/{domainId}/ResourceRecord/{recordId}`
- `PUT /domain/{domainId}/ResourceRecord/{recordId}/status`
- `GET /domain/{domainId}/viewTree`
- `POST /domain`

#### 实现特点

- `viewValue` 表示线路
- `Status` 通过 `/status` 子路径控制，参数是 `action=enable|disable`
- `SRV` 记录会被拆解成：
  - `mxPriority`
  - `weight`
  - `port`
  - `hostValue`
- URL 转发类型被映射为：
  - `REDIRECT_URL` -> `EXPLICIT_URL`
  - `FORWARD_URL` -> `IMPLICIT_URL`

### 4.7 Cloudflare

- 适配器：`app/lib/dns/cloudflare.php`
- API 入口：`https://api.cloudflare.com/client/v4`
- 鉴权方式支持两种：
  - `X-Auth-Email` + `X-Auth-Key`
  - `Authorization: Bearer <token>`

#### 主要路径

- `GET /zones`
- `GET /zones/{zoneId}/dns_records`
- `GET /zones/{zoneId}/dns_records/{recordId}`
- `POST /zones/{zoneId}/dns_records`
- `PATCH /zones/{zoneId}/dns_records/{recordId}`
- `DELETE /zones/{zoneId}/dns_records/{recordId}`
- `GET /zones/{zoneId}`
- `POST /zones`

#### 实现特点

- 项目把 Cloudflare 的 `proxied` 当成“线路”
  - `0` = 仅 DNS
  - `1` = 已代理
- 为兼容暂停解析，项目不是直接调用状态接口，而是通过改名实现：
  - 开启状态：正常主机名
  - 暂停状态：主机名后缀 `_pause`
  - 根域名暂停时特殊处理为 `__root___pause`
- `CAA` 和 `SRV` 不能直接传 `content`，而要传 `data` 对象
- 做了 IDN/Punycode 兼容，`extractName()` 会把 Cloudflare 返回的 punycode 名称还原成项目使用的主机记录名

### 4.8 阿里云 ESA

- 适配器：`app/lib/dns/aliyunesa.php`
- 公共客户端：`app/lib/client/Aliyun.php`
- API 入口：默认 `https://esa.cn-hangzhou.aliyuncs.com/`
- 版本：`2024-09-10`
- 鉴权方式：与阿里云 DNS 相同的 RPC 签名

#### 主要 Action

- `ListSites`
- `ListRecords`
- `GetRecord`
- `CreateRecord`
- `UpdateRecord`
- `DeleteRecord`
- `GetSite`

#### 实现特点

- 只处理 NS 接入站点，`ListSites` 会带 `AccessType=NS`
- `A` 和 `AAAA` 在 ESA 里统一为 `A/AAAA`
- `Proxied` 相当于 Cloudflare 的代理开关
- 代理记录会额外带 `BizName=web`
- `CAA`、`SRV`、`MX` 都要把 `Data` 组装成 JSON
- 最小 TTL 直接固定为 `1`

### 4.9 腾讯云 EdgeOne / TEO DNS

- 适配器：`app/lib/dns/tencenteo.php`
- 公共客户端：`app/lib/client/TencentCloud.php`
- API 入口：
  - 中国站：`https://teo.tencentcloudapi.com/`
  - 国际站：`https://teo.intl.tencentcloudapi.com/`
- 服务名：`teo`
- 版本：`2022-09-01`
- 鉴权方式：TC3-HMAC-SHA256

#### 主要 Action

- `DescribeZones`
- `DescribeDnsRecords`
- `CreateDnsRecord`
- `ModifyDnsRecord`
- `DeleteDnsRecords`
- `ModifyDnsRecordsStatus`

#### 实现特点

- 列表默认只看 `zone-type=full`
- 线路字段用 `Location`
- 权重为空时传 `-1`
- 状态接口是批量风格：
  - `RecordsToEnable`
  - `RecordsToDisable`
- 最小 TTL 固定为 `60`

## 5. 其他平台的调用方式

### 5.1 青云 Routewize

- 适配器：`app/lib/dns/qingcloud.php`
- API 入口：`http://api.routewize.com`
- 鉴权方式：`QC-HMAC-SHA256 access_key_id:signature`

#### 签名方式

签名串格式：

`METHOD + "\n" + Date + "\n" + path[?sorted_query]`

请求头包括：

- `Authorization`
- `Date`

#### 主要路径

- `GET /v1/user/zones`
- `GET /v1/dns/host/`
- `GET /v1/dns/host_info/`
- `POST /v1/record/`
- `GET /v1/dr_id/{id}`
- `POST /v1/dr_id/{id}`
- `POST /v1/change_record_status/`
- `GET /v1/zone/view/`
- `POST /v1/zone/`

#### 实现特点

- 记录模型不是一条一条平铺，而是 host -> record group -> values 的多层结构
- `RecordId` 由 `domain_record_id_record_value_id` 拼出来
- 删除和修改往往要先查整组记录，再重建整组 payload
- `mode` 直接读取当前请求的 `post.mode`

### 5.2 宝塔 DNS

- 适配器：`app/lib/dns/bt.php`
- API 入口：`https://dmp.bt.cn`
- 鉴权方式：自定义 HMAC-SHA256

#### 请求头

- `X-Account-ID`
- `X-Access-Key`
- `X-Timestamp`
- `X-Signature`

签名内容是：

- `accountId`
- `timestamp`
- `method`
- `path`
- `body`

#### 主要路径

- `/api/v1/dns/manage/list_domains`
- `/api/v1/dns/record/list`
- `/api/v1/dns/record/create`
- `/api/v1/dns/record/update`
- `/api/v1/dns/record/delete`
- `/api/v1/dns/record/pause`
- `/api/v1/dns/record/start`
- `/api/v1/dns/record/get_views`
- `/api/v1/dns/manage/add_external_domain`

#### 实现特点

- `domainid` 存的是 `local_id|domain_type`
- 非 MX 记录时，项目把权重也塞在 `mx` 字段里
- 最小 TTL 固定为 `300`

### 5.3 DNS.LA

- 适配器：`app/lib/dns/dnsla.php`
- API 入口：`https://api.dns.la`
- 鉴权方式：HTTP Basic Auth

#### 请求头

- `Authorization: Basic base64(apiid:apisecret)`
- `Content-Type: application/json; charset=utf-8`

#### 主要路径

- `/api/domainList`
- `/api/recordList`
- `/api/record`
- `/api/recordDisable`
- `/api/availableLine`
- `/api/domain`
- `/api/dnsMeasures`

#### 实现特点

- 记录类型是整数 ID，需要通过 `typeList` 做双向映射
- URL 转发被映射到类型 `256`
- `dominant=true/false` 区分显性转发和隐性转发

### 5.4 西部数码

- 适配器：`app/lib/dns/west.php`
- API 入口：`https://api.west.cn/api/v2`
- 鉴权方式：时间戳 + MD5 token

#### 请求参数

每次请求都额外附带：

- `username`
- `time`
- `token = md5(username + api_password + time)`

#### 主要接口风格

全部通过 `/domain/`，再用 `act` 区分动作：

- `getdomains`
- `getdnsrecord`
- `adddnsrecord`
- `moddnsrecord`
- `deldnsrecord`
- `pause`

#### 实现特点

- 返回是 GBK，项目先转 UTF-8 再 JSON 解析
- `pause` 接口使用 `val=1/0` 控制暂停状态
- 该适配器不支持在平台侧新增域名

### 5.5 NameSilo

- 适配器：`app/lib/dns/namesilo.php`
- API 入口：`https://www.namesilo.com/api/`
- 鉴权方式：query string API key

#### 固定参数

- `version=1`
- `type=json`
- `key=<apikey>`

#### 主要 operation

- `listDomains`
- `dnsListRecords`
- `dnsAddRecord`
- `dnsUpdateRecord`
- `dnsDeleteRecord`

#### 实现特点

- 所有操作都走 GET
- 成功码判断为 `reply.code == 300`
- 不支持状态切换、备注、加域名

### 5.6 Spaceship

- 适配器：`app/lib/dns/spaceship.php`
- API 入口：`https://spaceship.dev/api/v1`
- 鉴权方式：
  - `X-API-Key`
  - `X-API-Secret`

#### 主要路径

- `GET /domains`
- `GET /dns/records/{domain}`
- `PUT /dns/records/{domain}`
- `DELETE /dns/records/{domain}`

#### 实现特点

- 新增和修改都走 `PUT /dns/records/{domain}`
- 区别在于 `force=false` 和 `force=true`
- 因为返回记录结构没有直接可复用的唯一 ID，项目把 `RecordId` 拼成：
  - `type|name|address|mx`
- 删除时需要根据这个拼装 ID 逆推出完整记录结构

### 5.7 PowerDNS

- 适配器：`app/lib/dns/powerdns.php`
- API 入口：`http://<ip>:<port>/api/v1`
- 鉴权方式：`X-API-Key`

#### 主要路径

- `GET /servers/localhost/zones`
- `GET /servers/localhost/zones/{zoneId}`
- `POST /servers/localhost/zones`
- `PATCH /servers/localhost/zones/{zoneId}`

#### 实现特点

- PowerDNS 原生是 RRSet 模型，不是单条记录模型
- 项目为兼容统一接口，会先把 RRSet 展平为多条记录
- `RecordId` 被拼成 `rrset_id_record_id`
- 修改/删除/启停本质上都是：
  1. 取到整组 rrset
  2. 改写 `records`
  3. 用 `PATCH` + `changetype=REPLACE` 回写
- 如果整组记录删空，则改成 `changetype=DELETE`
- 为了实现单记录编辑，项目会把 rrsets 缓存在 `cache('powerdns_<domainid>')`

## 6. 平台能力差异与实现坑点

### 6.1 `domainid` 的含义并不统一

- 阿里云、华为云、火山引擎、京东云、Cloudflare、腾讯 EO：通常是 zone/site ID
- 百度云、NameSilo、Spaceship：有时直接用域名字符串
- 宝塔：`local_id|domain_type`
- 青云：`zone_name`

所以所有适配器的构造函数几乎都要把 `domain` 和 `domainid` 同时存下来。

### 6.2 状态切换实现差异很大

- 阿里云、DNSPod、火山引擎、京东云、腾讯 EO：有正式的启停接口
- 华为云：`/statuses/set`
- DNS.LA：`/recordDisable`
- 宝塔：`pause/start`
- 青云：`/change_record_status/`
- PowerDNS：本地改 `disabled`
- Cloudflare：通过改名追加 `_pause`
- NameSilo、Spaceship：未实现

### 6.3 线路字段 `Line` 的意义不统一

- 传统 DNS 厂商：真线路 ID
- Cloudflare / 阿里云 ESA：其实是代理开关
- PowerDNS / NameSilo / Spaceship：固定只有 default

### 6.4 记录值格式存在厂商差异

- `MX`: 有的平台拆成 `priority + value`，有的平台直接传单独字段
- `SRV`: 多数平台需要拆成 priority/weight/port/target
- `CAA`: 通常要拆成 flag/tag/value
- `TXT`: 有的平台要求自动补双引号
- PowerDNS 的 `CNAME/MX` 末尾还要补 `.`

### 6.5 部分能力是“项目能力”，不是平台原生能力

例如：

- Cloudflare 的“暂停解析”是项目自己用 `_pause` 命名约定模拟的
- PowerDNS 的单条记录编辑，是项目在 RRSet 上再封装一层出来的

### 6.6 有些平台功能没有做

不少适配器直接 `return false` 的能力包括：

- `updateDomainRecordRemark()`
- `getDomainRecordLog()`
- `setDomainRecordStatus()`
- `addDomain()`

这些是否可用，要以 `DnsHelper::$dns_config` 的能力标记和适配器具体实现为准。

## 7. 如果你要继续扩展新厂商，建议照着这个模式做

建议最少实现下面几层：

1. 在 `DnsHelper::$dns_config` 里注册平台配置项和能力标记
2. 新建 `app/lib/dns/<vendor>.php`，实现 `DnsInterface`
3. 如有复杂签名，再新建 `app/lib/client/<Vendor>.php`
4. 在适配器里完成：
   - 构造函数读取密钥、域名、domainid、proxy
   - 列表/详情/增删改/状态/线路/最小 TTL
   - 厂商字段和统一字段之间的映射
5. 若线路编码特殊，再在适配器或 `DnsHelper::$line_name` 增加转换逻辑

## 8. 结论

这个项目的 DNS 接入设计很清晰：

- 上层以 `DnsInterface` 保持一致
- 中层由 `DnsHelper` 完成账号配置与实例化
- 底层根据厂商差异分别采用：
  - RPC 签名
  - REST + HMAC
  - Basic Auth
  - API Key Header
  - query string API key

如果只看“如何调用各大厂 DNS API”，最值得优先关注的文件是：

- `app/lib/dns/aliyun.php`
- `app/lib/dns/dnspod.php`
- `app/lib/dns/huawei.php`
- `app/lib/dns/baidu.php`
- `app/lib/dns/huoshan.php`
- `app/lib/dns/jdcloud.php`
- `app/lib/dns/cloudflare.php`
- `app/lib/dns/aliyunesa.php`
- `app/lib/dns/tencenteo.php`

如果要继续做二次开发，先看这些文件，再配合对应的 `app/lib/client/*.php` 即可快速定位签名和请求细节。
