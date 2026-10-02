import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

// Run after building both Pages projects. The strict CSP permits only same-origin assets.
for (const project of ['englishword', 'competition-board']) {
  test(`${project}: Sheets admin assets are external and compatible with strict CSP`, async () => {
    const dist = new URL(`../../${project}/dist/`, import.meta.url);
    const html = await readFile(new URL('admin/index.html', dist), 'utf8');
    assert.match(html, /id="sheets-check"/);
    assert.doesNotMatch(html, /<style\b/i, 'styles must not be inlined');
    let sheetsScriptFound = false;
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      assert.equal(match[2].trim(), '', 'scripts must not be inlined');
      const source = match[1].match(/\bsrc="([^"]+)"/)?.[1];
      assert.ok(source?.startsWith('/') && !source.startsWith('//'), 'use same-origin scripts');
      const scriptPath = new URL(source.slice(1).split('?')[0], dist);
      assert.ok((await stat(scriptPath)).isFile());
      if ((await readFile(scriptPath, 'utf8')).includes('sheets-check')) sheetsScriptFound = true;
    }
    assert.ok(sheetsScriptFound, 'the Sheets button handler must be present in an external asset');
    const headers = await readFile(new URL('_headers', dist), 'utf8');
    assert.match(headers, /script-src 'self';/);
    assert.doesNotMatch(headers, /unsafe-inline/);
  });
}
