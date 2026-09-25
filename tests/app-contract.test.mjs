import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('desktop package is configured for a portable executable and installer', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.deepEqual(pkg.build.win.target, ['nsis', 'portable']);
  assert.match(pkg.scripts['package:win'], /electron-builder --win nsis portable/);
  assert.match(pkg.build.nsis.artifactName, /Setup/);
  assert.match(pkg.build.portable.artifactName, /Portable/);
});

test('renderer keeps the model local and does not include an external AI API', () => {
  const source = readFileSync('src/main.ts', 'utf8');
  assert.match(source, /Xenova\/LaMini-Flan-T5-77M/);
  assert.match(source, /env\.useBrowserCache = true/);
  assert.doesNotMatch(source, /openai|anthropic|api[_-]?key/i);
});
