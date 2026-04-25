/**
 * 明文 DNS 解析器（UDP/TCP）
 */

import * as dgram from 'dgram';
import * as net from 'net';
import { DNSQueryType, DNSResponse, DNSServerType } from './types';
import { encodeDNSQuery, decodeDNSResponse } from './doh-resolver';
import { log } from '../../logger';

/**
 * 使用 UDP 查询 DNS
 */
export async function queryDNSUDP(
  domain: string,
  type: DNSQueryType,
  serverAddress: string,
  timeout: number = 3000
): Promise<DNSResponse | null> {
  return new Promise((resolve) => {
    const [host, portStr] = serverAddress.split(':');
    const port = parseInt(portStr) || 53;

    const socket = dgram.createSocket('udp4');
    const queryBuffer = encodeDNSQuery(domain, type);

    let timer: NodeJS.Timeout;

    const cleanup = () => {
      clearTimeout(timer);
      socket.close();
    };

    // 设置超时
    timer = setTimeout(() => {
      log.debug('PlainResolver', `UDP DNS query timeout: ${domain} @ ${serverAddress}`);
      cleanup();
      resolve(null);
    }, timeout);

    socket.on('message', (msg) => {
      try {
        const response = decodeDNSResponse(msg);
        response.source = `udp://${serverAddress}`;
        cleanup();
        resolve(response);
      } catch (error) {
        log.error('PlainResolver', `Failed to decode UDP DNS response: ${domain}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        cleanup();
        resolve(null);
      }
    });

    socket.on('error', (error) => {
      log.error('PlainResolver', `UDP DNS socket error: ${domain}`, {
        error: error.message,
      });
      cleanup();
      resolve(null);
    });

    // 发送查询
    socket.send(queryBuffer, port, host, (error) => {
      if (error) {
        log.error('PlainResolver', `Failed to send UDP DNS query: ${domain}`, {
          error: error.message,
        });
        cleanup();
        resolve(null);
      }
    });
  });
}

/**
 * 使用 TCP 查询 DNS
 */
export async function queryDNSTCP(
  domain: string,
  type: DNSQueryType,
  serverAddress: string,
  timeout: number = 5000
): Promise<DNSResponse | null> {
  return new Promise((resolve) => {
    const [host, portStr] = serverAddress.split(':');
    const port = parseInt(portStr) || 53;

    const queryBuffer = encodeDNSQuery(domain, type);
    
    // TCP DNS 需要在数据前添加 2 字节的长度前缀
    const tcpBuffer = Buffer.alloc(2 + queryBuffer.length);
    tcpBuffer.writeUInt16BE(queryBuffer.length, 0);
    queryBuffer.copy(tcpBuffer, 2);

    const socket = new net.Socket();
    let dataBuffer = Buffer.alloc(0);
    let expectedLength = 0;

    let timer: NodeJS.Timeout;

    const cleanup = () => {
      clearTimeout(timer);
      socket.destroy();
    };

    // 设置超时
    timer = setTimeout(() => {
      log.debug('PlainResolver', `TCP DNS query timeout: ${domain} @ ${serverAddress}`);
      cleanup();
      resolve(null);
    }, timeout);

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      socket.write(tcpBuffer);
    });

    socket.on('data', (data) => {
      dataBuffer = Buffer.concat([dataBuffer, data]);

      // 检查是否收到完整响应
      if (expectedLength === 0 && dataBuffer.length >= 2) {
        expectedLength = dataBuffer.readUInt16BE(0) + 2;
      }

      if (expectedLength > 0 && dataBuffer.length >= expectedLength) {
        try {
          // 去掉 2 字节长度前缀
          const responseData = dataBuffer.slice(2, expectedLength);
          const response = decodeDNSResponse(responseData);
          response.source = `tcp://${serverAddress}`;
          cleanup();
          resolve(response);
        } catch (error) {
          log.error('PlainResolver', `Failed to decode TCP DNS response: ${domain}`, {
            error: error instanceof Error ? error.message : String(error),
          });
          cleanup();
          resolve(null);
        }
      }
    });

    socket.on('error', (error) => {
      log.error('PlainResolver', `TCP DNS socket error: ${domain}`, {
        error: error.message,
      });
      cleanup();
      resolve(null);
    });

    socket.on('timeout', () => {
      log.debug('PlainResolver', `TCP DNS socket timeout: ${domain}`);
      cleanup();
      resolve(null);
    });

    socket.on('close', () => {
      if (expectedLength === 0 || dataBuffer.length < expectedLength) {
        cleanup();
        resolve(null);
      }
    });

    // 连接服务器
    socket.connect(port, host);
  });
}

/**
 * 查询明文 DNS
 */
export async function queryPlainDNS(
  domain: string,
  type: DNSQueryType,
  serverAddress: string,
  protocol: DNSServerType,
  timeout: number
): Promise<DNSResponse | null> {
  if (protocol === DNSServerType.UDP) {
    return queryDNSUDP(domain, type, serverAddress, timeout);
  } else if (protocol === DNSServerType.TCP) {
    return queryDNSTCP(domain, type, serverAddress, timeout);
  }
  return null;
}
