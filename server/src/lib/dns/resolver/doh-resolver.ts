/**
 * DNS over HTTPS (DoH) 解析器
 */

import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { DNSQueryType, DNSResponse, DNSRecord } from './types';
import { log } from '../../logger';

// DNS 查询包编码（简化版，用于 DoH）
export function encodeDNSQuery(domain: string, type: DNSQueryType): Buffer {
  // 构造 DNS 查询包
  const buffer = Buffer.alloc(512);
  let offset = 0;

  // Transaction ID
  buffer.writeUInt16BE(Math.floor(Math.random() * 65535), offset);
  offset += 2;

  // Flags: Standard query
  buffer.writeUInt16BE(0x0100, offset);
  offset += 2;

  // Questions: 1
  buffer.writeUInt16BE(1, offset);
  offset += 2;

  // Answer RRs: 0
  buffer.writeUInt16BE(0, offset);
  offset += 2;

  // Authority RRs: 0
  buffer.writeUInt16BE(0, offset);
  offset += 2;

  // Additional RRs: 0
  buffer.writeUInt16BE(0, offset);
  offset += 2;

  // Encode domain name
  const labels = domain.split('.');
  for (const label of labels) {
    buffer.writeUInt8(label.length, offset++);
    buffer.write(label, offset);
    offset += label.length;
  }
  buffer.writeUInt8(0, offset++); // End of domain name

  // Query Type
  buffer.writeUInt16BE(type, offset);
  offset += 2;

  // Query Class: IN
  buffer.writeUInt16BE(1, offset);
  offset += 2;

  return buffer.slice(0, offset);
}

// 解析 DNS 响应包
export function decodeDNSResponse(buffer: Buffer): DNSResponse {
  let offset = 0;

  // Transaction ID
  const transactionId = buffer.readUInt16BE(offset);
  offset += 2;

  // Flags
  const flags = buffer.readUInt16BE(offset);
  offset += 2;

  // Questions
  const questions = buffer.readUInt16BE(offset);
  offset += 2;

  // Answer RRs
  const answerCount = buffer.readUInt16BE(offset);
  offset += 2;

  // Authority RRs
  const authorityCount = buffer.readUInt16BE(offset);
  offset += 2;

  // Additional RRs
  const additionalCount = buffer.readUInt16BE(offset);
  offset += 2;

  // Skip questions section
  for (let i = 0; i < questions; i++) {
    offset = skipDomainName(buffer, offset);
    offset += 4; // Type + Class
  }

  // Parse answers
  const answers: DNSRecord[] = [];
  for (let i = 0; i < answerCount; i++) {
    const record = parseDNSRecord(buffer, offset);
    answers.push(record.record);
    offset = record.offset;
  }

  // Parse authorities
  const authorities: DNSRecord[] = [];
  for (let i = 0; i < authorityCount; i++) {
    const record = parseDNSRecord(buffer, offset);
    authorities.push(record.record);
    offset = record.offset;
  }

  // Parse additionals
  const additionals: DNSRecord[] = [];
  for (let i = 0; i < additionalCount; i++) {
    const record = parseDNSRecord(buffer, offset);
    additionals.push(record.record);
    offset = record.offset;
  }

  return {
    answers,
    authorities,
    additionals,
    responseTime: 0,
    source: 'doh',
  };
}

// 跳过域名解析
function skipDomainName(buffer: Buffer, offset: number): number {
  while (true) {
    const length = buffer.readUInt8(offset);
    if (length === 0) {
      return offset + 1;
    }
    if ((length & 0xc0) === 0xc0) {
      // Compression pointer
      return offset + 2;
    }
    offset += length + 1;
  }
}

// 解析域名
function parseDomainName(buffer: Buffer, offset: number): { name: string; offset: number } {
  const labels: string[] = [];
  let jumped = false;
  let jumpOffset = 0;

  while (true) {
    const length = buffer.readUInt8(offset);

    if (length === 0) {
      offset++;
      break;
    }

    if ((length & 0xc0) === 0xc0) {
      // Compression pointer
      if (!jumped) {
        jumpOffset = offset + 2;
      }
      const pointer = ((length & 0x3f) << 8) | buffer.readUInt8(offset + 1);
      offset = pointer;
      jumped = true;
      continue;
    }

    offset++;
    const label = buffer.toString('utf8', offset, offset + length);
    labels.push(label);
    offset += length;
  }

  return {
    name: labels.join('.'),
    offset: jumped ? jumpOffset : offset,
  };
}

// 解析 DNS 记录
function parseDNSRecord(buffer: Buffer, offset: number): { record: DNSRecord; offset: number } {
  const domainResult = parseDomainName(buffer, offset);
  const name = domainResult.name;
  offset = domainResult.offset;

  const type = buffer.readUInt16BE(offset);
  offset += 2;

  const cls = buffer.readUInt16BE(offset);
  offset += 2;

  const ttl = buffer.readUInt32BE(offset);
  offset += 4;

  const rdLength = buffer.readUInt16BE(offset);
  offset += 2;

  let data: string;

  switch (type) {
    case 1: // A
      data = `${buffer.readUInt8(offset)}.${buffer.readUInt8(offset + 1)}.${buffer.readUInt8(offset + 2)}.${buffer.readUInt8(offset + 3)}`;
      break;
    case 28: // AAAA
      const parts: string[] = [];
      for (let i = 0; i < 8; i++) {
        parts.push(buffer.readUInt16BE(offset + i * 2).toString(16));
      }
      data = parts.join(':');
      break;
    case 2: // NS
    case 5: // CNAME
    case 12: // PTR
      const nsResult = parseDomainName(buffer, offset);
      data = nsResult.name;
      break;
    case 15: // MX
      const preference = buffer.readUInt16BE(offset);
      const mxResult = parseDomainName(buffer, offset + 2);
      data = `${preference} ${mxResult.name}`;
      break;
    case 16: // TXT
      const txtLength = buffer.readUInt8(offset);
      data = buffer.toString('utf8', offset + 1, offset + 1 + txtLength);
      break;
    default:
      data = buffer.slice(offset, offset + rdLength).toString('hex');
  }

  offset += rdLength;

  return {
    record: {
      name,
      type,
      ttl,
      data,
    },
    offset,
  };
}

/**
 * 使用 DoH 查询 DNS
 */
export async function queryDoH(
  domain: string,
  type: DNSQueryType,
  dohUrl: string,
  timeout: number = 5000
): Promise<DNSResponse | null> {
  const startTime = Date.now();

  try {
    // 构造 DoH 查询 URL
    const url = new URL(dohUrl);
    url.searchParams.append('name', domain);
    url.searchParams.append('type', type.toString());

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/dns-json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const responseTime = Date.now() - startTime;

    // 解析响应
    const answers: DNSRecord[] = (data.Answer || []).map((ans: any) => ({
      name: ans.name,
      type: ans.type,
      ttl: ans.TTL,
      data: ans.data,
    }));

    return {
      answers,
      authorities: [],
      additionals: [],
      responseTime,
      source: dohUrl,
    };
  } catch (error) {
    log.error('DoHResolver', `DoH query failed for ${domain}`, {
      error: error instanceof Error ? error.message : String(error),
      url: dohUrl,
    });
    return null;
  }
}

/**
 * 使用 DNS wire format 通过 DoH 查询（备用方法）
 */
export async function queryDoHWire(
  domain: string,
  type: DNSQueryType,
  dohUrl: string,
  timeout: number = 5000
): Promise<DNSResponse | null> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const queryBuffer = encodeDNSQuery(domain, type);
    const url = new URL(dohUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + '?dns=' + queryBuffer.toString('base64url'),
      method: 'GET',
      headers: {
        'Accept': 'application/dns-message',
      },
      timeout,
    };

    const req = client.request(options, (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk) => chunks.push(chunk));

      res.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          const response = decodeDNSResponse(buffer);
          response.responseTime = Date.now() - startTime;
          response.source = dohUrl;
          resolve(response);
        } catch (error) {
          log.error('DoHResolver', `Failed to decode DoH response for ${domain}`, {
            error: error instanceof Error ? error.message : String(error),
          });
          resolve(null);
        }
      });
    });

    req.on('error', (error) => {
      log.error('DoHResolver', `DoH request failed for ${domain}`, {
        error: error.message,
      });
      resolve(null);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.end();
  });
}
