export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'table'
  | 'code'
  | 'callout'
  | 'image'
  | 'details'
  | 'html'
  | 'hr';

export interface Block {
  id: string;
  type: BlockType;
  md?: string;
  text?: string;
  zh?: string;
  code?: string;
  lang?: string;
  level?: number;
  kind?: string;
  title?: string;
  src?: string;
  alt?: string;
}

export interface Chapter {
  slug: string;
  title: string;
  path: string;
  url: string;
  section: string;
  order: number;
  blocks: Block[];
}

export interface ChapterMeta {
  slug: string;
  title: string;
  path: string;
  section: string;
  order: number;
  summary: string;
  blockCount: number;
}

export interface SectionMeta {
  id: string;
  title: string;
  order: number;
  chapters: ChapterMeta[];
}

export interface DatasetIndex {
  meta: {
    source: string;
    generatedAt: string;
    sections: number;
    chapters: number;
    blocks: number;
    translation?: { engine?: string; blocksTranslated?: number };
  };
  sections: SectionMeta[];
}

export type ViewMode = 'focus' | 'both' | 'zh';
