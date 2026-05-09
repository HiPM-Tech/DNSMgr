import { useEffect, useMemo, useState } from 'react';
import { Avatar as TAvatar } from 'tdesign-react';
import { getGravatarHash, getGravatarUrl, getOrderedGravatarMirrors, refreshGravatarMirrorHealth } from '../utils/gravatar';
import './Avatar.css';

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
  const image = hash && mirrorIndex < mirrors.length
    ? getGravatarUrl(mirrors[mirrorIndex], hash, size * 2)
    : undefined;

  return (
    <TAvatar
      className={`app-avatar ${className}`.trim()}
      size={`${size}px`}
      image={image}
      imageProps={{ referrerpolicy: 'no-referrer' }}
      alt={username ?? 'avatar'}
      onError={() => setMirrorIndex((current) => current + 1)}
    >
      {fallbackText}
    </TAvatar>
  );
}
