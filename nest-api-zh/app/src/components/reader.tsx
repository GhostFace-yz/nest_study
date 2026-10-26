import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Link2, Sparkles } from 'lucide-react';
import type { FlatChapter } from '@/lib/types';
import { BlockView } from '@/components/block-view';
import { useScrollSync } from '@/hooks/use-scroll-sync';
import { useLinkedSelection } from '@/hooks/use-linked-selection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, slugifyHeading } from '@/lib/utils';
import type { ReadingProgress } from '@/lib/progress';

export type ReaderMode = 'both' | 'en' | 'zh';

interface Props {
  chapter: FlatChapter;
  prev?: FlatChapter;
  next?: FlatChapter;
  mode: ReaderMode;
  sync: boolean;
  linkSelect: boolean;
  anchor?: string;
  progress?: ReadingProgress;
  onProgress: (slug: string, p: ReadingProgress) => void;
  onNavigate: (slug: string) => void;
}

function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatch(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return match;
}

export function Reader({
  chapter,
  prev,
  next,
  mode,
  sync,
  linkSelect,
  anchor,
  progress,
  onProgress,
  onNavigate,
}: Props) {
  const { leftRef, rightRef, onLeftScroll, onRightScroll, syncNow } = useScrollSync(sync);
  const blocksById = useMemo(() => new Map(chapter.blocks.map((b) => [b.id, b])), [chapter]);
  useLinkedSelection({
    enabled: linkSelect && mode === 'both',
    chapterKey: chapter.slug,
    blocks: blocksById,
    leftRef,
    rightRef,
  });
  const narrow = useMediaQuery('(max-width: 1023px)');
  const [tab, setTab] = useState<'en' | 'zh'>('zh');
  const [copied, setCopied] = useState(false);

  const both = mode === 'both';
  const showEn = mode === 'en' || (both && !narrow);
  const showZh = mode === 'zh' || (both && !narrow);
  const mobileEn = narrow && both && tab === 'en';
  const mobileZh = narrow && both && tab === 'zh';

  const enVisible = showEn || mobileEn;
  const zhVisible = showZh || mobileZh;

  // 进度只在切章时读一次，避免滚动时反复触发恢复
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const lastSave = useRef(0);

  const handleLeftScroll = () => {
    onLeftScroll();
    const el = leftRef.current;
    if (!el) return;
    const now = Date.now();
    if (now - lastSave.current < 700) return;
    lastSave.current = now;

    const paneTop = el.getBoundingClientRect().top;
    let anchorEl: HTMLElement | null = null;
    for (const node of el.querySelectorAll<HTMLElement>('[data-bid]')) {
      if (node.getBoundingClientRect().bottom > paneTop + 1) {
        anchorEl = node;
        break;
      }
    }
    if (!anchorEl?.dataset.bid) return;
    const max = Math.max(1, el.scrollHeight - el.clientHeight);
    onProgress(chapter.slug, {
      bid: anchorEl.dataset.bid,
      delta: anchorEl.getBoundingClientRect().top - paneTop,
      ratio: Math.min(1, Math.max(0, el.scrollTop / max)),
      at: Date.now(),
    });
  };

  // 切章：有 URL 锚点就跳标题，否则恢复上次阅读位置，都没有就回顶部
  useEffect(() => {
    const scrollToAnchor = () => {
      if (!anchor) return;
      const target = chapter.blocks.find(
        (b) => b.type === 'heading' && slugifyHeading(b.md || '') === anchor,
      );
      if (!target) return;
      for (const el of [leftRef.current, rightRef.current]) {
        const node = el?.querySelector<HTMLElement>(`[data-bid="${target.id}"]`);
        if (node && el) el.scrollTop = node.offsetTop - el.offsetTop - 8;
      }
    };

    const restore = () => {
      const el = leftRef.current;
      if (!el) return;
      const saved = progressRef.current;
      if (saved) {
        const target = el.querySelector<HTMLElement>(`[data-bid="${saved.bid}"]`);
        if (target) {
          const paneTop = el.getBoundingClientRect().top;
          el.scrollTop += target.getBoundingClientRect().top - paneTop - saved.delta;
        } else {
          el.scrollTop = saved.ratio * Math.max(1, el.scrollHeight - el.clientHeight);
        }
        syncNow();
        return;
      }
      el.scrollTop = 0;
      if (rightRef.current) rightRef.current.scrollTop = 0;
    };

    lastSave.current = 0;
    requestAnimationFrame(() => {
      if (anchor) {
        restore();
        requestAnimationFrame(scrollToAnchor);
      } else {
        restore();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.slug, anchor]);

  const copyLink = async () => {
    const url = `${location.origin}${location.pathname}${location.hash}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* 剪贴板不可用时忽略 */
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 章节标题栏 */}
      <header className="border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span>{chapter.section}</span>
              <span className="opacity-40">/</span>
              <span>第 {chapter.flatIndex + 1} 章</span>
              {mode !== 'both' && (
                <Badge variant="muted">{mode === 'en' ? '仅英文' : '仅中文'}</Badge>
              )}
            </div>
            <h1 className="truncate text-[17px] font-semibold tracking-tight">{chapter.title}</h1>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {narrow && both && (
              <div className="mr-1 flex rounded-md border border-border p-0.5">
                {(['en', 'zh'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={cn(
                      'rounded px-2 py-1 text-[11px] font-medium transition-colors',
                      tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t === 'en' ? 'EN' : '中文'}
                  </button>
                ))}
              </div>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={copyLink} aria-label="复制当前链接">
                  <Link2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{copied ? '已复制' : '复制链接'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={!prev}
                  onClick={() => prev && onNavigate(prev.slug)}
                  aria-label="上一章"
                >
                  <ChevronLeft />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{prev ? prev.title : '已经是第一章'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={!next}
                  onClick={() => next && onNavigate(next.slug)}
                  aria-label="下一章"
                >
                  <ChevronRight />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{next ? next.title : '已经是最后一章'}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </header>

      {/* 双栏正文 */}
      <div className="flex min-h-0 flex-1">
        {enVisible && (
          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            <PaneBar label="English" hint="官方原文" />
            <div
              ref={leftRef}
              data-pane="en"
              onScroll={handleLeftScroll}
              className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8"
            >
              <article className="mx-auto max-w-3xl">
                {chapter.blocks.map((block) => (
                  <BlockView key={block.id} block={block} side="en" />
                ))}
              </article>
              <ChapterNav prev={prev} next={next} onNavigate={onNavigate} />
            </div>
          </section>
        )}

        {enVisible && zhVisible && <div className="w-px shrink-0 bg-border" />}

        {zhVisible && (
          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            <PaneBar label="中文" hint="机器翻译 · 讯飞小牛" translated />
            <div
              ref={rightRef}
              data-pane="zh"
              onScroll={onRightScroll}
              className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8"
            >
              <article className="mx-auto max-w-3xl">
                {chapter.blocks.map((block) => (
                  <BlockView key={block.id} block={block} side="zh" />
                ))}
              </article>
              <ChapterNav prev={prev} next={next} onNavigate={onNavigate} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function PaneBar({ label, hint, translated }: { label: string; hint: string; translated?: boolean }) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border bg-background/70 px-4 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground backdrop-blur sm:px-6 lg:px-8">
      <span>{label}</span>
      <span className="normal-case tracking-normal opacity-70">· {hint}</span>
      {translated && <Sparkles className="size-3 text-primary/70" />}
    </div>
  );
}

function ChapterNav({
  prev,
  next,
  onNavigate,
}: {
  prev?: FlatChapter;
  next?: FlatChapter;
  onNavigate: (slug: string) => void;
}) {
  return (
    <nav className="mt-10 grid gap-3 border-t border-border pt-5 sm:grid-cols-2">
      {prev ? (
        <button
          onClick={() => onNavigate(prev.slug)}
          className="group flex flex-col items-start gap-0.5 rounded-lg border border-border px-3.5 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent/60"
        >
          <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">上一章</span>
          <span className="text-[13px] font-medium group-hover:text-primary">{prev.title}</span>
        </button>
      ) : (
        <span />
      )}
      {next && (
        <button
          onClick={() => onNavigate(next.slug)}
          className="group flex flex-col items-end gap-0.5 rounded-lg border border-border px-3.5 py-2.5 text-right transition-colors hover:border-primary/40 hover:bg-accent/60 sm:col-start-2"
        >
          <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">下一章</span>
          <span className="text-[13px] font-medium group-hover:text-primary">{next.title}</span>
        </button>
      )}
    </nav>
  );
}
