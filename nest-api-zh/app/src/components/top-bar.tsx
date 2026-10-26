import { Columns2, Highlighter, Languages, Menu, Moon, PanelsTopLeft, Sun, Link2 } from 'lucide-react';
import type { ReaderMode } from '@/components/reader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Props {
  mode: ReaderMode;
  onModeChange: (mode: ReaderMode) => void;
  sync: boolean;
  onSyncChange: (value: boolean) => void;
  linkSelect: boolean;
  onLinkSelectChange: (value: boolean) => void;
  theme: 'dark' | 'light';
  onThemeToggle: () => void;
  onMenu: () => void;
}

const MODES: { value: ReaderMode; label: string; icon: typeof Columns2 }[] = [
  { value: 'both', label: '对照', icon: Columns2 },
  { value: 'en', label: '英文', icon: PanelsTopLeft },
  { value: 'zh', label: '中文', icon: Languages },
];

export function TopBar({ mode, onModeChange, sync, onSyncChange, linkSelect, onLinkSelectChange, theme, onThemeToggle, onMenu }: Props) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-2.5 backdrop-blur sm:px-3.5">
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onMenu} aria-label="打开目录">
        <Menu />
      </Button>

      <a href="#/" className="flex items-center gap-2 rounded-md px-1 py-0.5">
        <NestMark />
        <span className="hidden text-[13px] font-semibold tracking-tight sm:inline">NestJS 文档</span>
        <Badge variant="default" className="hidden sm:inline-flex">
          中英对照
        </Badge>
      </a>

      <div className="ml-auto flex items-center gap-1.5">
        <div className="flex items-center rounded-md border border-border p-0.5">
          {MODES.map(({ value, label, icon: Icon }) => (
            <Tooltip key={value}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onModeChange(value)}
                  aria-pressed={mode === value}
                  className={cn(
                    'flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium transition-colors sm:px-2',
                    mode === value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <Icon className="size-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>{label === '对照' ? '左右对照' : `只看${label}`}</TooltipContent>
            </Tooltip>
          ))}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={sync ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-pressed={sync}
              disabled={mode !== 'both'}
              onClick={() => onSyncChange(!sync)}
              aria-label="同步滚动"
            >
              <Link2 className={cn('transition-opacity', !sync && 'opacity-40')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{sync ? '同步滚动已开启' : '同步滚动已关闭'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={linkSelect ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-pressed={linkSelect}
              disabled={mode !== 'both'}
              onClick={() => onLinkSelectChange(!linkSelect)}
              aria-label="划词联动高亮"
            >
              <Highlighter className={cn('transition-opacity', !linkSelect && 'opacity-40')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {linkSelect ? '划词联动已开启：选中一侧，另一侧对应句子高亮' : '划词联动已关闭'}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={onThemeToggle} aria-label="切换主题">
              {theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{theme === 'dark' ? '切换到浅色' : '切换到深色'}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}

function NestMark() {
  return (
    <span className="grid size-6 place-items-center rounded-md bg-primary/15 ring-1 ring-primary/25">
      <svg viewBox="0 0 32 32" className="size-4" aria-hidden="true">
        <path d="M16 1.6 29.2 9.3v13.4L16 30.4 2.8 22.7V9.3z" fill="none" stroke="var(--primary)" strokeWidth="1.8" />
        <path d="M11 21.5V11h2.6l5 6.4V11H21v10.5h-2.5l-5.2-6.6v6.6z" fill="var(--primary)" />
      </svg>
    </span>
  );
}
