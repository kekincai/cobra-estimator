import { useEffect, useRef, useState } from 'react';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 数字ロール（rAF・cubic ease-out）。reduced-motion では即時。 */
export function useCountUp(target: number, durationMs = 900): number {
  const [shown, setShown] = useState(reduced() ? target : 0);
  const from = useRef(shown);
  useEffect(() => {
    if (reduced()) {
      setShown(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / durationMs);
      const v = origin + (target - origin) * (1 - Math.pow(1 - k, 3));
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return shown;
}
