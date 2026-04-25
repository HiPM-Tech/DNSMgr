/**
 * DNS over TLS (DoT) 解析器
 */

import * as tls from 'tls';
import { DNSQueryType, DNSResponse } from './types';
import { encodeDNSQuery, decodeDNSResponse } from './doh-resolver';
import { log } from '../../logger';

/**
 * 使用 DoT 查询 DNS
 */
export async function queryDoT(
  domain: string,
  type: DNSQueryType,
  serverAddress: string,
  timeout: number = 5000
): Promise<DNSResponse | null> {
  return new Promise((resolve) => {
    const [host, portStr] = serverAddress.split(':');
    const port = parseInt(portStr) || 853;

    const queryBuffer = encodeDNSQuery(domain, type);
    
    // DoT 需要在数据前添加 2 字节的长度前缀（与 TCP DNS 相同）
    const dotBuffer = Buffer.alloc(2 + queryBuffer.length);
    dotBuffer.writeUInt16BE(queryBuffer.length, 0);
    queryBuffer.copy(dotBuffer, 2);

    let dataBuffer = Buffer.alloc(0);
    let expectedLength = 0;

    let timer: NodeJS.Timeout;

    const cleanup = () => {
      clearTimeout(timer);
    };

    // 设置超时
    timer = setTimeout(() => {
      log.debug('DoTResolver', `DoT query timeout: ${domain} @ ${serverAddress}`);
      cleanup();
      socket.end();
      resolve(null);
    }, timeout);

    // 创建 TLS 连接
    const socket = tls.connect({
      host,
      port,
      servername: host, // SNI
      rejectUnauthorized: true,
    });

    socket.setTimeout(timeout);

    socket.on('secureConnect', () => {
      log.debug('DoTResolver', `DoT TLS connection established: ${host}:${port}`);
      socket.write(dotBuffer);
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
          response.source = `dot://${serverAddress}`;
          cleanup();
          socket.end();
          resolve(response);
        } catch (error) {
          log.error('DoTResolver', `Failed to decode DoT response: ${domain}`, {
            error: error instanceof Error ? error.message : String(error),
          });
          cleanup();
          socket.end();
          resolve(null);
        }
      }
    });

    socket.on('error', (error) => {
      log.error('DoTResolver', `DoT socket error: ${domain}`, {
        error: error.message,
      });
      cleanup();
      resolve(null);
    });

    socket.on('timeout', () => {
      log.debug('DoTResolver', `DoT socket timeout: ${domain}`);
      cleanup();
      socket.end();
      resolve(null);
    });

    socket.on('close', () => {
      if (expectedLength === 0 || dataBuffer.length < expectedLength) {
        cleanup();
        resolve(null);
      }
    });
  });
}

/**
 * 使用 DoT 通过代理隧道查询
 * 通过 HTTPS CONNECT 建立隧道，然后在隧道内进行 TLS 连接
 */
export async function queryDoTWithProxy(
  domain: string,
  type: DNSQueryType,
  serverAddress: string,
  proxyHost: string,
  proxyPort: number,
  timeout: number = 5000
): Promise<DNSResponse | null> {
  // TODO: 实现通过 HTTPS CONNECT 代理的 DoT 查询
  log.debug('DoTResolver', `DoT with proxy not implemented yet: ${domain}`);
  return null;
}
