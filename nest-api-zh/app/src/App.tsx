import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { TopBar } from '@/components/top-bar';
import { Sidebar } from '@/components/sidebar';
import { Reader, type ReaderMode } from '@/components/reader';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { chapterHash, findChapter, flattenChapters, loadDataset, parseHash, resolveChapter } from '@/lib/data';
import { useTheme } from '@/hooks/use-theme';
import { lastRead, loadProgress, persistProgress, type ProgressMap } from '@/lib/progress';
import type { Dataset, FlatChapter } from '@/lib/types';

const LS = {
  mode: 'nest-docs-mode',
  sync: 'nest-docs-sync',
  linkSelect: 'nest-docs-linkselect',
  last: 'nest-docs-last',
};

function readMode(): ReaderMode {
  const v = localStorage.getItem(LS.mode);
  return v === 'en' || v === 'zh' || v === 'both' ? v : 'both';
}

function readSync() {
  return localStorage.getItem(LS.sync) !== '0';
}

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [flat, setFlat] = useState<FlatChapter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const initial = parseHash(location.hash);
  const [slug, setSlug] = useState(initial.slug);
  const [anchor, setAnchor] = useState(initial.anchor);
  const [mode, setMode] = useState<ReaderMode>(readMode);
  const [sync, setSync] = useState<boolean>(readSync);
  const [linkSelect, setLinkSelect] = useState<boolean>(() => localStorage.getItem(LS.linkSelect) !== '0');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [progress, setProgress] = useState<ProgressMap>(() => loadProgress());

  const searchRef = useRef<HTMLInputElement>(null);
  const { theme, toggle: toggleTheme } = useTheme();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    loadDataset()
      .then((data) => {
        const chapters = flattenChapters(data);
        setDataset(data);
        setFlat(chapters);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, []);

  useEffect(load, [load]);

  /* ---------- 路由 ---------- */
  useEffect(() => {
    const onHash = () => {
      const next = parseHash(location.hash);
      setSlug(next.slug);
      setAnchor(next.anchor);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!flat.length) return;
    const { slug: hashSlug } = parseHash(location.hash);
    if (!hashSlug || !findChapter(flat, hashSlug)) {
      const saved = localStorage.getItem(LS.last);
      const target = (saved && findChapter(flat, saved)) || flat[0];
      history.replaceState(null, '', chapterHash(target));
      setSlug(target.slug);
      setAnchor('');
    }
  }, [flat]);

  const current = useMemo(() => resolveChapter(flat, slug) ?? flat[0], [flat, slug]);
  const prev = current ? flat[current.flatIndex - 1] : undefined;
  const next = current ? flat[current.flatIndex + 1] : undefined;

  useEffect(() => {
    if (!current) return;
    document.title = `${current.title} · NestJS 文档`;
    localStorage.setItem(LS.last, current.slug);
  }, [current]);

  const navigate = useCallback((nextSlug: string) => {
    const target = resolveChapter(flat, nextSlug);
    if (!target) return;
    setSidebarOpen(false);
    if (parseHash(location.hash).slug === target.slug) {
      setSlug(target.slug);
      setAnchor('');
      return;
    }
    location.hash = chapterHash(target);
  }, [flat]);

  useEffect(() => {
    localStorage.setItem(LS.mode, mode);
  }, [mode]);
  useEffect(() => {
    localStorage.setItem(LS.sync, sync ? '1' : '0');
  }, [sync]);
  useEffect(() => {
    localStorage.setItem(LS.linkSelect, linkSelect ? '1' : '0');
  }, [linkSelect]);

  // 阅读进度：内存即时更新，停手 800ms 后落盘，关页面前再存一次
  useEffect(() => {
    const id = setTimeout(() => persistProgress(progress), 800);
    return () => clearTimeout(id);
  }, [progress]);

  useEffect(() => {
    const flush = () => persistProgress(progress);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    return () => {
      window.removeEventListener('pagehide', flush);
    };
  }, [progress]);

  const onProgress = useCallback((slug: string, p: ProgressMap[string]) => {
    setProgress((prev) => ({ ...prev, [slug]: p }));
  }, []);

  /* ---------- 快捷键 ---------- */
  useEffect(() => {
    const focusSearch = () => {
      if (window.matchMedia('(min-width: 1024px)').matches) {
        searchRef.current?.focus();
      } else {
        setSidebarOpen(true);
        setTimeout(() => searchRef.current?.focus(), 120);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        focusSearch();
        return;
      }
      if (typing) return;
      if (e.altKey && e.key === 'ArrowLeft' && prev) {
        e.preventDefault();
        navigate(prev.slug);
      }
      if (e.altKey && e.key === 'ArrowRight' && next) {
        e.preventDefault();
        navigate(next.slug);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, prev, next]);

  const last = useMemo(() => lastRead(progress), [progress]);
  const continueTarget = useMemo(() => {
    if (!last) return null;
    const meta = flat.find((c) => c.slug === last.slug);
    if (!meta) return null;
    return { slug: last.slug, title: meta.title, ratio: last.p.ratio };
  }, [last, flat]);

  const sidebar = dataset ? (
    <Sidebar
      dataset={dataset}
      flat={flat}
      currentSlug={current?.slug ?? ''}
      query={query}
      onQueryChange={setQuery}
      onNavigate={navigate}
      searchRef={searchRef}
      progress={progress}
      continueTarget={continueTarget}
      onContinue={() => continueTarget && navigate(continueTarget.slug)}
      onClose={() => setSidebarOpen(false)}
    />
  ) : null;

  return (
    <TooltipProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
        <TopBar
          mode={mode}
          onModeChange={setMode}
          sync={sync}
          onSyncChange={setSync}
          linkSelect={linkSelect}
          onLinkSelectChange={setLinkSelect}
          theme={theme}
          onThemeToggle={toggleTheme}
          onMenu={() => setSidebarOpen(true)}
        />

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-[284px] shrink-0 border-r border-border lg:block">{sidebar}</aside>

          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            {loading && <LoadingState />}
            {!loading && error && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <AlertTriangle className="size-6 text-amber-500" />
                <p className="text-sm font-medium">文档加载失败</p>
                <p className="max-w-md text-xs text-muted-foreground">{error}</p>
                <Button size="sm" variant="outline" onClick={load}>
                  <RefreshCw /> 重试
                </Button>
              </div>
            )}
            {!loading && !error && current && (
              <Reader
                chapter={current}
                prev={prev}
                next={next}
                mode={mode}
                sync={sync}
                linkSelect={linkSelect}
                anchor={anchor}
                progress={progress[current?.slug ?? '']}
                onProgress={onProgress}
                onNavigate={navigate}
              />
            )}
          </main>
        </div>

        <Dialog open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <DialogContent aria-describedby={undefined} className="flex flex-col p-0">
            <div className="flex h-12 shrink-0 items-center border-b border-border px-4">
              <DialogTitle className="text-[13px] font-semibold">章节目录</DialogTitle>
            </div>
            <div className="min-h-0 flex-1">{sidebar}</div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex-1 space-y-3 border-r border-border p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-3 w-10/12" />
        <Skeleton className="h-3 w-9/12" />
      </div>
      <div className="hidden flex-1 space-y-3 p-6 lg:block">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-10/12" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    </div>
  );
}
