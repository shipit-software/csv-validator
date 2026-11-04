# CSV validation conformance v1

The canonical shared corpus is `../rust/tests/fixtures/csv-v1.tsv`. It is included
in the Cargo source package so installed-source tests remain self-contained.
JavaScript, Deno and Rust consumers should use that same corpus, not copies.

Each non-comment line has six tab-separated columns: case name, CSV input as
UTF-8 hex, delimiter as UTF-8 hex, header boolean, maximum diagnostics, and the
complete expected JSON report. Empty input has an empty second column. Expected
records, diagnostic order, positions, messages and flags are specified explicitly;
one implementation's output is not used as another implementation's oracle.

Positions are one-based. Columns count UTF-16 code units, including in Rust.
CRLF counts as one line, a final line ending adds no record, and a single leading
BOM is ignored. Syntax errors precede header/width diagnostics and retain only
completed records. Case-sensitive headers and diagnostic truncation are deliberate.

CLI-specific tests additionally cover UTF-8 failures, the 32 MiB input bound,
option parsing, exit codes, stdin and file access. Library input has no byte cap.
