import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';

type TransitionPhase = 'idle' | 'leaving' | 'enterPrepare' | 'entering';

interface PendingRoute {
  key: string;
  outlet: ReturnType<typeof useOutlet>;
}

export function PageTransition() {
  const location = useLocation();
  const outlet = useOutlet();
  const routeKey = `${location.pathname}${location.search}`;
  const currentOutletRef = useRef(outlet);
  const displayedKeyRef = useRef(routeKey);
  const pendingQueueRef = useRef<PendingRoute[]>([]);
  const frameRef = useRef<number | null>(null);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [displayedOutlet, setDisplayedOutlet] = useState(outlet);
  const [phase, setPhase] = useState<TransitionPhase>('idle');

  currentOutletRef.current = outlet;

  const handleTransitionComplete = useCallback(() => {
    const pending = pendingQueueRef.current.shift();
    if (!pending) {
      setPhase('idle');
      return;
    }

    displayedKeyRef.current = pending.key;
    setDisplayedOutlet(pending.outlet);
    setPhase('enterPrepare');
  }, []);

  // 清理函数
  const clearAllTimers = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (transitionTimeoutRef.current !== null) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    clearAllTimers();
  }, [clearAllTimers]);

  // 处理路由变化
  useEffect(() => {
    if (routeKey === displayedKeyRef.current) return;

    // 添加到待处理队列
    const newPending: PendingRoute = {
      key: routeKey,
      outlet: currentOutletRef.current,
    };

    // 如果队列中已有相同 key，先移除旧的
    pendingQueueRef.current = pendingQueueRef.current.filter(p => p.key !== routeKey);
    pendingQueueRef.current.push(newPending);

    // 如果不在 leaving 或 entering 阶段，开始过渡
    if (phase !== 'leaving' && phase !== 'entering') {
      setPhase('leaving');
    } else if (phase === 'entering') {
      // 如果正在进入动画，直接替换为新的路由
      console.log('[PageTransition] Rapid navigation detected, replacing current route');
      displayedKeyRef.current = routeKey;
      setDisplayedOutlet(currentOutletRef.current);
      pendingQueueRef.current = []; // 清空队列
      setPhase('idle');
    }
  }, [phase, routeKey]);

  // 处理 enterPrepare 阶段
  useEffect(() => {
    if (phase !== 'enterPrepare') return;

    clearAllTimers();

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = requestAnimationFrame(() => {
        setPhase('entering');
      });
    });

    // 安全超时：如果动画卡住，强制进入下一阶段（增加到300ms）
    transitionTimeoutRef.current = setTimeout(() => {
      console.warn('[PageTransition] Enter animation timeout, forcing phase change');
      setPhase('entering');
    }, 300);
  }, [phase, clearAllTimers]);

  // 安全超时：leaving 阶段如果卡住，强制完成
  useEffect(() => {
    if (phase === 'leaving') {
      transitionTimeoutRef.current = setTimeout(() => {
        console.warn('[PageTransition] Leave animation timeout, forcing completion');
        handleTransitionComplete();
      }, 600); // 增加到600ms以匹配CSS过渡时间
    }
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, [phase, handleTransitionComplete]);

  const handleTransitionEnd = (event: React.TransitionEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target) return;
    if (event.propertyName !== 'opacity') return;

    if (phase === 'leaving') {
      handleTransitionComplete();
      return;
    }

    if (phase === 'entering') {
      // 检查是否还有更多待处理的路由
      if (pendingQueueRef.current.length > 0) {
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
