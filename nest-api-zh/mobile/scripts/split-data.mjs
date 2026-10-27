// 把整份文档拆成「目录索引 + 每章一个 JSON」，手机上按需 require
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../docs/nestjs-docs-20261026.zh.json');
const outDir = resolve(here, '../assets/data');
const chapterDir = resolve(outDir, 'chapters');

const ds = JSON.parse(readFileSync(src, 'utf8'));

rmSync(chapterDir, { recursive: true, force: true });
mkdirSync(chapterDir, { recursive: true });

const index = {
  meta: ds.meta,
  sections: ds.sections.map((s) => ({
    id: s.id,
    title: s.title,
    order: s.order,
    chapters: s.chapters.map((c) => ({
      slug: c.slug,
      title: c.title,
      path: c.path,
      section: s.title,
      order: c.order,
      summary: c.summary,
      blockCount: c.blocks.length,
    })),
  })),
};
writeFileSync(resolve(outDir, 'index.json'), JSON.stringify(index));

const loaders = [];
let total = 0;
for (const s of ds.sections) {
  for (const c of s.chapters) {
    const payload = {
      slug: c.slug,
      title: c.title,
      path: c.path,
      url: c.url,
      section: s.title,
      order: c.order,
      blocks: c.blocks,
    };
    writeFileSync(resolve(chapterDir, `${c.slug}.json`), JSON.stringify(payload));
    loaders.push(`  '${c.slug}': () => require('./chapters/${c.slug}.json'),`);
    total += 1;
  }
}

writeFileSync(
  resolve(outDir, 'chapters.ts'),
  `// 由 scripts/split-data.mjs 生成，勿手改\nexport const chapterLoaders: Record<string, () => unknown> = {\n${loaders.join('\n')}\n};\n`,
);

console.log(`chapters: ${total}  index: ${(JSON.stringify(index).length / 1024).toFixed(1)} KB`);
