import { useEffect } from 'react';
import type { Block } from '@/lib/types';
import { mapSelectionToOther } from '@/lib/selection-link';

const HIGHLIGHT = 'nest-linked';

type HighlightRegistry = {
  set(name: string, value: unknown): void;
  delete(name: string): void;
};
type HighlightCtor = new (...ranges: Range[]) => unknown;

const registry = (CSS as unknown as { highlights?: HighlightRegistry }).highlights;
const HighlightImpl = (globalThis as unknown as { Highlight?: HighlightCtor }).Highlight;

/**
 * 划词联动：在左栏选中英文，右栏对应句子高亮；反之亦然。
 * 用 CSS Custom Highlight API，不修改 DOM，不会触发 React 重渲染。
 */
export function useLinkedSelection(opts: {
  enabled: boolean;
  chapterKey: string;
  blocks: Map<string, Block>;
  leftRef: React.RefObject<HTMLDivElement | null>;
  rightRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { enabled, chapterKey, blocks, leftRef, rightRef } = opts;

  useEffect(() => {
    if (!registry || !HighlightImpl) return;
    if (!enabled) {
      registry.delete(HIGHLIGHT);
      return;
    }

    let raf = 0;
    const clear = () => registry.delete(HIGHLIGHT);

    const apply = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return clear();
      const range = sel.getRangeAt(0);
      if (range.collapsed) return clear();

      const startNode = range.startContainer;
      const startEl =
        startNode.nodeType === Node.ELEMENT_NODE ? (startNode as Element) : startNode.parentElement;
      const blockEl = startEl?.closest<HTMLElement>('[data-bid]');
      if (!blockEl) return clear();
      const paneEl = blockEl.closest<HTMLElement>('[data-pane]');
      if (!paneEl) return clear();

      const side = paneEl.dataset.pane === 'zh' ? 'zh' : 'en';
      const otherRoot = side === 'en' ? rightRef.current : leftRef.current;
      const otherBlock = otherRoot?.querySelector<HTMLElement>(`[data-bid="${blockEl.dataset.bid}"]`);
      if (!otherBlock) return clear();

      const block = blockEl.dataset.bid ? blocks.get(blockEl.dataset.bid) : undefined;
      const childSelector =
        block?.type === 'list' ? 'li' : block?.type === 'table' ? 'td, th' : undefined;

      const ranges = mapSelectionToOther(blockEl, otherBlock, range, {
        side,
        blockType: block?.type,
        childSelector,
      });
      if (!ranges || !ranges.length) return clear();
      registry.set(HIGHLIGHT, new HighlightImpl(...ranges));
    };

    const onSelectionChange = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    };

    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      cancelAnimationFrame(raf);
      clear();
    };
  }, [enabled, chapterKey, blocks, leftRef, rightRef]);
}
