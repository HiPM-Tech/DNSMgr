import { useEffect, useRef, useState } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';

type TransitionPhase = 'idle' | 'leaving' | 'enterPrepare' | 'entering';

export function PageTransition() {
  const location = useLocation();
  const outlet = useOutlet();
  const routeKey = `${location.pathname}${location.search}`;
  const currentOutletRef = useRef(outlet);
  const displayedKeyRef = useRef(routeKey);
  const pendingRef = useRef<{ key: string; outlet: ReturnType<typeof useOutlet> } | null>(null);
  const frameRef = useRef<number | null>(null);
  const [displayedOutlet, setDisplayedOutlet] = useState(outlet);
  const [phase, setPhase] = useState<TransitionPhase>('idle');

  currentOutletRef.current = outlet;

  useEffect(() => () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }
  }, []);

  useEffect(() => {
    if (routeKey === displayedKeyRef.current) return;

    pendingRef.current = {
      key: routeKey,
      outlet: currentOutletRef.current,
    };

    if (phase !== 'leaving') {
      setPhase('leaving');
    }
  }, [phase, routeKey]);

  useEffect(() => {
    if (phase !== 'enterPrepare') return;

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = requestAnimationFrame(() => {
        setPhase('entering');
      });
    });
  }, [phase]);

  const handleTransitionEnd = (event: React.TransitionEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target) return;
    if (event.propertyName !== 'opacity') return;

    if (phase === 'leaving') {
      const pending = pendingRef.current;
      if (!pending) {
        setPhase('idle');
        return;
      }

      displayedKeyRef.current = pending.key;
      setDisplayedOutlet(pending.outlet);
      pendingRef.current = null;
      setPhase('enterPrepare');
      return;
    }

    if (phase === 'entering') {
      if (pendingRef.current) {
        setPhase('leaving');
      } else {
        setPhase('idle');
      }
    }
  };

  return (
    <div
      className={`app-route-transition app-route-transition--${phase}`}
      onTransitionEnd={handleTransitionEnd}
    >
      {displayedOutlet}
    </div>
  );
}
