
package com.shipitsoftware.csvvalidator;

import java.io.IOException;
import java.io.InputStream;
import java.io.PrintStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.StringJoiner;

/** Command-line entry point for local CSV validation. */
public final class Main {
    private static final int INPUT_LIMIT = 32 * 1024 * 1024;
    private static final String VERSION = "0.1.0";
    private static final String HELP = """
            Usage: java -jar csv-validator-0.1.0.jar [options] [FILE|-]
            Validate UTF-8 CSV without changing its contents. Omit FILE to read stdin.

              --json              Print the CSV validation conformance report as JSON
              --delimiter CHAR    Use one delimiter character (or "tab")
              --no-header         Treat the first record as data
              --max-errors N      Limit diagnostics to 1–10000 (default 100)
              --help              Show this help
              --version           Show the version
              --                  End options

            Exit codes: 0 valid, 1 invalid CSV, 2 usage or input error.
            Input limit: 32 MiB.
            """;

    private Main() {}

    /**
     * Reads a file or standard input, prints a report, and exits with its status.
     *
     * @param args command-line options and optional input file
     */
    public static void main(String[] args) {
        System.exit(run(args, System.in, System.out, System.err));
    }

    private static int run(String[] args, InputStream stdin, PrintStream stdout, PrintStream stderr) {
        boolean json = false;
        for (String arg : args) {
            if (arg.equals("--")) {
                break;
            }
            if (arg.equals("--json")) {
                json = true;
                break;
            }
        }
        boolean options = true;
        boolean header = true;
        char delimiter = ',';
        int maxErrors = 100;
        String filename = null;

        for (int index = 0; index < args.length; index++) {
            String arg = args[index];
            if (options) {
                switch (arg) {
                    case "--" -> {
                        options = false;
                        continue;
                    }
                    case "--json" -> {
                        continue;
                    }
                    case "--no-header" -> {
                        header = false;
                        continue;
                    }
                    case "--help" -> {
                        stdout.print(HELP);
                        return 0;
                    }
                    case "--version" -> {
                        stdout.println(VERSION);
                        return 0;
                    }
                    case "--delimiter" -> {
                        String value = ++index < args.length ? args[index] : "";
                        if (value.equals("tab")) {
                            value = "\t";
                        }
                        if (value.length() != 1 || !CsvValidator.validDelimiter(value.charAt(0))) {
                            return fail(stdout, stderr, json, "USAGE",
                                    "Delimiter must be one BMP character other than quote, newline or NUL");
                        }
                        delimiter = value.charAt(0);
                        continue;
                    }
                    case "--max-errors" -> {
                        String value = ++index < args.length ? args[index] : "";
                        if (!value.matches("[1-9][0-9]{0,4}") || Integer.parseInt(value) > 10_000) {
                            return fail(stdout, stderr, json, "USAGE", "Maximum errors must be 1-10000");
                        }
                        maxErrors = Integer.parseInt(value);
                        continue;
                    }
                    default -> {
                        if (arg.startsWith("-") && !arg.equals("-")) {
                            return fail(stdout, stderr, json, "USAGE", "Unknown option; use --help");
                        }
                    }
                }
            }
            if (filename != null) {
                return fail(stdout, stderr, json, "USAGE", "Provide one file, or standard input");
            }
            filename = arg;
        }

        String source;
        try (InputStream input = filename == null || filename.equals("-")
                ? stdin : Files.newInputStream(Path.of(filename))) {
            byte[] bytes = input.readNBytes(INPUT_LIMIT + 1);
            if (bytes.length > INPUT_LIMIT) {
                return fail(stdout, stderr, json, "INPUT_LIMIT", "Input exceeds the 32 MiB limit");
            }
            source = StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException error) {
            return fail(stdout, stderr, json, "INPUT_ENCODING", "Input must be valid UTF-8");
        } catch (IOException | SecurityException | IllegalArgumentException error) {
            return fail(stdout, stderr, json, "INPUT_READ", "Could not read input");
        }

        CsvValidator.Report report = CsvValidator.validate(source, delimiter, header, maxErrors);
        if (json) {
            stdout.println(toJson(report));
        } else if (report.valid()) {
            stdout.printf("Valid CSV: %d data records, %d columns%n", report.dataRecords(), report.columns());
        } else {
            for (CsvValidator.Diagnostic issue : report.diagnostics()) {
                stdout.printf("%s: record %d, field %d, line %d, column %d: %s%n", issue.code(),
                        issue.record(), issue.field(), issue.line(), issue.column(), issue.message());
            }
            if (report.diagnosticsTruncated()) {
                stdout.println("Additional diagnostics omitted");
            }
        }
        return report.valid() ? 0 : 1;
    }

    private static int fail(PrintStream stdout, PrintStream stderr, boolean json, String code, String message) {
        if (json) {
            stdout.println("{\"valid\":false,\"error\":{\"code\":" + quote(code) + ",\"message\":" + quote(message) + "}}");
        } else {
            stderr.println(message);
        }
        return 2;
    }

    private static String toJson(CsvValidator.Report report) {
        StringJoiner diagnostics = new StringJoiner(",", "[", "]");
        for (CsvValidator.Diagnostic issue : report.diagnostics()) {
            diagnostics.add("{\"code\":" + quote(issue.code()) + ",\"message\":" + quote(issue.message())
                    + ",\"record\":" + issue.record() + ",\"field\":" + issue.field() + ",\"line\":" + issue.line()
                    + ",\"column\":" + issue.column() + "}");
        }
        return "{\"valid\":" + report.valid() + ",\"records\":" + report.records()
                + ",\"dataRecords\":" + report.dataRecords() + ",\"columns\":" + report.columns()
                + ",\"header\":" + report.header() + ",\"diagnostics\":" + diagnostics
                + ",\"diagnosticsTruncated\":" + report.diagnosticsTruncated()
                + ",\"parseComplete\":" + report.parseComplete() + "}";
    }

    private static String quote(String text) {
        StringBuilder json = new StringBuilder().append('"');
        for (int i = 0; i < text.length(); i++) {
            char character = text.charAt(i);
            if (character == '"' || character == '\\') {
                json.append('\\').append(character);
            } else if (character < ' ') {
                json.append("\\u00").append(Character.forDigit(character >>> 4, 16))
                        .append(Character.forDigit(character & 15, 16));
            } else {
                json.append(character);
            }
        }
        return json.append('"').toString();
    }
}
