import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCsv } from '../src/validate.mjs';

const corpus = new URL('../rust/tests/fixtures/csv-v1.tsv', import.meta.url);

function decodeHex(hex) {
  assert.match(hex, /^(?:[0-9a-f]{2})*$/);
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(hex, 'hex'));
}

test('JavaScript matches all independently specified shared conformance v1 reports', () => {
  const names = new Set();
  for (const line of readFileSync(corpus, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const columns = line.split('\t');
    assert.equal(columns.length, 6);
    const [name, inputHex, delimiterHex, header, maxErrors, expected] = columns;
    assert.equal(names.has(name), false, `Duplicate corpus case ${name}`);
    names.add(name);
    assert.match(header, /^(?:true|false)$/);
    assert.match(maxErrors, /^[1-9][0-9]*$/);
    const report = validateCsv(decodeHex(inputHex), {
      delimiter: decodeHex(delimiterHex), header: header === 'true', maxErrors: Number(maxErrors),
    });
    assert.deepEqual(report, JSON.parse(expected), name);
  }
  assert.equal(names.size, 22);
});
