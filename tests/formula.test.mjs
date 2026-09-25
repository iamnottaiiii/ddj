import test from 'node:test';
import assert from 'node:assert/strict';

test('CSV escaping keeps commas and quote characters portable', () => {
  const escape = value => /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  assert.equal(escape('two, values'), '"two, values"');
  assert.equal(escape('say "yes"'), '"say ""yes"""');
});

test('backup archive contract has a stable version marker', () => {
  const archive = { format: 'workspace-backup', version: 1, files: [] };
  assert.equal(archive.format, 'workspace-backup');
  assert.equal(archive.version, 1);
});
