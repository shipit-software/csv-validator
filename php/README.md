# CSV Validator for PHP

Install the PHP library and its command-line tool with Composer. PHP 8.1 or
newer is required. The library has no third-party runtime dependencies.

    composer require shipit-software/csv-validator:^0.1
    vendor/bin/shipit-csv-validate --json records.csv

Omit the file to read standard input. The command returns 0 for valid CSV, 1
for invalid CSV, and 2 for usage or input errors. Run
`vendor/bin/shipit-csv-validate --help` for delimiter and diagnostic options.

Use the same validator from PHP:

    use ShipitSoftware\CsvValidator\Validator;

    $report = Validator::validate("id,name\n1,Ada\n");
    echo $report['dataRecords'];

Reports describe CSV syntax, row widths, and empty or duplicate header names.
The validator never interprets cell values or changes input. Input is UTF-8.
The CLI buffers up to 32 MiB. Diagnostic positions are one-based, with columns
counted in UTF-16 code units.

From the source checkout, run the shared conformance corpus with
`php php/test/conformance.php`.

[Validate CSV online](https://csvfile.tools/validate) or browse the
[CSV Validator source](https://github.com/shipit-software/csv-validator).
