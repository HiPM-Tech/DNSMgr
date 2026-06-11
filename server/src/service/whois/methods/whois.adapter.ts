import * as net from 'net';
import { WhoisAdapter, WhoisResult } from '../types';
import { normalizeDomain } from '../../../utils/dns';
import { extractExpiryDate, extractRegistrar, extractNameServers, extractStatus, isWhoisNotFound } from '../data-parser';

export const whoisAdapter: WhoisAdapter = {
  name: 'whois',

  async query(domain: string, server: string): Promise<WhoisResult | null> {
    const [host, portStr] = server.split(':');
    const port = portStr ? parseInt(portStr) : 43;
    const punycodeDomain = normalizeDomain(domain);

    try {
      const raw = await whoisLookup(punycodeDomain, host, port);
      if (!raw || isWhoisNotFound(raw)) return null;

      return {
        domain,
        expiryDate: extractExpiryDate(raw, 'WHOIS'),
        registrar: extractRegistrar(raw, 'WHOIS'),
        nameServers: extractNameServers(raw),
        raw,
        status: extractStatus(raw),
      };
    } catch {
      return null;
    }
  },
};

function whoisLookup(domain: string, host: string, port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let data = '';
    socket.setTimeout(10000);
    socket.on('connect', () => socket.write(`${domain}\r\n`));
    socket.on('data', (chunk) => { data += chunk.toString(); });
    socket.on('close', () => resolve(data));
    socket.on('error', (err) => reject(err));
    socket.on('timeout', () => { socket.destroy(); reject(new Error('WHOIS query timeout')); });
    socket.connect(port, host);
  });
}
