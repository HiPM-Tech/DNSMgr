import net from 'net';
import tls from 'tls';
import { getAdapter } from '../db/adapter';

export interface SmtpConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
}

const DEFAULT_SMTP_CONFIG: SmtpConfig = {
  enabled: false,
  host: '',
  port: 587,
  secure: false,
  username: '',
  password: '',
  fromEmail: '',
  fromName: 'DNSMgr',
};

function parseConfig(raw: unknown): SmtpConfig {
  if (!raw) return DEFAULT_SMTP_CONFIG;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) as Partial<SmtpConfig> : raw as Partial<SmtpConfig>;
    return {
      enabled: !!parsed.enabled,
      host: String(parsed.host || ''),
      port: Number(parsed.port || 587),
      secure: !!parsed.secure,
      username: String(parsed.username || ''),
      password: String(parsed.password || ''),
      fromEmail: String(parsed.fromEmail || ''),
      fromName: String(parsed.fromName || 'DNSMgr'),
    };
  } catch {
    return DEFAULT_SMTP_CONFIG;
  }
}

export async function getSmtpConfig(): Promise<SmtpConfig> {
  const db = getAdapter();
  if (!db) return DEFAULT_SMTP_CONFIG;
  const row = await db.get('SELECT value FROM system_settings WHERE key = ?', ['smtp_config']) as { value: string } | undefined;
  if (!row?.value) return DEFAULT_SMTP_CONFIG;
  return parseConfig(row.value);
}

export async function updateSmtpConfig(input: Partial<SmtpConfig>): Promise<SmtpConfig> {
  const db = getAdapter();
  if (!db) throw new Error('Database not available');
  const current = await getSmtpConfig();
  const next: SmtpConfig = {
    ...current,
    ...input,
    port: Number(input.port ?? current.port),
    enabled: input.enabled ?? current.enabled,
    secure: input.secure ?? current.secure,
  };

  const payload = ['smtp_config', JSON.stringify(next)];
  if (db.type === 'mysql') {
    await db.execute(
      'INSERT INTO system_settings (`key`, `value`, updated_at) VALUES (?, ?, ' + db.now() + ') ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = ' + db.now(),
      payload
    );
  } else {
    await db.execute(
      'INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ' + db.now() + ') ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = ' + db.now(),
      payload
    );
  }
  return next;
}

function escapeSmtpText(text: string): string {
  return text.replace(/\r?\n\./g, '\r\n..');
}

async function sendRawSmtpMail(config: SmtpConfig, to: string, subject: string, text: string): Promise<void> {
  if (!config.host || !config.port || !config.fromEmail) throw new Error('SMTP configuration is incomplete');

  const timeoutMs = Number(process.env.SMTP_TIMEOUT_MS || 15000);
  const useImplicitTls = config.secure || config.port === 465;
  let socket: net.Socket | tls.TLSSocket = useImplicitTls
    ? tls.connect({ host: config.host, port: config.port, servername: config.host })
    : net.connect({ host: config.host, port: config.port });

  const waitForCode = async (expectedPrefix?: string | string[]): Promise<string> => {
    return await new Promise<string>((resolve, reject) => {
      let buf = '';
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`SMTP timeout waiting for ${Array.isArray(expectedPrefix) ? expectedPrefix.join('/') : (expectedPrefix || 'response')} (${timeoutMs}ms)`));
      }, timeoutMs);

      const matchesExpected = (line: string): boolean => {
        if (!expectedPrefix) return true;
        if (Array.isArray(expectedPrefix)) return expectedPrefix.some((prefix) => line.startsWith(prefix));
        return line.startsWith(expectedPrefix);
      };

      const cleanup = () => {
        clearTimeout(timer);
        socket.off('data', onData);
        socket.off('error', onError);
        socket.off('close', onClose);
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const onClose = () => {
        cleanup();
        reject(new Error('SMTP connection closed unexpectedly'));
      };

      const onData = (chunk: Buffer) => {
        buf += chunk.toString('utf8');
        const lines = buf.split(/\r?\n/).filter(Boolean);
        const last = lines[lines.length - 1];
        if (!last || last.length < 3) return;
        const code = last.slice(0, 3);
        const continueFlag = last[3];
        if (!/^\d{3}$/.test(code) || continueFlag === '-') return;
        cleanup();
        if (!matchesExpected(last)) {
          reject(new Error(`SMTP unexpected response: ${last}`));
          return;
        }
        if (!expectedPrefix && Number(code) >= 400) {
          reject(new Error(`SMTP error response: ${last}`));
          return;
        }
        resolve(last);
      };
      socket.on('data', onData);
      socket.on('error', onError);
      socket.on('close', onClose);
    });
  };

  const sendCmd = async (command: string, expectedPrefix?: string | string[]): Promise<string> => {
    socket.write(command + '\r\n');
    return await waitForCode(expectedPrefix);
  };

  await waitForCode('220');
  let ehloResp = await sendCmd('EHLO dnsmgr.local', '250');

  // If server supports STARTTLS, upgrade plaintext connection before AUTH/MAIL.
  if (!useImplicitTls && /(^|\r?\n)250[ -].*STARTTLS/i.test(ehloResp)) {
    await sendCmd('STARTTLS', '220');
    socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
      const tlsSocket = tls.connect({ socket, servername: config.host }, () => resolve(tlsSocket));
      tlsSocket.once('error', reject);
    });
    ehloResp = await sendCmd('EHLO dnsmgr.local', '250');
  }

  if (config.username && config.password) {
    await sendCmd('AUTH LOGIN', '334');
    await sendCmd(Buffer.from(config.username).toString('base64'), '334');
    await sendCmd(Buffer.from(config.password).toString('base64'), '235');
  }

  await sendCmd(`MAIL FROM:<${config.fromEmail}>`, '250');
  await sendCmd(`RCPT TO:<${to}>`, ['250', '251']);
  await sendCmd('DATA', '354');

  const fromDisplay = config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail;
  const content =
    `From: ${fromDisplay}\r\n` +
    `To: <${to}>\r\n` +
    `Subject: ${subject}\r\n` +
    'MIME-Version: 1.0\r\n' +
    'Content-Type: text/plain; charset=UTF-8\r\n' +
    '\r\n' +
    `${escapeSmtpText(text)}\r\n.`;
  await sendCmd(content, '250');
  await sendCmd('QUIT', '221');
  socket.end();
}

export async function sendSmtpEmail(to: string, subject: string, text: string): Promise<void> {
  const config = await getSmtpConfig();
  if (!config.enabled) throw new Error('SMTP is not enabled');
  await sendRawSmtpMail(config, to, subject, text);
}

