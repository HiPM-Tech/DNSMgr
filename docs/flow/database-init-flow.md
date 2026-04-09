# 数据库初始化流程

## 完整调用链路

```mermaid
sequenceDiagram
    participant User as 用户
    participant Frontend as 前端 (Setup页面)
    participant API as API 客户端
    participant InitRouter as 初始化路由
    participant LegacyDB as database.ts (兼容层)
    participant Adapter as 业务适配器层
    participant Core as 数据库核心层
    participant Schema as Schema管理
    participant DB as 数据库

    User->>Frontend: 1. 访问 /setup
    Frontend->>API: 2. 调用 initApi.status()
    API->>InitRouter: 3. GET /api/init/status
    InitRouter->>LegacyDB: 4. isDbInitialized()
    LegacyDB->>DB: 5. 检查表是否存在
    DB-->>LegacyDB: 返回状态
    LegacyDB-->>InitRouter: 返回初始化状态
    InitRouter-->>API: 6. 返回 {initialized, dbInitialized}
    API-->>Frontend: 显示设置向导

    Note over User: 配置数据库

    User->>Frontend: 7. 选择数据库类型并填写配置
    Frontend->>API: 8. 调用 initApi.testDb()
    API->>InitRouter: 9. POST /api/init/test-db
    InitRouter->>SystemOperations: 10. testXxxConnection()
    SystemOperations->>DB: 11. 测试连接
    DB-->>SystemOperations: 返回连接结果

    alt 连接失败
        SystemOperations-->>InitRouter: 返回错误
        InitRouter-->>API: 返回：连接失败
        API-->>Frontend: 显示错误
        Frontend-->>User: 提示检查配置
    else 连接成功
        SystemOperations-->>InitRouter: 返回：连接成功
        InitRouter-->>API: 返回成功
        API-->>Frontend: 显示下一步
        Frontend-->>User: 确认初始化
    end

    User->>Frontend: 12. 点击"初始化数据库"
    Frontend->>API: 13. 调用 initApi.initDatabase()
    API->>InitRouter: 14. POST /api/init/database
    InitRouter->>LegacyDB: 15. createConnection()
    LegacyDB->>DB: 16. 创建连接
    InitRouter->>Core: 17. connect()
    Core->>Core: 18. 初始化连接管理器
    InitRouter->>Schema: 19. initSchemaAsync(conn)

    alt SQLite
        Schema->>DB: 20. 执行 SQLite Schema
    else MySQL
        Schema->>DB: 20. 执行 MySQL Schema
    else PostgreSQL
        Schema->>DB: 20. 执行 PostgreSQL Schema
    end

    DB-->>Schema: 表创建完成
    Schema-->>InitRouter: 初始化完成
    InitRouter-->>API: 返回：{success: true}
    API-->>Frontend: 显示下一步
    Frontend-->>User: 请求创建管理员

    Note over User: 创建管理员账户

    User->>Frontend: 21. 填写管理员信息
    Frontend->>API: 22. 调用 initApi.createAdmin()
    API->>InitRouter: 23. POST /api/init/admin
    InitRouter->>UserOperations: 24. getCount() 检查是否已有用户
    UserOperations->>Adapter: 25. get() 查询用户数量
    Adapter->>DB: 26. SELECT COUNT(*) FROM users
    DB-->>Adapter: 返回用户数
    Adapter-->>UserOperations: 返回用户数
    UserOperations-->>InitRouter: 返回用户数

    alt 已有用户
        InitRouter-->>API: 返回 403: 已初始化
        API-->>Frontend: 显示错误
        Frontend-->>User: 提示无需重复创建
    else 无用户
        InitRouter->>InitRouter: bcrypt.hashSync() 加密密码
        InitRouter->>UserOperations: 27. create() 插入用户记录
        UserOperations->>Adapter: 28. insert() 插入数据
        Adapter->>DB: INSERT INTO users
        DB-->>Adapter: 返回用户 ID
        Adapter-->>UserOperations: 返回用户 ID
        UserOperations-->>InitRouter: 返回用户 ID
        InitRouter->>SecretOperations: 29. setRuntimeSecret() 生成运行时密钥
        SecretOperations->>Adapter: 30. execute() 存储密钥
        Adapter->>DB: INSERT/UPDATE runtime_secrets
        DB-->>Adapter: 存储完成
        Adapter-->>SecretOperations: 存储完成
        SecretOperations-->>InitRouter: 存储完成
        InitRouter-->>API: 返回：{success: true}
        API-->>Frontend: 初始化完成
        Frontend-->>User: 跳转到登录页
    end
```

## 关键代码路径

### 检查初始化状态

**前端：**
```
Setup.tsx
  → initApi.status()
  → api.get('/init/status')
```

**后端：**
```
GET /api/init/status (routes/init.ts)
  → isDbInitialized() (db/database.ts)
    → 检查表是否存在
  → hasUsers() (db/database.ts)
    → SELECT COUNT(*) FROM users
  → 返回 {initialized, dbInitialized, hasUsers}
```

### 测试数据库连接

**后端：**
```
POST /api/init/test-db (routes/init.ts)
  → 根据 DB_TYPE 调用对应测试方法
  → SystemOperations.testSqliteConnection() / testMysqlConnection() / testPostgresqlConnection()
    → 创建测试连接
    → 检查是否有现有数据
    → 关闭测试连接
  → 返回 {success, message, hasExistingData}
```

### 初始化数据库

**后端：**
```
POST /api/init/database (routes/init.ts)
  → createConnection() (db/database.ts) - 创建传统连接
  → connect() (db/core/connection.ts) - 初始化新系统
  → initSchemaAsync() (db/schema.ts)
    → 根据 DB_TYPE 选择 Schema
    → 执行 CREATE TABLE 语句
  → 返回 {success: true}
```

### 创建管理员

**后端：**
```
POST /api/init/admin (routes/init.ts)
  → UserOperations.getCount() - 检查是否已有用户
  → bcrypt.hashSync() - 加密密码
  → UserOperations.create() - 创建用户 (通过业务适配器层)
  → SecretOperations.setRuntimeSecret() - 生成运行时密钥
  → 返回 {success: true}
```

## 数据流

```
用户访问 /setup
  ↓
前端调用 initApi.status()
  ↓
后端检查数据库和用户状态
  ↓
显示初始化向导
  ↓
用户配置数据库
  ↓
测试数据库连接
  ↓
初始化数据库表结构
  ↓
创建管理员账户
  ↓
生成运行时密钥
  ↓
初始化完成，跳转到登录页
```

## 注意事项

1. **双层初始化**: 系统同时支持传统数据库层和新的业务适配器层
2. **Schema 兼容性**: 根据数据库类型（SQLite/MySQL/PostgreSQL）执行对应的 Schema
3. **运行时密钥**: 初始化完成后自动生成，用于 JWT 签名
4. **幂等性**: 已初始化的系统拒绝重复初始化
