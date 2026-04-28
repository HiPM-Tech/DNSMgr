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

const router = Router();

/**
 * 简化的 RDAP 查询函数（不使用内部分层查询）
 * 
 * 查询策略：
 * - 顶域：顶域 > 第三方
 * - 子域：仅查询子域（如果无法在子域名提供商直接查到则放弃）
 */
async function queryRdapSimple(domain: string): Promise<any | null> {
  const rootDomain = getRootDomain(domain);
  const isSubdomain = domain !== rootDomain;
  
  log.info('RDAP', `Simple RDAP query for ${domain} (isSubdomain: ${isSubdomain})`);
  
  if (!isSubdomain) {
    // 顶域查询：顶域 > 第三方
    log.info('RDAP', 'Querying apex domain with third-party fallback');
    
    // 使用 whoisService.query() 但禁用缓存
    const result = await whoisService.query(domain, { 
      preferSubdomain: false,
      useCache: false 
    });
    
    return result;
  } else {
    // 子域查询：仅查询子域，不查询父域
    log.info('RDAP', 'Querying subdomain only (no parent domain query)');
    
    // 对于子域，我们只尝试直接查询子域本身
    // 由于 whoisService.query() 会自动 fallback 到父域，我们需要手动控制
    // 这里直接返回 null，表示不支持子域查询
    // TODO: 未来可以添加专门的子域查询选项
    log.warn('RDAP', `Subdomain query not supported in simple mode: ${domain}`);
    return null;
  }
}

/**
 * 将内部 WhoisResult 转换为标准 RDAP 格式 (RFC 7483)
 */
function convertToRdapFormat(domain: string, whoisResult: any): any {
  const rdapResponse: any = {
    objectClassName: 'domain',
    ldhName: domain.toLowerCase(),
    handle: domain.toUpperCase(),
    
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
    const domain = req.params.domain.toLowerCase().trim();

    // 验证域名格式
    const domainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;
    if (!domain || !domainRegex.test(domain)) {
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
      const whoisResult = await queryRdapSimple(domain);

      if (!whoisResult || !whoisResult.expiryDate) {
        res.status(404).json({
          errorCode: 404,
          title: 'Not Found',
          description: `No RDAP information found for domain: ${domain}`,
        });
        return;
      }

      // 转换为标准 RDAP 格式
      const rdapResponse = convertToRdapFormat(domain, whoisResult);

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
