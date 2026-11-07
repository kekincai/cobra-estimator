import { useEffect, useState } from 'react';

/**
 * マウント直後に false → true になるフラグ。
 * 棒・リング・帯を 0 から CSS transition で伸ばすのに使う（reduced-motion は index.css 側で transition を無効化済み）。
 */
export function useMounted(delayMs = 80): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  return mounted;
}
