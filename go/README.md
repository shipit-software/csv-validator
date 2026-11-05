# CSV Validator for Go

Check UTF-8 CSV in Go or from a terminal. The library and CLI check strict
quoting, record widths and optionally header names. They work locally and
report locations without printing cell values or modifying input.

For the browser tool, see [CSV Validator online](https://csvfile.tools/validate).
For issues and other language editions, see the
[CSV Validator source repository](https://github.com/shipit-software/csv-validator).

## Install

Use Go 1.22 or later:

```sh
go install github.com/shipit-software/csv-validator/go/cmd/shipit-csv-validate@v0.1.0
shipit-csv-validate --json data.csv
```

Pass `-` or omit the file to read standard input. Use `--no-header` when
the first row contains data, `--delimiter tab` for tab-delimited files, or
`--max-errors 20` to limit diagnostics. The exit status is 0 for valid CSV,
1 for invalid CSV, and 2 for usage or input errors.

## Library

```go
package main

import (
    "fmt"
    "log"

    csvvalidator "github.com/shipit-software/csv-validator/go"
)

func main() {
    report, err := csvvalidator.Validate("id,name\n1,Ada", csvvalidator.DefaultOptions())
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(report.Valid)
}
```

The first complete record sets the expected width. With headers enabled, names
must be nonempty and unique, with case-sensitive comparison. The validator
supports quoted delimiters, escaped quotes, multiline fields, CRLF, LF and CR.
It ignores one leading UTF-8 BOM. It reports only completed records after a
syntax error. Coordinates are one-based, and columns count UTF-16 code units
so positions agree with the other editions.

The CLI buffers up to 32 MiB. The library accepts a UTF-8 string and does not
impose that byte limit. Neither infers types or validates schemas. A delimiter
must be one Basic Multilingual Plane character other than quote, newline or NUL.

The module uses only the Go standard library. Run `go test ./...` from this
directory. When working in the source repository, the tests also read its
shared conformance corpus.
