import type { ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import type { Block } from '@/lib/types';
import { renderCodeBlock, renderInline, renderMarkdown } from '@/lib/markdown';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const NEUTRAL_TYPES = new Set(['code', 'image', 'hr', 'html']);

interface Props {
  block: Block;
  side: 'en' | 'zh';
}

/** 翻译缺失时右侧回落显示英文，并标出来 */
export function BlockView({ block, side }: Props) {
  const isNeutral = NEUTRAL_TYPES.has(block.type);
  const translated = side === 'zh' && !isNeutral;
  const fallback = translated && !block.zh;
  const md = translated ? block.zh || block.md || '' : block.md || '';

  let body: ReactNode = null;

  switch (block.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(2, block.level ?? 2));
      const Tag = `h${level}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      body = (
        <Tag
          className={cn(
            'font-semibold tracking-tight text-balance',
            level === 2 && 'text-[1.35rem]',
            level === 3 && 'text-[1.15rem]',
            level === 4 && 'text-[1.02rem]',
            level >= 5 && 'text-[0.95rem] text-muted-foreground',
          )}
          dangerouslySetInnerHTML={{ __html: renderInline(md) }}
        />
      );
      break;
    }
    case 'code':
      body = <div className="md" dangerouslySetInnerHTML={{ __html: renderCodeBlock(block.code ?? '', block.lang) }} />;
      break;
    case 'callout': {
      const warn = block.kind === 'warning';
      body = (
        <div
          className={cn(
            'rounded-lg border px-3.5 py-3 text-[14px]',
            warn
              ? 'border-amber-500/25 bg-amber-500/[0.07]'
              : 'border-sky-500/25 bg-sky-500/[0.07]',
          )}
        >
          <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold">
            {warn ? <AlertTriangle className="size-3.5 text-amber-500" /> : <Info className="size-3.5 text-sky-500" />}
            <span className={warn ? 'text-amber-600 dark:text-amber-400' : 'text-sky-600 dark:text-sky-400'}>
              {block.title || (warn ? 'Warning' : 'Info')}
            </span>
          </div>
          <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(md) }} />
        </div>
      );
      break;
    }
    case 'image':
      body = (
        <figure className="my-4">
          <img
            src={block.src}
            alt={block.alt || ''}
            loading="lazy"
            className="mx-auto max-w-full rounded-lg border border-border"
          />
        </figure>
      );
      break;
    case 'details':
      body = (
        <details className="md rounded-lg border border-border bg-muted/25 px-3.5 py-2.5">
          <summary className="cursor-pointer text-[13.5px] font-semibold">{block.title}</summary>
          <div className="mt-2" dangerouslySetInnerHTML={{ __html: renderMarkdown(md) }} />
        </details>
      );
      break;
    case 'hr':
      body = <hr className="my-8 border-border" />;
      break;
    default:
      body = <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(md) }} />;
  }

  return (
    <div data-bid={block.id} id={`b-${block.id}`} className="scroll-mt-6">
      {fallback && (
        <Badge variant="outline" className="mb-1">
          未翻译
        </Badge>
      )}
      {body}
    </div>
  );
}
