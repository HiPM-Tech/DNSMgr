import { gravatarMirrors, gravatarProbeConfig } from '../config/gravatar';
import { md5 } from './md5';

const STORAGE_KEY = 'gravatar-mirror-health';
const PROBE_HASH = md5('dnsmgr@example.com');

type MirrorHealth = Record<string, { ok: boolean; checkedAt: number }>;

function readHealth(): MirrorHealth {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as MirrorHealth;
  } catch {
    return {};
  }
}

function writeHealth(value: MirrorHealth) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function shouldProbe(checkedAt?: number): boolean {
  if (!checkedAt) return true;
  return Date.now() - checkedAt > gravatarProbeConfig.probeIntervalMs;
}

function probeMirror(baseUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => {
      img.src = '';
      resolve(false);
    }, gravatarProbeConfig.requestTimeoutMs);

    img.onload = () => {
      window.clearTimeout(timer);
      resolve(true);
    };

    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };

    img.src = `${baseUrl}${PROBE_HASH}?d=identicon&s=32&_t=${Date.now()}`;
  });
}

export function getGravatarHash(email?: string | null): string | null {
  const normalized = (email ?? '').trim().toLowerCase();
  if (!normalized) return null;
  return md5(normalized);
}

export function getGravatarUrl(baseUrl: string, hash: string, size = gravatarProbeConfig.defaultSize): string {
  return `${baseUrl}${hash}?d=${gravatarProbeConfig.defaultFallback}&s=${size}`;
}

export function getOrderedGravatarMirrors(): string[] {
  const health = readHealth();
  const healthy = gravatarMirrors.filter((item) => health[item.id]?.ok).map((item) => item.baseUrl);
  const unknown = gravatarMirrors.filter((item) => !health[item.id]).map((item) => item.baseUrl);
  const unhealthy = gravatarMirrors.filter((item) => health[item.id] && !health[item.id].ok).map((item) => item.baseUrl);
  return [...healthy, ...unknown, ...unhealthy];
}

export async function refreshGravatarMirrorHealth(force = false): Promise<string[]> {
  const current = readHealth();
  const next = { ...current };

  await Promise.all(gravatarMirrors.map(async (mirror) => {
    if (!force && !shouldProbe(current[mirror.id]?.checkedAt)) return;
    const ok = await probeMirror(mirror.baseUrl);
    next[mirror.id] = { ok, checkedAt: Date.now() };
  }));

  writeHealth(next);
  return getOrderedGravatarMirrors();
}
