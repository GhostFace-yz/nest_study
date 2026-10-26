// 把翻译产物同步到 app 的静态数据目录
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../docs/nestjs-docs-20261026.zh.json');
const dest = resolve(here, '../public/data/nestjs-docs.json');

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
const mb = (statSync(dest).size / 1048576).toFixed(2);
console.log(`synced ${src} -> ${dest} (${mb} MB)`);
