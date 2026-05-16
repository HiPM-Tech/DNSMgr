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
import { queryWhois, getRootDomain } from '../service/whois';
import { log } from '../lib/logger';
import { normalizeDomain, isValidDomain, toUnicode } from '../utils/domain';

const router = Router();

/**
 * 简化的 RDAP 查询函数（不使用内部分层查询）
 * 
 * 查询策略：
 * - 顶域：顶域 > 第三方
 * - 子域：仅查询子域（如果无法在子域名提供商直接查到则放弃）
 * 
 * @returns { type: 'RDAP' | 'WHOIS' | 'DNS', raw: string, ... } 或 null
 */
async function queryRdapSimple(domain: string): Promise<any | null> {
  const rootDomain = getRootDomain(domain);
  const isSubdomain = domain !== rootDomain;
  
  log.info('RDAP', `Simple RDAP query for ${domain} (isSubdomain: ${isSubdomain})`);
  
  // 直接查询 WHOIS/RDAP
  const result = await queryWhois(domain);
  
  if (!result) {
    return null;
  }
  
  // 判断查询类型：检查 raw 是否为 JSON
  let queryType: 'RDAP' | 'WHOIS' | 'DNS' = 'WHOIS';
  try {
    JSON.parse(result.raw);
    // 如果能解析为 JSON，可能是 RDAP 或 DNS
    // 根据是否有特定字段判断
    if (result.raw.includes('"objectClassName"') || result.raw.includes('"rdapConformance"')) {
      queryType = 'RDAP';
    } else {
      queryType = 'DNS';
    }
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

      // 使用简化的 RDAP 查询（不使用内部分层查询）
      const queryResult = await queryRdapSimple(domain);

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
      } else if (queryResult.queryType === 'DNS') {
        // DNS 提供商：不支持公开 RDAP
        log.warn('RDAP', 'DNS provider data not supported for public RDAP');
        res.status(501).json({
          errorCode: 501,
          title: 'Not Implemented',
          description: 'DNS provider data is not available via public RDAP service',
        });
        return;
      } else {
        // WHOIS 查询：转换为 RDAP 格式
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
