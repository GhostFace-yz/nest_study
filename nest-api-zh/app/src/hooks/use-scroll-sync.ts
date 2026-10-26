import { useCallback, useEffect, useRef } from 'react';

type Side = 'left' | 'right';

/**
 * 按「块」对齐两栏滚动。
 * 取源栏视口顶部第一个块，把它在目标栏里的位置对齐过来；
 * 这样中英文长度差异不会累积成错位。
 */
export function useScrollSync(enabled: boolean) {
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  const lock = useRef<Side | null>(null);
  const raf = useRef(0);

  const align = useCallback((src: HTMLDivElement, dst: HTMLDivElement) => {
    const top = src.getBoundingClientRect().top;
    const blocks = src.querySelectorAll<HTMLElement>('[data-bid]');
    let anchor: HTMLElement | null = null;
    for (let i = 0; i < blocks.length; i++) {
      const rect = blocks[i].getBoundingClientRect();
      if (rect.bottom > top + 1) {
        anchor = blocks[i];
        break;
      }
    }
    if (!anchor) return;
    const target = dst.querySelector<HTMLElement>(`[data-bid="${anchor.dataset.bid}"]`);
    if (!target) return;
    const delta = target.getBoundingClientRect().top - top;
    if (Math.abs(delta) < 1) return;
    dst.scrollTop += delta;
  }, []);

  const handle = useCallback(
    (side: Side) => {
      if (!enabled) return;
      const src = side === 'left' ? leftRef.current : rightRef.current;
      const dst = side === 'left' ? rightRef.current : leftRef.current;
      if (!src || !dst) return;
      if (lock.current && lock.current !== side) return;
      if (raf.current) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        lock.current = side;
        align(src, dst);
        requestAnimationFrame(() => {
          lock.current = null;
        });
      });
    },
    [enabled, align],
  );

  useEffect(() => {
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  return {
    leftRef,
    rightRef,
    onLeftScroll: () => handle('left'),
    onRightScroll: () => handle('right'),
    /** 外部（如恢复阅读位置）改动左栏滚动后，手动对齐一次右栏 */
    syncNow: () => handle('left'),
  };
}
