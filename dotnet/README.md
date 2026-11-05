# Shipit CSV Validator for .NET

A local command-line tool for checking UTF-8 CSV before importing or processing it. It reports malformed quoting, inconsistent row widths, empty or duplicate headers, and NUL characters with record, field, line, and column positions.

Requires the .NET 10 SDK to install and a .NET 10 runtime to run. This package has no third-party runtime dependencies.

```sh
dotnet tool install --global Shipit.CsvValidator --version 0.1.0
shipit-csv-validate --json records.csv
```

Omit the filename or pass `-` to read standard input. Use `--delimiter tab` for tab-separated files and `--no-header` if every record is data. Run `shipit-csv-validate --help` for the full option list. The exit status is 0 for valid input, 1 for invalid CSV, or 2 for usage and input failures.

Validation is structural. The tool does not infer types, evaluate formulas, modify the input, or upload its contents. It buffers up to 32 MiB of input and counts diagnostic columns in UTF-16 code units.

For browser-based validation, use the [online CSV validator](https://csvfile.tools/validate). Find the MIT-licensed [source and other implementations](https://github.com/shipit-software/csv-validator) on GitHub.

## Build from source

From this directory, run `dotnet pack --configuration Release` with the .NET 10 SDK. For an isolated local installation, use the resulting package as a local NuGet feed and run `dotnet tool install --tool-path ./local-tools --add-source ./bin/Release Shipit.CsvValidator --version 0.1.0`.
