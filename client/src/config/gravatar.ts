export interface GravatarMirror {
  id: string;
  name: string;
  baseUrl: string;
}

export const gravatarMirrors: GravatarMirror[] = [
  { id: 'v2ex', name: 'V2EX', baseUrl: 'https://cdn.v2ex.com/gravatar/' },
  { id: 'geekzu', name: '极客族', baseUrl: 'https://sdn.geekzu.org/avatar/' },
  { id: 'loli', name: 'loli', baseUrl: 'https://gravatar.loli.net/avatar/' },
  { id: 'inwao', name: 'inwao', baseUrl: 'https://gravatar.inwao.com/avatar/' },
];

export const gravatarProbeConfig = {
  probeIntervalMs: 1000 * 60 * 60 * 6,
  requestTimeoutMs: 3500,
  defaultSize: 160,
  defaultFallback: 'identicon',
};

// Community mirrors can be added here later.
