#!/usr/bin/env node
import { TextDecoder } from 'node:util';
import { validateCsv } from './validate.mjs';

const HELP = `Usage: shipit-csv-validate [options] [FILE|-]
Validate a UTF-8 CSV file or standard input without changing its contents.

Options:
  --json              Print a stable JSON report
  --delimiter CHAR    Use one delimiter character (use "tab" for a tab)
  --no-header         Treat the first record as data
  --max-errors N      Maximum reported diagnostics (1-10000; default 100)
  --help              Show this help
  --version           Show the version
  --                   End options; allows filenames starting with a dash

Exit codes: 0 valid, 1 invalid CSV, 2 usage or input error.
Limit: buffered UTF-8 input, up to 32 MiB. No type/schema inference.
`;
const LIMIT = 32 * 1024 * 1024;
const args = process.argv.slice(2);
const optionBoundary = args.indexOf('--');
const json = args.slice(0, optionBoundary < 0 ? args.length : optionBoundary).includes('--json');
let delimiter = ',';
let header = true;
let maxErrors = 100;
let file;
let endOptions = false;
function fail(code, message) {
  const error = { valid: false, error: { code, message } };
  if (json) process.stdout.write(`${JSON.stringify(error)}\n`);
  else process.stderr.write(`${message}\n`);
  process.exitCode = 2;
}
try {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!endOptions && argument === '--') { endOptions = true; continue; }
    if (!endOptions && argument === '--json') continue;
    if (!endOptions && argument === '--help') { process.stdout.write(HELP); process.exit(0); }
    if (!endOptions && argument === '--version') { process.stdout.write('0.1.0\n'); process.exit(0); }
    if (!endOptions && argument === '--no-header') { header = false; continue; }
    if (!endOptions && argument === '--delimiter') {
      delimiter = args[++index];
      if (delimiter === 'tab') delimiter = '\t';
      if (typeof delimiter !== 'string' || delimiter.length !== 1 || /["\r\n\u0000]/u.test(delimiter)) {
        throw new TypeError('Delimiter must be one character other than quote, newline or NUL');
      }
      continue;
    }
    if (!endOptions && argument === '--max-errors') {
      const raw = args[++index];
      if (!/^[1-9]\d*$/.test(raw ?? '') || Number(raw) > 10000) throw new TypeError('Maximum errors must be 1-10000');
      maxErrors = Number(raw);
      continue;
    }
    if (!endOptions && argument.startsWith('-') && argument !== '-') throw new TypeError('Unknown option; use --help');
    if (file !== undefined) throw new TypeError('Provide one file, or standard input');
    file = argument;
  }
  let bytes;
  try {
    // Stream stdin in bounded chunks rather than allowing a pipe to allocate
    // unbounded memory. File reads use the same bounded path.
    const { openSync, readSync, closeSync } = await import('node:fs');
    const fd = file === undefined || file === '-' ? 0 : openSync(file, 'r');
    try {
      const chunks = [];
      let total = 0;
      for (;;) {
        const chunk = Buffer.alloc(65536);
        const count = readSync(fd, chunk, 0, chunk.length, null);
        if (!count) break;
        total += count;
        if (total > LIMIT) throw new RangeError('Input exceeds the 32 MiB limit');
        chunks.push(chunk.subarray(0, count));
      }
      bytes = Buffer.concat(chunks, total);
    } finally {
      if (fd !== 0) closeSync(fd);
    }
  } catch (error) {
    if (error instanceof RangeError) throw error;
    fail('INPUT_READ', 'Could not read input');
  }
  if (bytes !== undefined) {
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { fail('INPUT_ENCODING', 'Input must be valid UTF-8'); }
    if (text !== undefined) {
      const report = validateCsv(text, { delimiter, header, maxErrors });
      if (json) process.stdout.write(`${JSON.stringify(report)}\n`);
      else if (report.valid) process.stdout.write(`Valid CSV: ${report.dataRecords} data records, ${report.columns} columns\n`);
      else {
        for (const issue of report.diagnostics) {
          process.stdout.write(`${issue.code}: record ${issue.record}, field ${issue.field}, line ${issue.line}, column ${issue.column}: ${issue.message}\n`);
        }
        if (report.diagnosticsTruncated) process.stdout.write('Additional diagnostics omitted\n');
      }
      process.exitCode = report.valid ? 0 : 1;
    }
  }
} catch (error) {
  fail(error instanceof RangeError ? 'INPUT_LIMIT' : 'USAGE', error instanceof TypeError || error instanceof RangeError ? error.message : 'Validation failed');
}
