# CSV Validator

Validate UTF-8 CSV locally and get record, field, line and column diagnostics.
No runtime dependencies, uploads, type guessing or automatic edits.

For an interactive workflow, use [CSV File Tools' CSV validator](https://csvfile.tools/validate).
The implementations here are standalone tools; the website has its own source.

## Install a CLI

The implementations expose the same `shipit-csv-validate` command. Choose the
installation that fits your runtime.

With Node.js 22 or newer, install from [npm](https://www.npmjs.com/package/@shipit-software/csv-validator):

```sh
npm install --global @shipit-software/csv-validator@0.1.0
```

With Rust 1.93 or newer, install from [crates.io](https://crates.io/crates/shipit-csv-validator):

```sh
cargo install shipit-csv-validator --version 0.1.0
```

```sh
shipit-csv-validate data.csv
shipit-csv-validate --json data.csv
cat data.csv | shipit-csv-validate --json
shipit-csv-validate --delimiter tab --no-header data.tsv
```

The [Python implementation](python/README.md) is also available in this repository.
For local use with Python 3.11 or newer, run `python -m pip install ./python`
from a source checkout. This is not a claim of PyPI availability.

With PHP 8.1 or newer, install the [Composer package](https://packagist.org/packages/shipit-software/csv-validator)
in your project:

```sh
composer require shipit-software/csv-validator:^0.1
vendor/bin/shipit-csv-validate --json data.csv
```

See the [PHP guide](php/README.md) for the library API.


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

The CLIs buffer up to 32 MiB of UTF-8 input. Their default diagnostic limit is
100; `--max-errors` accepts 1–10,000. Source columns count UTF-16 code units;
a delimiter must be one UTF-16 code unit other than quote, CR, LF or NUL.

## JavaScript library

The [JSR package](https://jsr.io/@shipit-software/csv-validator) exports the
portable library API, with no CLI or file-reading interface:

```js
import { validateCsv } from 'jsr:@shipit-software/csv-validator@0.1.0';
const report = validateCsv('id,name\n001,Ada');
console.log(report.valid, report.dataRecords); // true 1
```

In Node.js, install the npm package locally and import the same API:

```sh
npm install @shipit-software/csv-validator@0.1.0
```

```js
import { validateCsv } from '@shipit-software/csv-validator';
const report = validateCsv('id,name\n001,Ada');
```

The JavaScript API accepts an already loaded string and does not impose the
CLI byte limit or perform UTF-8 byte decoding. It does not read files, upload
input, or require filesystem, network, environment or subprocess permissions.
The Node CLI adds file/stdin reading, UTF-8 decoding and exit codes.

## Source and packages

[GitHub source](https://github.com/shipit-software/csv-validator) contains the
source for each implementation of this tool. Releases are available
on [npm](https://www.npmjs.com/package/@shipit-software/csv-validator),
[crates.io](https://crates.io/crates/shipit-csv-validator) and
[JSR](https://jsr.io/@shipit-software/csv-validator).
For browser-based validation, open the [CSV validator](https://csvfile.tools/validate).

From a source checkout, run the JavaScript tests with:

```sh
node --test test/*.test.mjs
```

All test data is synthetic. MIT licensed; see [LICENSE](LICENSE).
