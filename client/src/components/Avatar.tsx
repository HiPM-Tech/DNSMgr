import { useEffect, useMemo, useState } from 'react';
import { getGravatarHash, getGravatarUrl, getOrderedGravatarMirrors, refreshGravatarMirrorHealth } from '../utils/gravatar';

interface AvatarProps {
  username?: string | null;
  email?: string | null;
  size?: number;
  className?: string;
  textClassName?: string;
}

export function Avatar({
  username,
  email,
  size = 32,
  className = '',
  textClassName = '',
}: AvatarProps) {
  const hash = useMemo(() => getGravatarHash(email), [email]);
  const [mirrors, setMirrors] = useState<string[]>(() => getOrderedGravatarMirrors());
  const [mirrorIndex, setMirrorIndex] = useState(0);

  useEffect(() => {
    let active = true;
    refreshGravatarMirrorHealth().then((ordered) => {
      if (active) setMirrors(ordered);
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setMirrorIndex(0);
  }, [hash]);

  const fallbackText = username?.[0]?.toUpperCase() ?? '?';
  const wrapperClass = `rounded-full overflow-hidden bg-blue-600 flex items-center justify-center text-white font-bold flex-shrink-0 ${className}`.trim();

  if (!hash || mirrors.length === 0 || mirrorIndex >= mirrors.length) {
    return (
      <div className={wrapperClass} style={{ width: size, height: size }}>
        <span className={textClassName}>{fallbackText}</span>
      </div>
    );
  }

  return (
    <div className={wrapperClass} style={{ width: size, height: size }}>
      <img
        src={getGravatarUrl(mirrors[mirrorIndex], hash, size * 2)}
        alt={username ?? 'avatar'}
        className="w-full h-full object-cover"
        referrerPolicy="no-referrer"
        onError={() => setMirrorIndex((current) => current + 1)}
      />
    </div>
  );
}
