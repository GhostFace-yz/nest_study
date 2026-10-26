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
  kind?: 'info' | 'warning' | string;
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
  summary: string;
  order: number;
  blocks: Block[];
}

export interface Section {
  id: string;
  title: string;
  order: number;
  chapters: Chapter[];
}

export interface Dataset {
  meta: {
    source: string;
    generatedAt: string;
    sections: number;
    chapters: number;
    blocks: number;
    translation?: {
      engine?: string;
      blocksTranslated?: number;
      translatedAt?: string;
    };
  };
  sections: Section[];
}

/** 扁平化后的一章，附带在全书中的序号 */
export interface FlatChapter extends Chapter {
  flatIndex: number;
}
