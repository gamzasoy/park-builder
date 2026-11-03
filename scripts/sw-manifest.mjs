// 빌드 후 실행: dist/ 의 파일 목록과 내용 해시를 dist/sw.js 에 주입한다.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const dist = new URL('../dist', import.meta.url).pathname;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(relative(dist, p).split('\\').join('/'));
  }
})(dist);

const list = files.filter((f) => f !== 'sw.js').sort();
const hash = createHash('sha1');
for (const f of list) hash.update(f).update(readFileSync(join(dist, f)));
const version = hash.digest('hex').slice(0, 10);

const swPath = join(dist, 'sw.js');
let sw = readFileSync(swPath, 'utf8');
sw = sw.replace(/\/\*VERSION\*\/ '[^']*'/, `/*VERSION*/ '${version}'`).replace(/\/\*FILES\*\/ \[\]/, `/*FILES*/ ${JSON.stringify(list)}`);
writeFileSync(swPath, sw);
console.log(`sw.js: ${list.length} files, version ${version}`);
