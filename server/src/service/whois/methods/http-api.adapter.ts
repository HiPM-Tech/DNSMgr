import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { WhoisAdapter, WhoisResult } from '../types';
import { normalizeDomain } from '../../../utils/dns';
import { parseDate } from '../data-parser';

export interface HttpApiMapping {
  dataPath?: string;
  domainKey: string;
  expiryKey: string;
  nameServersKey?: string;
  statusKey?: string;
  registerTimeKey?: string;
  registrarKey?: string;
}

export function createHttpApiAdapter(mapping: HttpApiMapping): WhoisAdapter {
  const config = { nameServersKey: 'nameServers', ...mapping };

  return {
    name: 'http-api',

    async query(domain: string, server: string): Promise<WhoisResult | null> {
      const punycodeDomain = normalizeDomain(domain);
      const url = server.replace(/\{domain\}/g, punycodeDomain);

      try {
        const rawData = await httpRequest(url);
        if (!rawData) return null;

        let data = rawData;
        if (config.dataPath) {
          for (const key of config.dataPath.split('.')) {
            data = data?.[key];
            if (!data) return null;
          }
        }

        const expiryDate = data[config.expiryKey] ? parseDate(data[config.expiryKey]) : null;
        if (!expiryDate) return null;

        let nameServers: string[] = [];
        const nsKey = config.nameServersKey;
        if (nsKey && Array.isArray(data[nsKey])) {
          nameServers = data[nsKey].map((ns: string) => ns.toLowerCase());
        }

        return {
          domain: String(data[config.domainKey] || domain),
          expiryDate,
          registrar: config.registrarKey ? (data[config.registrarKey] ?? null) : null,
          nameServers,
          raw: JSON.stringify(rawData),
          status: config.statusKey ? (data[config.statusKey] ?? null) : null,
        };
      } catch {
        return null;
      }
    },
  };
}

function httpRequest(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      timeout: 10000,
    };

    const req = client.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(responseData)); }
          catch (e) { reject(new Error(`Invalid JSON: ${e}`)); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}
