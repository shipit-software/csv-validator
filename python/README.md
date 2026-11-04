# CSV Validator for Python

Validate UTF-8 CSV locally with record, field, line and column diagnostics.
This is the Python implementation from the same
[CSV Validator repository](https://github.com/shipit-software/csv-validator)
as the JavaScript and Rust implementations. It has no runtime dependencies,
network calls, type guessing, cell evaluation or automatic edits.

For an interactive workflow, use the [CSV validator](https://csvfile.tools/validate).

Requires Python 3.11 or newer. Install an available released version with:

    python -m pip install shipit-csv-validator

For a local source checkout, install the python directory instead.

    python -m pip install ./python
    shipit-csv-validate --json data.csv
    python -m shipit_csv_validator --delimiter tab --no-header data.tsv
    shipit-csv-validate --json -- -starts-with-dash.csv

Omit the filename or use - to read standard input. Exit codes are 0 for valid
CSV, 1 for invalid CSV and 2 for usage, read, encoding or input-limit errors.
The CLI buffers at most 32 MiB plus one byte for detecting overflow. Files are
opened read-only; it never changes input files. --help lists all options.

    from shipit_csv_validator import validate_csv

    report = validate_csv("id,name\n001,Ada")
    assert report["valid"]
    assert report["dataRecords"] == 1

The API accepts complete text and keyword-only delimiter, header and max_errors
options. Invalid options raise TypeError. API input is not limited by byte size.
The returned dictionary uses the shared JSON report keys: valid, records,
dataRecords, columns, header, diagnostics, diagnosticsTruncated and parseComplete.

Checks include row widths, empty/duplicate exact header names, quote placement,
unclosed quoted fields and NUL characters. Quoted delimiters/line endings,
escaped quotes, an initial UTF-8 BOM and CRLF/LF/CR are supported. Spaces are
significant. Header names are case-sensitive. Empty lines are records.
Syntax errors stop parsing; counts then include completed records only.
Positions are one-based, and columns count UTF-16 units for parity with the
other implementations. A delimiter must be exactly one UTF-16 unit other than
quote, CR, LF or NUL. Formula safety, application schemas, types, required values
and domain-specific rules are outside this validator.

From the repository root, run the shared 22-case corpus and additional CLI/API
checks with:

    PYTHONPATH=python/src python -m unittest discover -s python/tests -v

All fixtures are synthetic. Code is MIT licensed; see LICENSE.
