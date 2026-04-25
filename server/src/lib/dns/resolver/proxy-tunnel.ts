/**
 * 代理隧道支持（HTTPS CONNECT）
 * 用于通过 HTTP/HTTPS 代理建立隧道连接
 */

import * as net from 'net';
import * as tls from 'tls';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { log } from '../../logger';

export interface ProxyConfig {
  host: string;
  port: number;
  protocol: 'http' | 'https';
  url?: string;  // 完整的代理 URL
  auth?: {
    username: string;
    password: string;
  };
}

/**
 * 通过 HTTPS CONNECT 建立代理隧道
 */
export async function createProxyTunnel(
  targetHost: string,
  targetPort: number,
  proxyConfig: ProxyConfig,
  timeout: number = 10000
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const { host: proxyHost, port: proxyPort, protocol, auth } = proxyConfig;

    // 构建 CONNECT 请求头
    const connectHeaders: string[] = [
      `CONNECT ${targetHost}:${targetPort} HTTP/1.1`,
      `Host: ${targetHost}:${targetPort}`,
      'Connection: close',
    ];

    // 添加代理认证
    if (auth) {
      const authString = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      connectHeaders.push(`Proxy-Authorization: Basic ${authString}`);
    }

    connectHeaders.push('', '');
    const connectRequest = connectHeaders.join('\r\n');

    log.debug('ProxyTunnel', `Creating tunnel to ${targetHost}:${targetPort} via ${proxyHost}:${proxyPort}`);

    const socket = new net.Socket();
    let buffer = '';

    const cleanup = () => {
      socket.removeAllListeners();
    };

    // 设置超时
    const timer = setTimeout(() => {
      cleanup();
      socket.destroy();
      reject(new Error('Proxy tunnel connection timeout'));
    }, timeout);

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      socket.write(connectRequest);
    });

    socket.on('data', (data) => {
      buffer += data.toString();

      // 检查是否收到完整的 HTTP 响应头
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd !== -1) {
        const response = buffer.substring(0, headerEnd);
        const statusLine = response.split('\r\n')[0];
        const statusMatch = statusLine.match(/HTTP\/\d\.\d (\d{3})/);

        if (statusMatch && statusMatch[1] === '200') {
          // 隧道建立成功
          clearTimeout(timer);
          cleanup();
          log.debug('ProxyTunnel', `Tunnel established to ${targetHost}:${targetPort}`);
          resolve(socket);
        } else {
          // 隧道建立失败
          clearTimeout(timer);
          cleanup();
          socket.destroy();
          reject(new Error(`Proxy tunnel failed: ${statusLine}`));
        }
      }
    });

    socket.on('error', (error) => {
      clearTimeout(timer);
      cleanup();
      reject(error);
    });

    socket.on('timeout', () => {
      clearTimeout(timer);
      cleanup();
      socket.destroy();
      reject(new Error('Proxy tunnel socket timeout'));
    });

    // 连接到代理服务器
    socket.connect(proxyPort, proxyHost);
  });
}

/**
 * 通过代理隧道进行 TLS 连接
 */
export async function createTLSViaProxy(
  targetHost: string,
  targetPort: number,
  proxyConfig: ProxyConfig,
  tlsOptions: tls.ConnectionOptions = {},
  timeout: number = 10000
): Promise<tls.TLSSocket> {
  const socket = await createProxyTunnel(targetHost, targetPort, proxyConfig, timeout);

  return new Promise((resolve, reject) => {
    const tlsSocket = tls.connect({
      socket,
      servername: targetHost,
      ...tlsOptions,
    });

    const timer = setTimeout(() => {
      tlsSocket.destroy();
      reject(new Error('TLS handshake timeout'));
    }, timeout);

    tlsSocket.on('secureConnect', () => {
      clearTimeout(timer);
      resolve(tlsSocket);
    });

    tlsSocket.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/**
 * 解析代理配置字符串
 * 支持格式：http://user:pass@host:port 或 https://host:port
 */
export function parseProxyUrl(proxyUrl: string): ProxyConfig {
  const url = new URL(proxyUrl);
  
  const config: ProxyConfig = {
    host: url.hostname,
    port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
    protocol: url.protocol === 'https:' ? 'https' : 'http',
  };

  if (url.username) {
    config.auth = {
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password || ''),
    };
  }

  return config;
}
