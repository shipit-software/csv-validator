# CSV Validator for Ruby

Check UTF-8 CSV structure in Ruby or from a terminal. The library and command
line tool work locally, report problem locations without printing cell values,
and leave input files untouched.

Use the [online CSV validator](https://csvfile.tools/validate) in a browser.
The [CSV Validator source repository](https://github.com/shipit-software/csv-validator)
contains the Ruby source, shared conformance cases and other language editions.

## Command line

With Ruby 3.0 or newer:

~~~sh
gem install shipit-csv-validator
shipit-csv-validate --json data.csv
~~~

Pass a file, pass "-" or omit the filename to read standard input. Use
"--no-header" when the first record is data, "--delimiter tab" for tab-separated
data, and "--max-errors 20" to cap diagnostics. Exit status is 0 for valid CSV,
1 for invalid CSV, and 2 for an option or input error. The command accepts up to
32 MiB of UTF-8 input.

## Ruby API

~~~ruby
require "shipit/csv_validator"

report = Shipit::CsvValidator.validate("id,name\n1,Ada\n", header: true)
puts report["valid"]      # true
puts report["columns"]    # 2
~~~

The API accepts UTF-8 input without the command line byte limit. It reports
quoting errors, unsupported NUL characters, inconsistent row widths and empty
or repeated headers. The first complete record sets the expected width. Header
comparisons are case sensitive. The parser supports escaped quotes, quoted
delimiters, multiline fields and CRLF, LF or CR line endings. It ignores a
single leading byte order mark. Diagnostic positions are one-based, and columns
count UTF-16 code units. It validates structure without inferring data types
or applying schemas. An invalid delimiter, option or encoding raises
"ArgumentError". The implementation uses only Ruby standard libraries.
