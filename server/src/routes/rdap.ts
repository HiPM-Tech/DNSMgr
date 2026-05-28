/**
 * RDAP 公开查询路由
 * 
 * 提供符合 RFC 7483 标准的 RDAP 查询接口
 * - 无需鉴权，开放查询
 * - 直接使用 WHOIS/RDAP 系统，不走数据库
 * - 返回国际标准 JSON 格式
 * 
 * 端点:
 *   GET /api/rdap/domain/{domain}     - 查询域名信息
 *   GET /api/rdap/nameserver/{name}   - 查询 Nameserver（预留）
 *   GET /api/rdap/entity/{handle}     - 查询实体信息（预留）
 */

import { Router, Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { whoisService, getRootDomain } from '../service/whois';
import { log } from '../lib/logger';
import { normalizeDomain, isValidDomain, toUnicode } from '../utils/dns';

const router = Router();

/**
 * RDAP 查询函数（使用内部分层查询）
 * 
 * 查询策略（分层并行竞速）：
 * 1. 顶域RDAP 并行查询（所有匹配的RDAP提供商竞速）
 * 2. 顶域WHOIS 并行查询（所有匹配的WHOIS提供商竞速）
 * 3. 子域RDAP 并行查询（如果适用）
 * 4. 子域WHOIS 并行查询（如果适用）
 * 5. 子域RDAP 并行平级查询（试图查询其它子域提供商）
 * 6. 子域WHOIS 并行平级查询（试图查询其它子域提供商）
 * 7. 第三方RDAP 并行查询
 * 8. 第三方WHOIS 并行查询
 * 
 * 注意：此函数不会查询 DNS 提供商，因为：
 * - DNS 提供商查询需要数据库握手（获取账号配置）
 * - 公开 RDAP 接口无需鉴权，无法传递账号信息
 * - DNS 提供商查询仅在内部定时任务中执行（checker.ts）
 * 
 * @returns { type: 'RDAP' | 'WHOIS', raw: string, ... } 或 null
 */
async function queryRdapWithLayers(domain: string): Promise<any | null> {
  const rootDomain = getRootDomain(domain);
  const isSubdomain = domain !== rootDomain;
  
  log.info('RDAP', `Layered RDAP query for ${domain} (isSubdomain: ${isSubdomain})`);
  
  // 使用完整的分层查询服务
  const result = await whoisService.query(domain, {
    preferSubdomain: true,
    useCache: false,        // 公开 RDAP 不使用缓存，确保实时性
    skipUplevel: true,      // 禁用平级查询，避免查询其他提供商
  });
  
  if (!result) {
    return null;
  }
  
  // 判断查询类型：检查 raw 是否为 JSON
  let queryType: 'RDAP' | 'WHOIS' = 'WHOIS';
  try {
    JSON.parse(result.raw);
    // 如果能解析为 JSON，检查是否为 RDAP 格式
    if (result.raw.includes('"objectClassName"') || result.raw.includes('"rdapConformance"')) {
      queryType = 'RDAP';
    }
    // 注：DNS 提供商数据不会在此出现（需要认证，公开 RDAP 不传递配置）
  } catch (e) {
    // 不能解析为 JSON，是 WHOIS 文本
    queryType = 'WHOIS';
  }
  
  return {
    ...result,
    queryType,  // 添加查询类型标记
  };
}

/**
 * 将内部 WhoisResult 转换为标准 RDAP 格式 (RFC 7483)
 * 支持国际化域名(IDN)
 */
function convertToRdapFormat(domain: string, whoisResult: any): any {
  // 获取 Unicode 格式的域名用于显示
  const unicodeDomain = toUnicode(domain);
  
  const rdapResponse: any = {
    objectClassName: 'domain',
    // ldhName: 字母-数字-连字符格式（Punycode）
    ldhName: domain.toLowerCase(),
    // 如果域名包含非 ASCII 字符，添加 unicodeName 字段
    ...(unicodeDomain !== domain.toLowerCase() && { unicodeName: unicodeDomain }),
    handle: domain.toUpperCase(),
    
    // 域名状态
    status: whoisResult.status ? [whoisResult.status] : [],
    
    // 事件信息
    events: [],
    
    // 域名服务器
    nameservers: [],
    
    // 实体信息（注册商等）
    entities: [],
    
    // RDAP  conformant
    rdapConformance: [
      'rdap_level_0',
      'icann_rdap_technical_implementation_guide_0',
    ],
    
    //  notices: [
    //   {
    //     title: 'Terms of Use',
    //     description: [
    //       'This RDAP response is provided by DNSMgr.',
    //       'Data is queried in real-time from WHOIS/RDAP servers.',
    //     ],
    //     links: [
    //       {
    //         rel: 'terms-of-service',
    //         href: 'https://github.com/HiPM-Tech/DNSMgr',
    //         type: 'text/html',
    //       },
    //     ],
    //   },
    // ],
  };

  // 添加到期事件
  if (whoisResult.expiryDate) {
    rdapResponse.events.push({
      eventAction: 'expiration',
      eventDate: whoisResult.expiryDate.toISOString(),
    });
  }

  // 添加注册事件（如果有创建时间）
  if (whoisResult.creationDate) {
    rdapResponse.events.push({
      eventAction: 'registration',
      eventDate: whoisResult.creationDate.toISOString(),
    });
  }

  // 添加最后更新事件
  if (whoisResult.updateDate) {
    rdapResponse.events.push({
      eventAction: 'last changed',
      eventDate: whoisResult.updateDate.toISOString(),
    });
  }

  // 添加域名服务器
  if (whoisResult.nameServers && Array.isArray(whoisResult.nameServers)) {
    whoisResult.nameServers.forEach((ns: string) => {
      rdapResponse.nameservers.push({
        objectClassName: 'nameserver',
        ldhName: ns.toLowerCase(),
      });
    });
  }

  // 添加注册商实体
  if (whoisResult.registrar) {
    rdapResponse.entities.push({
      objectClassName: 'entity',
      roles: ['registrar'],
      vcardArray: [
        'vcard',
        [
          ['version', {}, 'text', '4.0'],
          ['fn', {}, 'text', whoisResult.registrar],
        ],
      ],
    });
  }

  // 添加原始 WHOIS 数据（作为 notice）
  if (whoisResult.raw) {
    rdapResponse.notices = rdapResponse.notices || [];
    rdapResponse.notices.push({
      title: 'Raw WHOIS Data',
      description: [whoisResult.raw.substring(0, 2000)], // 限制长度
      type: 'result-set-truncated',
    });
  }

  return rdapResponse;
}

/**
 * GET /api/rdap/domain/{domain}
 * 
 * 查询域名的 RDAP 信息
 * 
 * 示例:
 *   GET /api/rdap/domain/example.com
 *   GET /api/rdap/domain/hins.io.ht
 */
router.get(
  '/domain/:domain',
  asyncHandler(async (req, res, next): Promise<void> => {
    // 获取原始域名参数（可能是 Unicode 或 Punycode）
    const rawDomain = req.params.domain.trim();
    
    // 使用 IDN-aware 归一化（将 Unicode 转换为 Punycode）
    const domain = normalizeDomain(rawDomain);

    // 验证域名格式（支持 ASCII 和 Unicode/IDN 域名）
    if (!domain || !isValidDomain(domain)) {
      res.status(400).json({
        errorCode: 400,
        title: 'Bad Request',
        description: 'Invalid domain name format',
      });
      return;
    }

    try {
      log.info('RDAP', `Public RDAP query for domain: ${domain}`);

      // 使用完整的分层 RDAP 查询
      const queryResult = await queryRdapWithLayers(domain);

      if (!queryResult || !queryResult.expiryDate) {
        res.status(404).json({
          errorCode: 404,
          title: 'Not Found',
          description: `No RDAP information found for domain: ${domain}`,
        });
        return;
      }

      let rdapResponse: any;
      
      // 根据查询类型决定处理方式
      if (queryResult.queryType === 'RDAP') {
        // RDAP 查询：直接返回原始 JSON（不转换）
        log.info('RDAP', 'Returning raw RDAP response');
        try {
          rdapResponse = JSON.parse(queryResult.raw);
        } catch (e) {
          // 如果解析失败，降级为转换模式
          log.warn('RDAP', 'Failed to parse RDAP JSON, falling back to conversion');
          rdapResponse = convertToRdapFormat(domain, queryResult);
        }
      } else {
        // WHOIS 查询：转换为 RDAP 格式
        // 注：DNS 提供商查询不会在此触发（需要认证，公开 RDAP 不支持）
        log.info('RDAP', 'Converting WHOIS data to RDAP format');
        rdapResponse = convertToRdapFormat(domain, queryResult);
      }

      // 设置正确的 Content-Type
      res.setHeader('Content-Type', 'application/rdap+json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      res.json(rdapResponse);
    } catch (error) {
      log.error('RDAP', `Error querying domain ${domain}:`, {
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        errorCode: 500,
        title: 'Internal Server Error',
        description: 'Failed to query RDAP information',
      });
    }
  })
);

/**
 * GET /api/rdap/help
 * 
 * 返回 RDAP 帮助信息
 */
router.get(
  '/help',
  asyncHandler(async (req, res, next): Promise<void> => {
    res.json({
      objectClassName: 'help',
      rdapConformance: [
        'rdap_level_0',
      ],
      notices: [
        {
          title: 'DNSMgr RDAP Service',
          description: [
            'This is a public RDAP service provided by DNSMgr.',
            'It queries WHOIS/RDAP servers in real-time.',
            '',
            'Available endpoints:',
            '  GET /api/rdap/domain/{domain} - Query domain information',
            '',
            'Example:',
            '  GET /api/rdap/domain/example.com',
          ],
        },
      ],
    });
  })
);

export default router;
