import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCsv } from '../src/validate.mjs';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const command = (args, input) => spawnSync(process.execPath, [cli, ...args], { input, encoding: 'utf8' });

test('quoted commas, escaped quotes, CRLF and embedded line breaks form exact records', () => {
  const result = validateCsv('\ufeffname,note\r\nAda,"one,two"\r\nBea,"says ""hi""\r\non two lines"\r\n');
  assert.deepEqual(result, { valid: true, records: 3, dataRecords: 2, columns: 2, header: true,
    diagnostics: [], diagnosticsTruncated: false, parseComplete: true });
});

test('reports width mismatch using record and physical source line independently', () => {
  const result = validateCsv('id,note\n1,"two\nlines"\n2\n3,a,b');
  assert.deepEqual(result.diagnostics, [
    { code: 'ROW_WIDTH', message: 'Expected 2 fields; found 1', record: 3, field: 2, line: 4, column: 1 },
    { code: 'ROW_WIDTH', message: 'Expected 2 fields; found 3', record: 4, field: 3, line: 5, column: 1 },
  ]);
});

test('distinguishes duplicate and empty exact header names', () => {
  const result = validateCsv('id,,id\n1,a,2');
  assert.deepEqual(result.diagnostics.map(({ code, field, line, column }) => ({ code, field, line, column })), [
    { code: 'EMPTY_HEADER', field: 2, line: 1, column: 4 },
    { code: 'DUPLICATE_HEADER', field: 3, line: 1, column: 5 },
  ]);
  assert.equal(validateCsv('name,Name\n1,2').valid, true);
  assert.equal(validateCsv('id,id\n1,2', { header: false }).valid, true);
});

test('strict quoting rejects unterminated, embedded and postquote text', () => {
  const cases = [
    ['a,b\n1,"never closes', 'UNCLOSED_QUOTE', 2, 2, 2, 3],
    ['a,b\n1,ab"cd', 'QUOTE_IN_UNQUOTED_FIELD', 2, 2, 2, 5],
    ['a,b\n1,"x" y', 'TEXT_AFTER_QUOTE', 2, 2, 2, 6],
  ];
  for (const [csv, code, record, field, line, column] of cases) {
    const report = validateCsv(csv);
    const issue = report.diagnostics[0];
    assert.deepEqual({ code: issue.code, record: issue.record, field: issue.field, line: issue.line, column: issue.column },
      { code, record, field, line, column });
    assert.equal(report.parseComplete, false);
  }
});

test('terminal delimiters preserve empty fields and terminal line endings add no record', () => {
  assert.equal(validateCsv('a,b,\n1,2,\n', { header: false }).columns, 3);
  assert.equal(validateCsv('a,b\r\n1,2\r\n').records, 2);
  assert.equal(validateCsv('a,b\r1,2\r').records, 2);
  assert.equal(validateCsv('"a","b"\n"",""').valid, true);
});

test('empty input, NUL and bounded diagnostics remain invalid', () => {
  assert.equal(validateCsv('').diagnostics[0].code, 'EMPTY_INPUT');
  assert.equal(validateCsv('\ufeff').diagnostics[0].code, 'EMPTY_INPUT');
  assert.equal(validateCsv('a\n\0').diagnostics[0].code, 'NUL_CHARACTER');
  const result = validateCsv('a,b\n1\n2\n3', { maxErrors: 1 });
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnosticsTruncated, true);
});

test('delimiter options support TSV and reject ambiguous or malformed values', () => {
  assert.equal(validateCsv('a\tb\n1\t2', { delimiter: '\t' }).columns, 2);
  for (const delimiter of ['', 'ab', '"', '\n', '\r', '\0', '🦆', undefined]) {
    if (delimiter === undefined) continue;
    assert.throws(() => validateCsv('a', { delimiter }), TypeError);
  }
  assert.throws(() => validateCsv('a', { maxErrors: 0 }), TypeError);
});

test('stdin JSON reports valid, invalid, encoding and usage with meaningful exit codes', () => {
  let result = command(['--json'], 'a,b\n1,2');
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).valid, true);
  result = command(['--json', '-'], 'a,b\n1');
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).diagnostics[0].code, 'ROW_WIDTH');
  result = command(['--json'], Buffer.from([0xff]));
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).error.code, 'INPUT_ENCODING');
  result = command(['--json', '--delimiter']);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).error.code, 'USAGE');
  result = command(['--json', '--wat']);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).error.code, 'USAGE');
});

test('file mode, tab option, no-header and argument boundary work', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'csv-validation-'));
  try {
    const file = path.join(temp, 'example.tsv');
    writeFileSync(file, 'a\ta\n1\t2');
    const result = command(['--json', '--delimiter', 'tab', '--no-header', '--', file]);
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).dataRecords, 2);
    const missing = command(['--json', path.join(temp, 'missing')]);
    assert.equal(missing.status, 2);
    assert.equal(JSON.parse(missing.stdout).error.code, 'INPUT_READ');
    assert.equal(missing.stdout.includes(temp), false);
  } finally { rmSync(temp, { recursive: true }); }
});

test('CLI bounds piped data and offers help/version without input', () => {
  const result = command(['--json'], 'a'.repeat(32 * 1024 * 1024 + 1));
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).error.code, 'INPUT_LIMIT');
  assert.equal(command(['--help']).status, 0);
  assert.match(command(['--help']).stdout, /Exit codes/);
  assert.equal(command(['--version']).stdout, '0.1.0\n');
});


test('JSON usage errors do not depend on the option order or dash-prefixed filenames', () => {
  const result = command(['--unknown', '--json']);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).error.code, 'USAGE');
  assert.equal(result.stderr, '');
  const boundary = command(['--', '--json']);
  assert.equal(boundary.status, 2);
  assert.equal(boundary.stdout, '');
  assert.equal(boundary.stderr, 'Could not read input\n');
});
