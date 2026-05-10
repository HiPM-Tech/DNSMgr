import { useEffect, useMemo, useState } from 'react';
import { Avatar as TAvatar } from 'tdesign-react';
import { getGravatarHash, getGravatarUrl, getOrderedGravatarMirrors, refreshGravatarMirrorHealth } from '../utils/gravatar';
import './Avatar.css';

interface AvatarProps {
  username?: string | null;
  email?: string | null;
  image?: string | null;
  size?: number;
  className?: string;
  textClassName?: string;
}

export function Avatar({
  username,
  email,
  image: customImage,
  size = 32,
  className = '',
}: AvatarProps) {
  const hash = useMemo(() => getGravatarHash(email), [email]);
  const normalizedCustomImage = customImage?.trim() || '';
  const [mirrors, setMirrors] = useState<string[]>(() => getOrderedGravatarMirrors());
  const [mirrorIndex, setMirrorIndex] = useState(0);
  const [customImageFailed, setCustomImageFailed] = useState(false);

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

  useEffect(() => {
    setCustomImageFailed(false);
  }, [normalizedCustomImage]);

  const fallbackText = username?.[0]?.toUpperCase() ?? '?';
  const gravatarImage = hash && mirrorIndex < mirrors.length
    ? getGravatarUrl(mirrors[mirrorIndex], hash, size * 2)
    : undefined;
  const isUsingCustomImage = Boolean(normalizedCustomImage && !customImageFailed);
  const image = isUsingCustomImage ? normalizedCustomImage : gravatarImage;

  return (
    <TAvatar
      className={`app-avatar ${className}`.trim()}
      size={`${size}px`}
      image={image}
      imageProps={{
        referrerpolicy: 'no-referrer',
        fit: isUsingCustomImage ? 'scale-down' : 'cover',
        position: 'center',
      }}
      alt={username ?? 'avatar'}
      onError={() => {
        if (normalizedCustomImage && !customImageFailed) {
          setCustomImageFailed(true);
          return;
        }
        setMirrorIndex((current) => current + 1);
      }}
    >
      {fallbackText}
    </TAvatar>
  );
}
