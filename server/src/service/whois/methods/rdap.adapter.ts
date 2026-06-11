import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { WhoisAdapter, WhoisResult } from '../types';
import { normalizeDomain } from '../../../utils/dns';
import { extractExpiryDate, extractRegistrar, extractNameServers, extractStatus } from '../data-parser';

export const rdapAdapter: WhoisAdapter = {
  name: 'rdap',

  async query(domain: string, server: string): Promise<WhoisResult | null> {
    const punycodeDomain = normalizeDomain(domain);
    const baseUrl = server.endsWith('/') ? server : `${server}/`;
    const url = `${baseUrl}domain/${punycodeDomain}`;

    try {
      const data = await httpRequest(url);
      if (!data) return null;

      const raw = JSON.stringify(data);
      return {
        domain,
        expiryDate: extractExpiryDate(raw, 'RDAP'),
        registrar: extractRegistrar(raw, 'RDAP'),
        nameServers: extractNameServers(raw),
        raw,
        status: extractStatus(raw),
      };
    } catch {
      return null;
    }
  },
};

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
        'Accept': 'application/rdap+json',
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
