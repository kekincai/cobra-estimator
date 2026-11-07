import { useEffect, useState } from 'react';

/** 初回描画の少し後に true。棒や帯を 0 から伸ばす CSS トランジションの起点に使う。 */
export function useMounted(delayMs = 80): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  return mounted;
}
