import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
const htmlFiles = async (directory) => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) files.push(...await htmlFiles(url));
    else if (entry.name.endsWith('.html')) files.push(url);
  }
  return files;
};

test('404 recovery page has no old navigation, footer or member content', async () => {
  const html = await readFile(new URL('404.html', dist), 'utf8');
  assert.match(html, /404 \/ PJMI/);
  assert.match(html, /找不到這個頁面/);
  assert.match(html, /name="robots" content="noindex"/);
  assert.match(html, /href="\/"[^>]*>回到主頁/);
  assert.match(html, /href="https:\/\/competitions\.pjmi\.dpdns\.org\/?"/);
  assert.match(html, /href="https:\/\/englishword\.pjmi\.dpdns\.org\/?"/);
  assert.doesNotMatch(html, /site-header|site-footer|社員|這條路徑|SIGNAL LOST|make things move/);
});

test('every published page omits links back into retired sections', async () => {
  for (const file of await htmlFiles(dist)) {
    const html = await readFile(file, 'utf8');
    assert.doesNotMatch(html, /href="\/(?:about|members|activities)(?:\/|\.html|")/, file.pathname);
    assert.doesNotMatch(html, /社員索引|社員資料待補|正在一起做事的人|MEMBERS \/ INDEX/, file.pathname);
  }
});

test('old section bookmarks redirect home instead of rendering legacy pages', async () => {
  for (const path of ['about/index.html', 'members/index.html', 'activities/index.html']) {
    const html = await readFile(new URL(path, dist), 'utf8');
    assert.match(html, /http-equiv="refresh"/i, path);
    assert.match(html, /content="0;url=\//, path);
    assert.doesNotMatch(html, /site-header|site-footer|MEMBERS|ABOUT PJMI|社員|興趣方向|參與過的活動/, path);
  }
});

test('home remains the two-link minimal launcher', async () => {
  const html = await readFile(new URL('index.html', dist), 'utf8');
  assert.match(html, /比賽專區/);
  assert.match(html, /單字練習/);
  assert.doesNotMatch(html, /site-header|site-footer|社員|href="\/join\//);
});
