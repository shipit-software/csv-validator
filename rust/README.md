# Shipit CSV Validator for Rust

Validate UTF-8 CSV locally with record, field, line and column diagnostics.
This dependency-free Rust library and CLI are maintained alongside the JavaScript
implementation in the same tool repository. No values are inferred or evaluated.

For an interactive workflow, use the [CSV validator](https://csvfile.tools/validate).
The intended source repository is [CSV Validator](https://github.com/shipit-software/csv-validator).
These are local unreleased 0.1.0 candidates; the planned package identity is
`shipit-csv-validator`. No registry availability is claimed.

```sh
cargo test --offline
cargo run --offline -- --json data.csv
cargo run --offline -- --delimiter tab --no-header data.tsv
```

```rust
use shipit_csv_validator::{validate_csv, Options};
let report = validate_csv("id,name\n1,Ada", Options::default()).unwrap();
assert!(report.valid);
```

The CLI accepts a file or stdin and returns 0 for valid CSV, 1 for validation
diagnostics and 2 for usage/input failures. `--json` emits the shared report.
`--delimiter`, `--no-header`, `--max-errors`, `--help`, `--version` and `--` are
supported. Input is buffered with a 32 MiB CLI cap; the library accepts a `&str`
without that cap. Diagnostics are bounded to 1–10,000 (default 100).

Quoted delimiters/newlines, escaped quotes, UTF-8 BOM and CR/LF/CRLF are supported.
Checks cover strict quoting, field counts and exact empty/duplicate header names.
Positions use UTF-16 source columns to match the JavaScript behavior contract.
Delimiters must occupy one UTF-16 code unit and cannot be quote, CR, LF or NUL.
Values remain strings. This does not validate schemas, data types, required values,
spreadsheet safety or domain rules. Source and synthetic fixtures are MIT licensed.

The shared conformance v1 corpus is `tests/fixtures/csv-v1.tsv`. Linux isolated
test results do not establish Windows/macOS installation or performance claims.
