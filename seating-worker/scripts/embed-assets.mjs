import { readFile, writeFile } from 'node:fs/promises';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../dist/seating.js', import.meta.url), 'utf8');
const moduleSource = [
  `export const seatingHtml = ${JSON.stringify(html)};`,
  `export const seatingJavaScript = ${JSON.stringify(script)};`,
  '',
].join('\n');

await writeFile(new URL('../src/generated-assets.ts', import.meta.url), moduleSource);
await writeFile(new URL('../dist/.assetsignore', import.meta.url), '/index.html\n/seating.js\n');
