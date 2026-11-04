# CSV Validator

Validate UTF-8 CSV locally and get record, field, line and column diagnostics.
No runtime dependencies, uploads, type guessing or automatic edits.

For an interactive workflow, use [CSV File Tools' CSV validator](https://csvfile.tools/validate).

## Run locally

Requires Node.js 22 or newer:

```sh
node src/cli.mjs data.csv
node src/cli.mjs --json data.csv
cat data.csv | node src/cli.mjs --json
node src/cli.mjs --delimiter tab --no-header data.tsv
```

The package name is a proposed identity; use the local command above.

## Checks

- Consistent field counts across records.
- Empty and duplicate exact header names (disable headers with `--no-header`).
- Quotes beginning at field boundaries, escaped quotes, and closing quotes.
- Valid UTF-8 and no NUL characters.

Quoted delimiters, quoted line breaks, UTF-8 BOM, CRLF, LF and CR endings are
supported. A final line ending does not add a record. An empty line is a record
with one empty field. Spaces are significant; text or spaces after a closing
quote are rejected. Header comparison is case-sensitive. Values stay strings;
formulas are never evaluated. The validator does not check spreadsheet safety,
application schemas, data types, required values or domain-specific rules.

## JSON and exit codes

`--json` prints one JSON object with `valid`, `records`, `dataRecords`, `columns`,
`header`, `diagnostics`, `diagnosticsTruncated` and `parseComplete`. Each diagnostic
has a stable `code` plus one-based `record`, `field`, `line` and `column` positions.
A syntax error stops parsing; record counts then include only completed records.
Usage, encoding and read errors return `{ "valid": false, "error": { "code": "…", "message": "…" } }`.

- `0`: valid CSV.
- `1`: invalid CSV.
- `2`: usage, file access, input encoding or size error.

The CLI buffers up to 32 MiB of UTF-8 input. Its default diagnostic limit is 100;
`--max-errors` accepts 1–10,000. The library API validates an already loaded string
and does not impose the CLI's byte limit. Columns count UTF-16 code units; a
delimiter must be one UTF-16 code unit other than quote, CR, LF or NUL.

## Library and tests

```js
import { validateCsv } from './src/validate.mjs';
const report = validateCsv('id,name\n1,Ada');
```

```sh
node --test test/*.test.mjs
```

All test data is synthetic. MIT licensed; see [LICENSE](LICENSE).

## Portable JavaScript API and JSR candidate

The same `validateCsv` implementation also runs in Deno without filesystem,
network, environment or subprocess permissions. It takes complete text and
returns the documented validation report; it does not read or upload files.

```js
import { validateCsv } from './src/validate.mjs';
const result = validateCsv('id,name\n001,Ada');
console.log(result.valid, result.dataRecords); // true 1
```

`jsr.json` prepares the proposed `@shipit-software/csv-validator` 0.1.0 package
from this same source. This is a local release candidate, not a claim that the
package is available on JSR. JSR exports the library API; the Node CLI above
remains separate. Check it locally with `deno test test/deno-api.test.ts` and
`deno publish --dry-run` before any release. No runtime dependencies or JSR-only
copy of the validator are needed. The explicit JSR file list contains only the
API source and type declarations, package metadata, this README and the MIT license.
