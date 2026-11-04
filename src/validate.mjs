/* @ts-self-types="./validate.d.ts" */

/**
 * Validate comma-separated records without guessing types or changing values.
 * record/field/line/column positions are one-based; CRLF counts as one line.
 * This synchronous API has no filesystem, network, environment or runtime dependency.
 *
 * @param {string} input Complete CSV text, optionally beginning with a UTF-8 BOM.
 * @param {import('./validate.d.ts').ValidationOptions} [options] Delimiter, header and diagnostic controls.
 * @returns {import('./validate.d.ts').ValidationReport} Validation summary and exact diagnostic positions.
 * @throws {TypeError} When the input or options are invalid.
 * @example
 * const report = validateCsv('id,name\n1,Ada');
 * console.log(report.valid); // true
 */
export function validateCsv(input, { delimiter = ',', header = true, maxErrors = 100 } = {}) {
  if (typeof input !== 'string') throw new TypeError('Input must be a string');
  if (typeof delimiter !== 'string' || delimiter.length !== 1 || /["\r\n\u0000]/u.test(delimiter)) {
    throw new TypeError('Delimiter must be one character other than quote, newline or NUL');
  }
  if (typeof header !== 'boolean' || !Number.isSafeInteger(maxErrors) || maxErrors < 1 || maxErrors > 10000) {
    throw new TypeError('Invalid validation options');
  }
  const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows = [];
  const diagnostics = [];
  let truncated = false;
  let record = 1;
  let line = 1;
  let column = 1;
  let rowStart = { line, column };
  let fieldStart = { line, column };
  let fields = [];
  let value = '';
  let state = 'start';
  let rowTouched = false;
  let fatal = false;
  const error = (code, message, at = { line, column }, field = fields.length + 1, rowNumber = record) => {
    if (diagnostics.length < maxErrors) diagnostics.push({ code, message, record: rowNumber, field, ...at });
    else truncated = true;
  };
  const finishField = () => {
    fields.push({ value, ...fieldStart });
    value = '';
    state = 'start';
  };
  const finishRecord = () => {
    finishField();
    rows.push({ fields, ...rowStart });
    fields = [];
    record += 1;
    rowTouched = false;
  };
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const newline = character === '\r' || character === '\n';
    const crlf = character === '\r' && source[index + 1] === '\n';
    if (character === '\u0000') {
      error('NUL_CHARACTER', 'NUL characters are not supported');
      fatal = true;
      break;
    }
    if (state === 'quoted') {
      rowTouched = true;
      if (character === '"') {
        if (source[index + 1] === '"') {
          value += '"'; index += 1; column += 2; continue;
        }
        state = 'closed';
      } else {
        value += character;
        if (crlf) { value += '\n'; index += 1; }
      }
      if (newline) { line += 1; column = 1; } else column += 1;
      continue;
    }
    if (character === delimiter) {
      rowTouched = true;
      finishField();
      column += 1;
      fieldStart = { line, column };
      continue;
    }
    if (newline) {
      finishRecord();
      if (crlf) index += 1;
      line += 1;
      column = 1;
      rowStart = fieldStart = { line, column };
      continue;
    }
    if (state === 'closed') {
      error('TEXT_AFTER_QUOTE', 'Only a delimiter or line ending may follow a closing quote');
      fatal = true;
      break;
    }
    if (character === '"') {
      if (state !== 'start') {
        error('QUOTE_IN_UNQUOTED_FIELD', 'A quote must start at the beginning of a field');
        fatal = true;
        break;
      }
      state = 'quoted';
    } else {
      value += character;
      state = 'plain';
    }
    rowTouched = true;
    column += 1;
  }
  if (!fatal && state === 'quoted') {
    error('UNCLOSED_QUOTE', 'Quoted field is missing a closing quote', fieldStart);
    fatal = true;
  }
  if (!fatal && (rowTouched || fields.length || value.length)) finishRecord();
  const width = rows[0]?.fields.length ?? 0;
  if (!source.length) error('EMPTY_INPUT', 'Input contains no records', { line: 1, column: 1 }, 1, 1);
  if (header && rows.length) {
    const seen = new Map();
    rows[0].fields.forEach((field, index) => {
      const at = { line: field.line, column: field.column };
      if (field.value.length === 0) error('EMPTY_HEADER', 'Header name is empty', at, index + 1, 1);
      if (seen.has(field.value)) {
        error('DUPLICATE_HEADER', `Header repeats field ${seen.get(field.value)}`, at, index + 1, 1);
      } else seen.set(field.value, index + 1);
    });
  }
  rows.forEach((row, index) => {
    if (row.fields.length !== width) {
      error('ROW_WIDTH', `Expected ${width} fields; found ${row.fields.length}`,
        { line: row.line, column: row.column }, Math.min(width, row.fields.length) + 1, index + 1);
    }
  });
  return {
    valid: diagnostics.length === 0,
    records: rows.length,
    dataRecords: Math.max(0, rows.length - (header && rows.length ? 1 : 0)),
    columns: width,
    header,
    diagnostics,
    diagnosticsTruncated: truncated,
    parseComplete: !fatal,
  };
}
