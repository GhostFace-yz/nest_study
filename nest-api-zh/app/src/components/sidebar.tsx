import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, CornerDownRight, Search, X } from 'lucide-react';
import type { Dataset, FlatChapter } from '@/lib/types';
import { search, type SearchHit } from '@/lib/data';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ProgressMap } from '@/lib/progress';

interface Props {
  dataset: Dataset;
  flat: FlatChapter[];
  currentSlug: string;
  query: string;
  onQueryChange: (value: string) => void;
  onNavigate: (slug: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  progress: ProgressMap;
  continueTarget: { slug: string; title: string; ratio: number } | null;
  onContinue: () => void;
  onClose?: () => void;
}

export function Sidebar({
  dataset,
  flat,
  currentSlug,
  query,
  onQueryChange,
  onNavigate,
  searchRef,
  progress,
  continueTarget,
  onContinue,
  onClose,
}: Props) {
  const current = flat.find((c) => c.slug === currentSlug);
  const currentSection = current?.section;
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(currentSection ? [currentSection] : [dataset.sections[0]?.title]),
  );

  useEffect(() => {
    if (!currentSection) return;
    setOpenSections((prev) => (prev.has(currentSection) ? prev : new Set(prev).add(currentSection)));
  }, [currentSection]);

  const hits = useMemo(() => (query.trim() ? search(flat, query) : []), [flat, query]);
  const toggleSection = (title: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-card/30">
      <div className="shrink-0 border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                onQueryChange('');
                e.currentTarget.blur();
              }
              if (e.key === 'Enter' && hits[0]) {
                onNavigate(hits[0].chapter.slug);
                onClose?.();
              }
            }}
            placeholder="搜索章节或正文…"
            spellCheck={false}
            aria-label="搜索章节"
            className="h-8 border-border/70 bg-background/60 pl-8 pr-8 text-[12.5px]"
          />
          {query ? (
            <button
              onClick={() => onQueryChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="清空搜索"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border/70 px-1 text-[10px] text-muted-foreground">
              /
            </kbd>
          )}
        </div>
      </div>

      {continueTarget && (
        <div className="shrink-0 px-2 pt-2">
          <button
            onClick={() => {
              onContinue();
              onClose?.();
            }}
            className="w-full rounded-lg border border-primary/45 bg-primary/10 px-2.5 py-2 text-left transition-colors hover:bg-primary/15"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] tracking-wide text-muted-foreground">继续阅读</span>
              <span className="text-[10px] tabular-nums text-primary">
                {Math.round(continueTarget.ratio * 100)}%
              </span>
            </div>
            <div className="mt-0.5 truncate text-[13px] font-medium text-foreground">
              {continueTarget.title}
            </div>
          </button>
        </div>
      )}

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {query.trim() ? (
          <SearchResults hits={hits} query={query} onNavigate={(s) => { onNavigate(s); onClose?.(); }} />
        ) : (
          <nav aria-label="章节目录">
            {dataset.sections.map((section) => {
              const open = openSections.has(section.title);
              const activeHere = section.title === currentSection;
              return (
                <Collapsible key={section.id} open={open} onOpenChange={() => toggleSection(section.title)}>
                  <CollapsibleTrigger
                    className={cn(
                      'group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors',
                      activeHere ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} />
                    <span className="truncate">{section.title}</span>
                    <span className="ml-auto text-[10px] font-normal tabular-nums opacity-50">
                      {section.chapters.length}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ul className="mb-1 mt-0.5 space-y-px border-l border-border/60 pl-1.5">
                      {section.chapters.map((chapter) => {
                        const active = chapter.slug === currentSlug;
                        return (
                          <li key={chapter.slug}>
                            <button
                              onClick={() => {
                                onNavigate(chapter.slug);
                                onClose?.();
                              }}
                              className={cn(
                                'flex w-full items-center gap-2 rounded-md py-1.5 pl-2 pr-2 text-left text-[12.5px] transition-colors',
                                active
                                  ? 'bg-primary/10 font-medium text-primary'
                                  : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
                              )}
                            >
                              <span className="w-4 shrink-0 text-right text-[10px] tabular-nums opacity-50">
                                {chapter.order}
                              </span>
                              <span className="truncate">{chapter.title}</span>
                              {progress[chapter.slug]?.ratio ? (
                                <span className="ml-auto shrink-0 text-[10px] tabular-nums opacity-70">
                                  {Math.round(progress[chapter.slug].ratio * 100)}%
                                </span>
                              ) : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </nav>
        )}
      </div>

      <div className="shrink-0 border-t border-border px-3 py-2 text-[10.5px] leading-relaxed text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>
            {dataset.meta.chapters} 章 · {dataset.meta.sections} 个分区
          </span>
          <Badge variant="outline">v1</Badge>
        </div>
        <p className="mt-0.5 opacity-70">译文由讯飞小牛机器翻译，仅供学习参考</p>
      </div>
    </div>
  );
}

function SearchResults({
  hits,
  query,
  onNavigate,
}: {
  hits: SearchHit[];
  query: string;
  onNavigate: (slug: string) => void;
}) {
  if (!hits.length) {
    return (
      <p className="px-2 py-6 text-center text-[12px] text-muted-foreground">
        没有匹配「{query}」的章节或内容
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="px-2 text-[10.5px] text-muted-foreground">找到 {hits.length} 处结果</p>
      {hits.map((hit, i) => (
        <button
          key={`${hit.chapter.slug}-${i}`}
          onClick={() => onNavigate(hit.chapter.slug)}
          className="block w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/70"
        >
          <div className="flex items-center gap-1.5">
            <CornerDownRight className="size-3 shrink-0 text-muted-foreground/60" />
            <span className="truncate text-[12.5px] font-medium">{hit.chapter.title}</span>
            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{hit.chapter.section}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 pl-[18px] text-[11px] leading-relaxed text-muted-foreground">
            <Highlight text={hit.snippet} query={query} />
          </p>
        </button>
      ))}
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase();
  if (!needle) return <>{text}</>;
  return (
    <>
      {text.split(new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, i) =>
        part.toLowerCase() === needle ? (
          <mark key={i} className="rounded-sm bg-primary/20 px-0.5 text-primary">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
