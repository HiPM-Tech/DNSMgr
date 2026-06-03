/**
 * MCP Tools 注册和实现
 * 
 * 定义所有可用的 MCP 工具及其处理逻辑
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { validateToolPermission, logMcpAction } from '../service/mcp-permission';
import { McpOperations, DomainOperations, RenewableDomainOperations, FailoverOperations, NSMonitorOperations, RecordOperations, UserPreferencesOperations, AuditExportOperations } from '../db/bal/business-adapter';
import { DnsProviderService } from '../service/dns-provider-service';
import { checkWhoisForDomain } from '../service/whois/checker';
import { resolveNsRecords, validateNsRecords } from '../lib/dns/ns-lookup';
import { getFailoverConfig, getFailoverStatus, saveFailoverConfig, deleteFailoverConfig, performHealthCheck } from '../service/failover';
import { log } from '../lib/logger';

/**
 * 认证请求 - 验证 API Key 或 OAuth2 Token
 */
async function authenticateRequest(apiKey?: string): Promise<{ userId: number; authType: 'api_key' | 'oauth2'; keyId?: number } | null> {
  if (!apiKey) {
    return null;
  }
  
  try {
    // 调用 McpOperations.validateApiKey() 验证 API Key
    const keyInfo = await McpOperations.validateApiKey(apiKey);
    
    if (!keyInfo) {
      log.warn('MCP Auth', 'Invalid or expired API key');
      return null;
    }
    
    // 检查是否已撤销
    if (keyInfo.revoked_at) {
      log.warn('MCP Auth', 'API key has been revoked', { keyId: keyInfo.id });
      return null;
    }
    
    // 检查是否过期
    if (keyInfo.expires_at && new Date(keyInfo.expires_at) < new Date()) {
      log.warn('MCP Auth', 'API key has expired', { keyId: keyInfo.id, expiresAt: keyInfo.expires_at });
      return null;
    }
    
    log.info('MCP Auth', 'API key validated successfully', { 
      userId: keyInfo.user_id, 
      keyId: keyInfo.id,
      description: keyInfo.description 
    });
    
    return {
      userId: keyInfo.user_id,
      authType: 'api_key',
      keyId: keyInfo.id,
    };
  } catch (error) {
    log.error('MCP Auth', 'Failed to validate API key', { error });
    return null;
  }
}

/**
 * 注册所有 MCP 工具
 */
export function registerTools(server: McpServer): void {
  // ========================================
  // NS 监控模块工具
  // ========================================

  server.tool(
    'list_ns_records',
    'List NS records for domains',
    {
      apiKey: z.string().describe('API key for authentication'),
      keyword: z.string().optional().describe('Search keyword'),
    },
    async ({ apiKey, keyword }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'list_ns_records', 'read');

        // 获取所有启用的 NS 监控域名
        let nsDomains = await NSMonitorOperations.getAllEnabled();
        
        // 如果有关键词，进行过滤
        if (keyword) {
          nsDomains = nsDomains.filter((domain: any) => 
            domain.domain_name?.toLowerCase().includes(keyword.toLowerCase())
          );
        }

        const result = {
          ns_records: nsDomains,
          total: nsDomains.length,
        };

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'ns_monitor',
          action: 'list_ns_records',
          requestParams: { keyword },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        log.error('MCP Tool', 'list_ns_records failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // ========================================
  // 域名管理模块工具
  // ========================================

  server.tool(
    'list_domains',
    'List all domains with optional filtering',
    {
      apiKey: z.string().describe('API key for authentication'),
      keyword: z.string().optional().describe('Search keyword'),
      page: z.number().optional().describe('Page number'),
      pageSize: z.number().optional().describe('Items per page'),
    },
    async ({ apiKey, keyword, page, pageSize }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'list_domains', 'read');

        // 调用实际的域名列表 API
        const pageNum = page || 1;
        const pageSizeNum = pageSize || 50;
        
        // 使用 DomainOperations 获取域名列表
        const domains = await DomainOperations.getAllForSuperAdminWithPagination({
          keyword,
          domainStatus: 'all',
          page: pageNum,
          pageSize: pageSizeNum,
        });

        const result = {
          domains: domains.list,
          total: domains.total,
          page: pageNum,
          pageSize: pageSizeNum,
          totalPages: Math.ceil(domains.total / pageSizeNum),
        };

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'domain_management',
          action: 'list_domains',
          requestParams: { keyword, page: pageNum, pageSize: pageSizeNum },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        log.error('MCP Tool', 'list_domains failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'get_domain_info',
    'Get detailed information about a specific domain',
    {
      apiKey: z.string().describe('API key for authentication'),
      domainId: z.number().describe('Domain ID'),
    },
    async ({ apiKey, domainId }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'get_domain_info', 'read');

        // 调用实际的域名信息查询
        const domain = await DomainOperations.getById(domainId);
        
        if (!domain) {
          return {
            content: [{ type: 'text', text: `Domain with ID ${domainId} not found` }],
            isError: true,
          };
        }

        const result = {
          domain,
        };

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'domain_management',
          action: 'get_domain_info',
          requestParams: { domainId },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        log.error('MCP Tool', 'get_domain_info failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // ========================================
  // 续期管理模块工具
  // ========================================

  server.tool(
    'get_renewable_domains',
    'Get list of domains that need renewal',
    {
      apiKey: z.string().describe('API key for authentication'),
      daysBeforeExpiry: z.number().optional().describe('Days before expiry to alert (default: 30)'),
    },
    async ({ apiKey, daysBeforeExpiry }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'get_renewable_domains', 'read');

        // 获取所有启用的续期域名
        const renewableDomains = await RenewableDomainOperations.getAllEnabled();
        
        const daysThreshold = daysBeforeExpiry || 30;
        const now = new Date();
        const thresholdDate = new Date(now.getTime() + daysThreshold * 24 * 60 * 60 * 1000);
        
        // 过滤出即将到期的域名
        const expiringDomains = renewableDomains.filter((domain: any) => {
          if (domain.never_expires) {
            return false; // 永不过期的域名不显示
          }
          
          if (!domain.expires_at) {
            return false; // 没有到期日期的不显示
          }
          
          const expiryDate = new Date(domain.expires_at);
          return expiryDate <= thresholdDate && expiryDate > now;
        });

        const result = {
          renewable_domains: expiringDomains,
          total: expiringDomains.length,
          days_before_expiry: daysThreshold,
        };

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'renewal_management',
          action: 'get_renewable_domains',
          requestParams: { daysBeforeExpiry: daysThreshold },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        log.error('MCP Tool', 'get_renewable_domains failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // ========================================
  // 日志查询模块工具
  // ========================================

  server.tool(
    'query_audit_logs',
    'Query audit logs with filtering',
    {
      apiKey: z.string().describe('API key for authentication'),
      userId: z.number().optional().describe('Filter by user ID'),
      action: z.string().optional().describe('Filter by action (e.g., domain_create, record_update)'),
      startDate: z.string().optional().describe('Start date (ISO 8601 format)'),
      endDate: z.string().optional().describe('End date (ISO 8601 format)'),
      page: z.number().optional().describe('Page number (default: 1)'),
      pageSize: z.number().optional().describe('Items per page (default: 50)'),
    },
    async ({ apiKey, userId, action, startDate, endDate, page, pageSize }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'query_audit_logs', 'read');

        // 构建 WHERE 条件
        const conditions: string[] = ['1=1'];
        const params: unknown[] = [];

        if (userId) {
          conditions.push('l.user_id = ?');
          params.push(userId);
        }

        if (action) {
          conditions.push('l.action LIKE ?');
          params.push(`%${action}%`);
        }

        if (startDate) {
          conditions.push('l.created_at >= ?');
          params.push(startDate);
        }

        if (endDate) {
          conditions.push('l.created_at <= ?');
          params.push(endDate);
        }

        const whereClause = conditions.join(' AND ');
        const limit = pageSize || 50;
        const offset = ((page || 1) - 1) * limit;

        // 获取总数
        const total = await AuditExportOperations.getCount(whereClause, params);

        // 获取日志列表
        const logs = await AuditExportOperations.getLogs(whereClause, params, limit, offset);

        const result = {
          total,
          page: page || 1,
          pageSize: limit,
          totalPages: Math.ceil(total / limit),
          logs,
        };

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'log_query',
          action: 'query_audit_logs',
          requestParams: { userId, action, startDate, endDate, page, pageSize },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        log.error('MCP Tool', 'query_audit_logs failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'get_audit_stats',
    'Get audit log statistics for a user',
    {
      apiKey: z.string().describe('API key for authentication'),
      userId: z.number().describe('User ID to get statistics for'),
      days: z.number().optional().describe('Number of days to look back (default: 30)'),
    },
    async ({ apiKey, userId, days }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'get_audit_stats', 'read');

        const lookbackDays = days || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - lookbackDays);
        const startDateStr = startDate.toISOString().replace('T', ' ').substring(0, 19);

        // 获取操作统计
        const actionStats = await AuditExportOperations.getUserActionStats(userId, startDateStr);

        // 获取时间分布（根据数据库类型）
        const dbType = process.env.DB_TYPE || 'sqlite';
        let timeDistribution;
        if (dbType === 'postgresql') {
          timeDistribution = await AuditExportOperations.getTimeDistributionPostgreSQL(userId, startDateStr);
        } else {
          timeDistribution = await AuditExportOperations.getTimeDistributionSQLite(userId, startDateStr);
        }

        // 获取异常检测数据
        const deleteCount = await AuditExportOperations.getDeleteCount(userId, startDateStr);
        const createCount = await AuditExportOperations.getCreateCount(userId, startDateStr);
        const domainCount = await AuditExportOperations.getDomainCount(userId, startDateStr);

        const result = {
          user_id: userId,
          period_days: lookbackDays,
          start_date: startDateStr,
          action_statistics: actionStats,
          time_distribution: timeDistribution,
          anomaly_detection: {
            delete_operations: deleteCount,
            create_operations: createCount,
            unique_domains: domainCount,
          },
        };

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'log_query',
          action: 'get_audit_stats',
          requestParams: { userId, days },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        log.error('MCP Tool', 'get_audit_stats failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'export_audit_logs',
    'Export audit logs as CSV or JSON',
    {
      apiKey: z.string().describe('API key for authentication'),
      format: z.enum(['csv', 'json']).optional().describe('Export format (default: json)'),
      userId: z.number().optional().describe('Filter by user ID'),
      action: z.string().optional().describe('Filter by action'),
      startDate: z.string().describe('Start date (ISO 8601 format)'),
      endDate: z.string().describe('End date (ISO 8601 format)'),
    },
    async ({ apiKey, format, userId, action, startDate, endDate }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'export_audit_logs', 'read');

        // 构建 WHERE 条件
        const conditions: string[] = ['1=1'];
        const params: unknown[] = [];

        if (userId) {
          conditions.push('l.user_id = ?');
          params.push(userId);
        }

        if (action) {
          conditions.push('l.action LIKE ?');
          params.push(`%${action}%`);
        }

        if (startDate) {
          conditions.push('l.created_at >= ?');
          params.push(startDate);
        }

        if (endDate) {
          conditions.push('l.created_at <= ?');
          params.push(endDate);
        }

        const whereClause = conditions.join(' AND ');
        
        // 获取所有匹配的日志（不分页）
        const logs = await AuditExportOperations.getLogs(whereClause, params, 10000, 0);

        let exportData: string;
        let contentType: string;

        if (format === 'csv') {
          // 转换为 CSV 格式
          if (logs.length === 0) {
            exportData = 'id,user_id,username,nickname,action,domain,data,created_at\n';
          } else {
            const headers = 'id,user_id,username,nickname,action,domain,data,created_at';
            const rows = logs.map((log: any) => {
              return [
                log.id,
                log.user_id,
                log.username || '',
                log.nickname || '',
                log.action,
                log.domain || '',
                `"${(log.data || '').replace(/"/g, '""')}"`,
                log.created_at,
              ].join(',');
            });
            exportData = [headers, ...rows].join('\n');
          }
          contentType = 'text/csv';
        } else {
          // JSON 格式
          exportData = JSON.stringify(logs, null, 2);
          contentType = 'application/json';
        }

        const result = {
          format,
          content_type: contentType,
          record_count: logs.length,
          data: exportData,
        };

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'log_query',
          action: 'export_audit_logs',
          requestParams: { format, userId, action, startDate, endDate },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        log.error('MCP Tool', 'export_audit_logs failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // ========================================
  // 故障转移模块工具
  // ========================================

  server.tool(
    'list_failover_rules',
    'List DNS failover rules',
    {
      apiKey: z.string().describe('API key for authentication'),
    },
    async ({ apiKey }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'list_failover_rules', 'read');

        // 获取所有启用的故障转移规则
        const failoverRules = await FailoverOperations.getAllEnabled();

        const result = {
          failover_rules: failoverRules,
          total: failoverRules.length,
        };

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'failover_management',
          action: 'list_failover_rules',
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        log.error('MCP Tool', 'list_failover_rules failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'get_failover_config',
    'Get failover configuration for a domain',
    {
      apiKey: z.string().describe('API key for authentication'),
      domainId: z.number().describe('Domain ID'),
    },
    async ({ apiKey, domainId }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'get_failover_config', 'read');

        // 获取容灾配置
        const config = await getFailoverConfig(domainId);

        if (!config) {
          return {
            content: [{ type: 'text', text: `No failover configuration found for domain ${domainId}` }],
            isError: true,
          };
        }

        // 获取当前状态
        const status = await getFailoverStatus(config.id);

        const result = {
          config,
          status,
        };

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'failover_management',
          action: 'get_failover_config',
          requestParams: { domainId },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        log.error('MCP Tool', 'get_failover_config failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'create_failover_config',
    'Create or update failover configuration for a domain',
    {
      apiKey: z.string().describe('API key for authentication'),
      domainId: z.number().describe('Domain ID'),
      primaryIp: z.string().describe('Primary IP address'),
      backupIps: z.array(z.string()).describe('Backup IP addresses'),
      checkMethod: z.enum(['http', 'tcp', 'ping']).optional().describe('Health check method (default: http)'),
      checkInterval: z.number().optional().describe('Check interval in seconds (default: 60)'),
      checkPort: z.number().optional().describe('Check port (default: 80)'),
      checkPath: z.string().optional().describe('HTTP check path (default: /)'),
      autoSwitchBack: z.boolean().optional().describe('Auto switch back to primary (default: true)'),
      enabled: z.boolean().optional().describe('Enable failover (default: true)'),
    },
    async ({ apiKey, domainId, primaryIp, backupIps, checkMethod, checkInterval, checkPort, checkPath, autoSwitchBack, enabled }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'create_failover_config', 'write');

        // 保存容灾配置
        const configId = await saveFailoverConfig(domainId, {
          primaryIp,
          backupIps,
          checkMethod: checkMethod || 'http',
          checkInterval: checkInterval || 60,
          checkPort: checkPort || 80,
          checkPath: checkPath || '/',
          autoSwitchBack: autoSwitchBack !== undefined ? autoSwitchBack : true,
          enabled: enabled !== undefined ? enabled : true,
        });

        const result = {
          config_id: configId,
          domain_id: domainId,
          message: 'Failover configuration created/updated successfully',
        };

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'failover_management',
          action: 'create_failover_config',
          requestParams: { domainId, primaryIp, backupIps },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        log.error('MCP Tool', 'create_failover_config failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'delete_failover_config',
    'Delete failover configuration for a domain',
    {
      apiKey: z.string().describe('API key for authentication'),
      domainId: z.number().describe('Domain ID'),
    },
    async ({ apiKey, domainId }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'delete_failover_config', 'write');

        // 删除容灾配置
        await deleteFailoverConfig(domainId);

        const result = {
          domain_id: domainId,
          message: 'Failover configuration deleted successfully',
        };

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'failover_management',
          action: 'delete_failover_config',
          requestParams: { domainId },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        log.error('MCP Tool', 'delete_failover_config failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'perform_health_check',
    'Manually perform health check for a failover configuration',
    {
      apiKey: z.string().describe('API key for authentication'),
      domainId: z.number().describe('Domain ID'),
    },
    async ({ apiKey, domainId }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'perform_health_check', 'write');

        // 获取容灾配置
        const config = await getFailoverConfig(domainId);
        
        if (!config) {
          return {
            content: [{ type: 'text', text: `No failover configuration found for domain ${domainId}` }],
            isError: true,
          };
        }

        // 获取当前状态
        const status = await getFailoverStatus(config.id);
        
        if (!status) {
          return {
            content: [{ type: 'text', text: `No failover status found for config ${config.id}` }],
            isError: true,
          };
        }

        // 执行健康检查
        const checkResult = await performHealthCheck(config, status);

        const result = {
          domain_id: domainId,
          config_id: config.id,
          current_ip: status.currentIp,
          is_primary: status.isPrimary,
          health_check: {
            available: checkResult.available,
            response_time_ms: checkResult.responseTime,
            timestamp: new Date().toISOString(),
          },
        };

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'failover_management',
          action: 'perform_health_check',
          requestParams: { domainId },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        log.error('MCP Tool', 'perform_health_check failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // ========================================
  // 域名管理 - 写操作工具
  // ========================================

  server.tool(
    'update_domain_status',
    'Enable or disable a domain',
    {
      apiKey: z.string().describe('API key for authentication'),
      domainId: z.number().describe('Domain ID'),
      enabled: z.boolean().describe('Enable (true) or disable (false)'),
    },
    async ({ apiKey, domainId, enabled }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'update_domain_status', 'write');

        // 调用业务适配器更新域名状态
        await DomainOperations.setEnabled(domainId, enabled ? 1 : 0);

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'domain_management',
          action: 'update_domain_status',
          requestParams: { domainId, enabled },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: `Domain ${domainId} ${enabled ? 'enabled' : 'disabled'} successfully` }],
        };
      } catch (error) {
        log.error('MCP Tool', 'update_domain_status failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // ========================================
  // DNS 解析记录管理工具
  // ========================================

  server.tool(
    'list_domain_records',
    'List all DNS records for a domain with optional line filter',
    {
      apiKey: z.string().describe('API key for authentication'),
      domainId: z.number().describe('Domain ID'),
      line: z.string().optional().describe('Filter by DNS line (default, telecom, unicom, mobile, etc.)'),
      page: z.number().optional().describe('Page number (default: 1)'),
      pageSize: z.number().optional().describe('Items per page (default: 100)'),
    },
    async ({ apiKey, domainId, line, page, pageSize }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'list_domain_records', 'read');

        // 调用 DNS 提供商 API 获取记录（支持线路过滤）
        const result = await DnsProviderService.getRecords(domainId, {
          page: page || 1,
          pageSize: pageSize || 100,
          line,
        });

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'domain_management',
          action: 'list_domain_records',
          requestParams: { domainId, line, page, pageSize },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: JSON.stringify({ total: result.total, records: result.list }, null, 2) }],
        };
      } catch (error) {
        log.error('MCP Tool', 'list_domain_records failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'get_dns_lines',
    'Get available DNS lines/views for a domain (from DNS provider)',
    {
      apiKey: z.string().describe('API key for authentication'),
      domainId: z.number().describe('Domain ID'),
    },
    async ({ apiKey, domainId }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'get_dns_lines', 'read');

        // 调用 DNS 提供商 API 获取线路列表
        const lines = await DnsProviderService.getLines(domainId);

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'domain_management',
          action: 'get_dns_lines',
          requestParams: { domainId },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: JSON.stringify({ lines }, null, 2) }],
        };
      } catch (error) {
        log.error('MCP Tool', 'get_dns_lines failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'create_dns_record',
    'Create a new DNS record with optional line/view',
    {
      apiKey: z.string().describe('API key for authentication'),
      domainId: z.number().describe('Domain ID'),
      name: z.string().describe('Record name (e.g., @, www, mail)'),
      type: z.string().describe('Record type (A, AAAA, CNAME, MX, TXT, etc.)'),
      content: z.string().describe('Record content/value'),
      ttl: z.number().optional().describe('TTL in seconds (default: 600)'),
      priority: z.number().optional().describe('Priority for MX records (default: 0)'),
      line: z.string().optional().describe('DNS line/view (default=0, telecom, unicom, mobile, overseas, etc.)'),
      remark: z.string().optional().describe('Record remark/note'),
    },
    async ({ apiKey, domainId, name, type, content, ttl, priority, line, remark }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'create_dns_record', 'write');

        // 调用 DNS 提供商 API 创建记录（支持线路）
        const recordId = await DnsProviderService.createRecord(domainId, name, type, content, {
          line,
          ttl: ttl || 600,
          mx: priority || 0,
          remark,
        });

        if (!recordId) {
          throw new Error('Failed to create DNS record');
        }

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'domain_management',
          action: 'create_dns_record',
          requestParams: { domainId, name, type, content, line, ttl, priority, remark },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: `DNS record created successfully with ID: ${recordId}${line ? ` (Line: ${line})` : ''}` }],
        };
      } catch (error) {
        log.error('MCP Tool', 'create_dns_record failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'update_dns_record',
    'Update an existing DNS record (including line/view)',
    {
      apiKey: z.string().describe('API key for authentication'),
      domainId: z.number().describe('Domain ID'),
      recordId: z.string().describe('Record ID (from DNS provider)'),
      name: z.string().optional().describe('New record name'),
      type: z.string().optional().describe('New record type'),
      content: z.string().optional().describe('New record content'),
      ttl: z.number().optional().describe('New TTL'),
      priority: z.number().optional().describe('New priority'),
      line: z.string().optional().describe('New DNS line/view'),
      remark: z.string().optional().describe('New remark'),
    },
    async ({ apiKey, domainId, recordId, name, type, content, ttl, priority, line, remark }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'update_dns_record', 'write');

        // 先获取当前记录信息
        const currentRecord = await DnsProviderService.getRecordInfo(recordId, domainId);
        if (!currentRecord) {
          return {
            content: [{ type: 'text', text: `Record ${recordId} not found` }],
            isError: true,
          };
        }

        // 调用 DNS 提供商 API 更新记录（支持线路）
        const success = await DnsProviderService.updateRecord(
          recordId,
          domainId,
          name || currentRecord.Name,
          type || currentRecord.Type,
          content || currentRecord.Value,
          {
            line: line || currentRecord.Line,
            ttl: ttl || currentRecord.TTL,
            mx: priority !== undefined ? priority : currentRecord.MX,
            remark: remark !== undefined ? remark : currentRecord.Remark,
          }
        );

        if (!success) {
          throw new Error('Failed to update DNS record');
        }

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'domain_management',
          action: 'update_dns_record',
          requestParams: { domainId, recordId, name, type, content, line, ttl, priority, remark },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: `DNS record ${recordId} updated successfully${line ? ` (Line: ${line})` : ''}` }],
        };
      } catch (error) {
        log.error('MCP Tool', 'update_dns_record failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'delete_dns_record',
    'Delete a DNS record',
    {
      apiKey: z.string().describe('API key for authentication'),
      domainId: z.number().describe('Domain ID'),
      recordId: z.string().describe('Record ID (from DNS provider) to delete'),
    },
    async ({ apiKey, domainId, recordId }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'delete_dns_record', 'write');

        // 调用 DNS 提供商 API 删除记录
        const success = await DnsProviderService.deleteRecord(recordId, domainId);

        if (!success) {
          throw new Error('Failed to delete DNS record');
        }

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'domain_management',
          action: 'delete_dns_record',
          requestParams: { domainId, recordId },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: `DNS record ${recordId} deleted successfully` }],
        };
      } catch (error) {
        log.error('MCP Tool', 'delete_dns_record failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // ========================================
  // 域名信息查询工具
  // ========================================

  server.tool(
    'get_domain_remark',
    'Get domain remark and hidden status',
    {
      apiKey: z.string().describe('API key for authentication'),
      domainId: z.number().describe('Domain ID'),
    },
    async ({ apiKey, domainId }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'get_domain_remark', 'read');

        // 获取域名信息
        const domain = await DomainOperations.getById(domainId);
        
        if (!domain) {
          return {
            content: [{ type: 'text', text: `Domain with ID ${domainId} not found` }],
            isError: true,
          };
        }

        const result = {
          domain_id: domainId,
          remark: domain.remark || '',
          is_hidden: domain.is_hidden || 0,
        };

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'domain_management',
          action: 'get_domain_remark',
          requestParams: { domainId },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        log.error('MCP Tool', 'get_domain_remark failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'get_domain_pinned_status',
    'Check if a domain is pinned by the current user',
    {
      apiKey: z.string().describe('API key for authentication'),
      domainId: z.number().describe('Domain ID'),
    },
    async ({ apiKey, domainId }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'get_domain_pinned_status', 'read');

        // 获取用户的置顶域名列表
        const pinnedDomains = await UserPreferencesOperations.getPinnedDomains(auth.userId);
        
        const isPinned = pinnedDomains.includes(domainId);

        const result = {
          domain_id: domainId,
          is_pinned: isPinned,
          user_id: auth.userId,
        };

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'domain_management',
          action: 'get_domain_pinned_status',
          requestParams: { domainId },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        log.error('MCP Tool', 'get_domain_pinned_status failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'list_domains_filtered',
    'List domains filtered by account enabled status',
    {
      apiKey: z.string().describe('API key for authentication'),
      keyword: z.string().optional().describe('Search keyword'),
      page: z.number().optional().describe('Page number'),
      pageSize: z.number().optional().describe('Items per page'),
      accountEnabled: z.boolean().optional().describe('Filter by account enabled status (default: true)'),
    },
    async ({ apiKey, keyword, page, pageSize, accountEnabled }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'list_domains_filtered', 'read');

        const pageNum = page || 1;
        const pageSizeNum = pageSize || 50;
        
        // 使用 DomainOperations 获取域名列表（自动过滤禁用的账号）
        const domains = await DomainOperations.getAllForSuperAdminWithPagination({
          keyword,
          domainStatus: 'all',
          page: pageNum,
          pageSize: pageSizeNum,
        });

        // 如果需要，可以进一步过滤禁用的域名
        let filteredList = domains.list;
        if (accountEnabled === false) {
          // 显示所有域名（包括禁用账号的）
          // 注意：getAllForSuperAdminWithPagination 已经过滤了禁用账号
          // 如需包含禁用账号，需要调用其他方法
        }

        const result = {
          domains: filteredList,
          total: domains.total,
          page: pageNum,
          pageSize: pageSizeNum,
          totalPages: Math.ceil(domains.total / pageSizeNum),
          note: 'Results are automatically filtered to show only domains from enabled accounts',
        };

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'domain_management',
          action: 'list_domains_filtered',
          requestParams: { keyword, page: pageNum, pageSize: pageSizeNum, accountEnabled },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        log.error('MCP Tool', 'list_domains_filtered failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // ========================================
  // 续期管理增强工具
  // ========================================

  server.tool(
    'manual_renew_domain',
    'Manually renew a domain (update expiry date)',
    {
      apiKey: z.string().describe('API key for authentication'),
      renewableDomainId: z.number().describe('Renewable domain ID'),
      newExpiresAt: z.string().describe('New expiration date (ISO 8601 format, e.g., 2027-06-03T00:00:00Z)'),
    },
    async ({ apiKey, renewableDomainId, newExpiresAt }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'manual_renew_domain', 'write');

        // 标记为已续期
        await RenewableDomainOperations.markAsRenewed(renewableDomainId, newExpiresAt);

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'renewal_management',
          action: 'manual_renew_domain',
          requestParams: { renewableDomainId, newExpiresAt },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: `Domain ${renewableDomainId} renewed successfully. New expiry: ${newExpiresAt}` }],
        };
      } catch (error) {
        log.error('MCP Tool', 'manual_renew_domain failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'disable_domain_renewal',
    'Disable automatic renewal for a specific domain',
    {
      apiKey: z.string().describe('API key for authentication'),
      renewableDomainId: z.number().describe('Renewable domain ID to disable'),
    },
    async ({ apiKey, renewableDomainId }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'disable_domain_renewal', 'write');

        // 禁用续期
        await RenewableDomainOperations.toggleEnabled(renewableDomainId, false);

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'renewal_management',
          action: 'disable_domain_renewal',
          requestParams: { renewableDomainId },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: `Renewal disabled for domain ${renewableDomainId}` }],
        };
      } catch (error) {
        log.error('MCP Tool', 'disable_domain_renewal failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'get_domain_whois',
    'Get WHOIS information for a domain',
    {
      apiKey: z.string().describe('API key for authentication'),
      domainName: z.string().describe('Domain name to query (e.g., example.com)'),
      forceRefresh: z.boolean().optional().describe('Force refresh WHOIS data (default: false)'),
    },
    async ({ apiKey, domainName, forceRefresh }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'get_domain_whois', 'read');

        // 查询 WHOIS 信息
        const whoisResult = await checkWhoisForDomain(domainName, forceRefresh || false);

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'domain_management',
          action: 'get_domain_whois',
          requestParams: { domainName, forceRefresh },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(whoisResult, null, 2) }],
        };
      } catch (error) {
        log.error('MCP Tool', 'get_domain_whois failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  // ========================================
  // NS 监控增强工具
  // ========================================

  server.tool(
    'refresh_ns_monitor',
    'Manually refresh NS monitoring for a domain',
    {
      apiKey: z.string().describe('API key for authentication'),
      nsMonitorId: z.number().describe('NS monitor domain ID'),
    },
    async ({ apiKey, nsMonitorId }) => {
      try {
        const auth = await authenticateRequest(apiKey);
        if (!auth) {
          return {
            content: [{ type: 'text', text: 'Authentication failed' }],
            isError: true,
          };
        }

        await validateToolPermission(auth.userId, 'refresh_ns_monitor', 'write');

        // 获取 NS 监控配置
        const monitorConfig = await NSMonitorOperations.getById(nsMonitorId) as any;
        
        if (!monitorConfig) {
          return {
            content: [{ type: 'text', text: `NS monitor ${nsMonitorId} not found` }],
            isError: true,
          };
        }

        log.info('MCP Tool', 'Starting manual NS check', { 
          domain: monitorConfig.domain_name, 
          monitorId: nsMonitorId 
        });

        // 查询当前 NS 记录（带DNS污染检测）
        const nsResult = await resolveNsRecords(monitorConfig.domain_name);
        const currentNs = nsResult.nsRecords;
        const currentNsStr = currentNs.join(', ');

        // 获取加密和明文查询结果
        const encryptedNs = nsResult.encryptedResult?.records?.map((r: any) => r.data) || [];
        const plainNs = nsResult.plainResult?.records?.map((r: any) => r.data) || [];

        // 解析预期的 NS 记录
        const expectedNs = (monitorConfig.expected_ns as string) || '';
        const expectedList = expectedNs.split(',').map((s: string) => s.trim()).filter(Boolean);

        // 确定状态
        let status: 'ok' | 'mismatch' | 'missing' | 'poisoned' = 'ok';
        if (currentNs.length === 0) {
          status = 'missing';
        } else if (nsResult.isPoisoned) {
          status = 'poisoned';
        } else if (expectedList.length > 0 && !validateNsRecords(currentNs, expectedList)) {
          status = 'mismatch';
        }

        // 获取当前时间
        const now = new Date();
        const nowStr = now.toISOString().replace('T', ' ').substring(0, 19);

        // 更新状态（包含加密和明文NS记录）
        await NSMonitorOperations.updateStatus(nsMonitorId, {
          current_ns: currentNsStr,
          encrypted_ns: encryptedNs.join(', '),
          plain_ns: plainNs.join(', '),
          is_poisoned: nsResult.isPoisoned ? 1 : 0,
          status,
          last_check_at: nowStr,
        });

        // 构建返回结果
        const result = {
          monitor_id: nsMonitorId,
          domain_name: monitorConfig.domain_name,
          status,
          is_poisoned: nsResult.isPoisoned,
          current_ns: currentNs,
          encrypted_ns: encryptedNs,
          plain_ns: plainNs,
          expected_ns: expectedList,
          last_check_at: nowStr,
          message: status === 'ok' 
            ? 'NS records are normal' 
            : `NS anomaly detected: ${status}`,
        };

        // 如果状态异常，记录到审计日志
        if (status !== 'ok') {
          log.warn('MCP Tool', 'NS record anomaly detected during manual refresh', {
            domain: monitorConfig.domain_name,
            status,
            isPoisoned: nsResult.isPoisoned,
          });

          // TODO: 可以调用 sendNsAlert 发送通知，但需要导入 notification 服务
          // 目前只记录日志，不发送通知（避免手动刷新时频繁告警）
        }

        // 追踪 API Key 使用
        if (auth.keyId) {
          await McpOperations.updateApiKeyLastUsed(auth.keyId);
        }

        await logMcpAction({
          userId: auth.userId,
          authType: auth.authType,
          module: 'ns_monitor',
          action: 'refresh_ns_monitor',
          requestParams: { nsMonitorId },
          responseStatus: 'success',
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        log.error('MCP Tool', 'refresh_ns_monitor failed', { error });
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
          isError: true,
        };
      }
    }
  );

  log.info('MCP Tools', `Registered ${Object.keys(server['_registeredTools'] || {}).length} tools`);
}
