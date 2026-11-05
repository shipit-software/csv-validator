
package com.shipitsoftware.csvvalidator;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Validates CSV text locally, without altering field contents. */
public final class CsvValidator {
    private CsvValidator() {}

    /**
     * A structural CSV problem with one-based positions and UTF-16 columns.
     *
     * @param code stable diagnostic identifier
     * @param message description of the problem
     * @param record logical record number
     * @param field field number within the record
     * @param line physical input line
     * @param column position on the physical line
     */
    public record Diagnostic(String code, String message, int record, int field, int line, int column) {}

    /**
     * Structural validation result. Counts include only completed records.
     *
     * @param valid whether the input contains records and has no diagnostics
     * @param records number of completed records, including the header if present
     * @param dataRecords number of completed records excluding the header if present
     * @param columns field count of the first completed record
     * @param header whether the first record is interpreted as headers
     * @param diagnostics immutable list of reported problems
     * @param diagnosticsTruncated whether additional problems were omitted
     * @param parseComplete whether scanning completed without a syntax error
     */
    public record Report(boolean valid, int records, int dataRecords, int columns, boolean header,
                         List<Diagnostic> diagnostics, boolean diagnosticsTruncated, boolean parseComplete) {
        /** Copies the diagnostic list to make the result immutable. */
        public Report {
            diagnostics = List.copyOf(diagnostics);
        }
    }

    /**
     * Validates comma-delimited text with a header and up to 100 diagnostics.
     *
     * @param input CSV text
     * @return validation report
     */
    public static Report validate(String input) {
        return validate(input, ',', true, 100);
    }

    /**
     * Validates CSV text with a configurable delimiter, header, and diagnostic limit.
     * A leading BOM is ignored. LF, CRLF and bare CR are accepted.
     *
     * @param input CSV text
     * @param delimiter one BMP character other than quote, line ending or NUL
     * @param header whether to validate the first record as headers
     * @param maxErrors maximum diagnostics to retain, from 1 through 10,000
     * @return validation report
     * @throws IllegalArgumentException if the delimiter or diagnostic limit is invalid
     */
    public static Report validate(String input, char delimiter, boolean header, int maxErrors) {
        Objects.requireNonNull(input, "input");
        if (!validDelimiter(delimiter)) {
            throw new IllegalArgumentException("Delimiter must be one BMP character other than quote, newline or NUL");
        }
        if (maxErrors < 1 || maxErrors > 10_000) {
            throw new IllegalArgumentException("Maximum errors must be 1-10000");
        }
        return new Scanner(delimiter, header, maxErrors).scan(input);
    }

    static boolean validDelimiter(char delimiter) {
        return delimiter != '"' && delimiter != '\r' && delimiter != '\n'
                && delimiter != '\0' && !Character.isSurrogate(delimiter);
    }

    private enum State { START, UNQUOTED, QUOTED, CLOSED }

    private static final class Scanner {
        private final char delimiter;
        private final boolean header;
        private final int maxErrors;
        private Map<String, Integer> headerNames;
        private StringBuilder headerValue;
        private final List<Diagnostic> headerErrors = new ArrayList<>();
        private final List<Diagnostic> widthErrors = new ArrayList<>();
        private boolean headerTruncated;
        private boolean widthTruncated;
        private Diagnostic syntaxError;
        private int records;
        private int fields;
        private int width;
        private int line = 1;
        private int column = 1;
        private int recordLine = 1;
        private int fieldLine = 1;
        private int fieldColumn = 1;
        private State state = State.START;
        private boolean recordTouched;

        private Scanner(char delimiter, boolean header, int maxErrors) {
            this.delimiter = delimiter;
            this.header = header;
            this.maxErrors = maxErrors;
            if (header) {
                headerNames = new HashMap<>();
                headerValue = new StringBuilder();
            }
        }

        private boolean save(List<Diagnostic> destination, Diagnostic diagnostic) {
            if (destination.size() == maxErrors) {
                return true;
            }
            destination.add(diagnostic);
            return false;
        }

        private void finishField() {
            fields++;
            if (headerValue != null) {
                String name = headerValue.toString();
                if (name.isEmpty()) {
                    headerTruncated |= save(headerErrors, new Diagnostic("EMPTY_HEADER", "Header name is empty",
                            1, fields, fieldLine, fieldColumn));
                }
                Integer first = headerNames.putIfAbsent(name, fields);
                if (first != null) {
                    headerTruncated |= save(headerErrors, new Diagnostic("DUPLICATE_HEADER",
                            "Header repeats field " + first, 1, fields, fieldLine, fieldColumn));
                }
                headerValue.setLength(0);
            }
            state = State.START;
        }

        private void finishRecord() {
            finishField();
            if (records == 0) {
                width = fields;
                headerNames = null;
                headerValue = null;
            } else if (fields != width) {
                widthTruncated |= save(widthErrors, new Diagnostic("ROW_WIDTH",
                        "Expected " + width + " fields; found " + fields, records + 1,
                        Math.min(width, fields) + 1, recordLine, 1));
            }
            records++;
            fields = 0;
            recordTouched = false;
        }

        private void appendHeader(char character) {
            if (headerValue != null) {
                headerValue.append(character);
            }
        }

        private void syntax(String code, String message, int errorLine, int errorColumn) {
            syntaxError = new Diagnostic(code, message, records + 1, fields + 1, errorLine, errorColumn);
        }

        private Report scan(String input) {
            int length = input.length();
            int start = length > 0 && input.charAt(0) == '\uFEFF' ? 1 : 0;
            for (int index = start; index < length; index++) {
                char current = input.charAt(index);
                char next = index + 1 < length ? input.charAt(index + 1) : '\0';
                boolean newline = current == '\r' || current == '\n';
                boolean crlf = current == '\r' && next == '\n';

                if (current == '\0') {
                    syntax("NUL_CHARACTER", "NUL characters are not supported", line, column);
                    break;
                }
                if (state == State.QUOTED) {
                    if (current == '"') {
                        if (next == '"') {
                            appendHeader('"');
                            index++;
                            column += 2;
                            continue;
                        }
                        state = State.CLOSED;
                    } else {
                        appendHeader(current);
                        if (crlf) {
                            appendHeader('\n');
                            index++;
                        }
                    }
                    if (newline) {
                        line++;
                        column = 1;
                    } else {
                        column++;
                    }
                    continue;
                }
                if (current == delimiter) {
                    finishField();
                    recordTouched = true;
                    fieldLine = line;
                    fieldColumn = ++column;
                    continue;
                }
                if (newline) {
                    finishRecord();
                    if (crlf) {
                        index++;
                    }
                    recordLine = ++line;
                    fieldLine = line;
                    column = 1;
                    fieldColumn = 1;
                    continue;
                }
                if (state == State.CLOSED) {
                    syntax("TEXT_AFTER_QUOTE", "Only a delimiter or line ending may follow a closing quote",
                            line, column);
                    break;
                }
                if (current == '"') {
                    if (state != State.START) {
                        syntax("QUOTE_IN_UNQUOTED_FIELD", "A quote must start at the beginning of a field", line, column);
                        break;
                    }
                    state = State.QUOTED;
                } else {
                    state = State.UNQUOTED;
                    appendHeader(current);
                }
                recordTouched = true;
                column++;
            }
            if (syntaxError == null && state == State.QUOTED) {
                syntax("UNCLOSED_QUOTE", "Quoted field is missing a closing quote", fieldLine, fieldColumn);
            }
            if (syntaxError == null && recordTouched) {
                finishRecord();
            }
            List<Diagnostic> diagnostics = new ArrayList<>();
            boolean truncated = widthTruncated || (records > 0 && headerTruncated);
            if (syntaxError != null) {
                diagnostics.add(syntaxError);
            }
            if (start == length) {
                diagnostics.add(new Diagnostic("EMPTY_INPUT", "Input contains no records", 1, 1, 1, 1));
            }
            if (records > 0) {
                for (Diagnostic error : headerErrors) {
                    truncated |= save(diagnostics, error);
                }
            }
            for (Diagnostic error : widthErrors) {
                truncated |= save(diagnostics, error);
            }
            return new Report(diagnostics.isEmpty(), records, records - (header && records > 0 ? 1 : 0),
                    width, header, diagnostics, truncated, syntaxError == null);
        }
    }
}
