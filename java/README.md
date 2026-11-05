
# CSV Validator for Java

A dependency-free Java library and command-line validator for UTF-8 CSV. It
checks quoting, inconsistent record widths, empty or repeated header names,
and NUL characters. Diagnostics identify the record, field, physical line,
and UTF-16 column. The validator preserves input and runs locally.

Use Java 17 or newer. Add the Maven dependency to use the library:

```xml
<dependency>
  <groupId>com.shipitsoftware</groupId>
  <artifactId>csv-validator</artifactId>
  <version>0.1.0</version>
</dependency>
```

```java
import com.shipitsoftware.csvvalidator.CsvValidator;

var report = CsvValidator.validate("name,age\nAda,36\n");
System.out.println(report.valid());
```

The library accepts a String and returns an immutable report. Pass a delimiter,
a header flag, and a maximum diagnostic count to override the defaults.

The same JAR runs as a command. It reads one file or standard input, accepts
`--json`, `--delimiter`, `--no-header`, and `--max-errors`, and limits input
to 32 MiB. Exit status is 0 for valid CSV, 1 for invalid CSV, and 2 for usage or
input errors.

```sh
java -jar csv-validator-0.1.0.jar --json data.csv
```

From the repository root, run `sh java/build-release.sh /path/to/new-output`
with OpenJDK 21 and Python 3. This builds the executable, sources and
Javadoc archives and tests the resulting JAR with the shared fixtures.

[Online CSV validator](https://csvfile.tools/validate) ·
[GitHub source and issue tracker](https://github.com/shipit-software/csv-validator)
