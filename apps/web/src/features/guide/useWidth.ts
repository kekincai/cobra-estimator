// 要素の実幅を測る（SVG の viewBox を実寸に合わせ、狭い画面でも文字を縮めないため）
import { useLayoutEffect, useRef, useState } from 'react';

export function useWidth<T extends HTMLElement>(fallback = 520) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(Math.max(200, Math.round(el.getBoundingClientRect().width)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
