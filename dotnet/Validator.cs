using System.Text;

namespace Shipit.CsvValidator;

internal sealed record Diagnostic(string Code, string Message, int Record, int Field, int Line, int Column);

internal sealed record Report(bool Valid, int Records, int DataRecords, int Columns, bool Header,
    IReadOnlyList<Diagnostic> Diagnostics, bool DiagnosticsTruncated, bool ParseComplete);

internal static class Validator
{
    private enum FieldState { Start, Unquoted, Quoted, Closed }

    public static Report Validate(string input, char delimiter, bool header, int maxErrors)
    {
        var source = input.AsSpan();
        if (!source.IsEmpty && source[0] == '\uFEFF')
            source = source[1..];

        var headerNames = new Dictionary<string, int>(StringComparer.Ordinal);
        var headerValue = new StringBuilder();
        var headerErrors = new List<Diagnostic>();
        var widthErrors = new List<Diagnostic>();
        var headerTruncated = false;
        var widthTruncated = false;
        Diagnostic? syntaxError = null;
        var records = 0;
        var fields = 0;
        var width = 0;
        var line = 1;
        var column = 1;
        var recordLine = 1;
        var fieldLine = 1;
        var fieldColumn = 1;
        var state = FieldState.Start;
        var recordTouched = false;

        void SaveError(List<Diagnostic> destination, Diagnostic diagnostic, ref bool truncated)
        {
            if (destination.Count < maxErrors)
                destination.Add(diagnostic);
            else
                truncated = true;
        }

        void FinishField()
        {
            fields++;
            if (header && records == 0)
            {
                var name = headerValue.ToString();
                if (name.Length == 0)
                    SaveError(headerErrors, new("EMPTY_HEADER", "Header name is empty",
                        1, fields, fieldLine, fieldColumn), ref headerTruncated);
                if (headerNames.TryGetValue(name, out var firstField))
                    SaveError(headerErrors, new("DUPLICATE_HEADER", $"Header repeats field {firstField}",
                        1, fields, fieldLine, fieldColumn), ref headerTruncated);
                else
                    headerNames.Add(name, fields);
                headerValue.Clear();
            }
            state = FieldState.Start;
        }

        void FinishRecord()
        {
            FinishField();
            if (records == 0)
            {
                width = fields;
                headerNames.Clear();
                headerValue = new StringBuilder();
            }
            else if (fields != width)
            {
                SaveError(widthErrors, new("ROW_WIDTH", $"Expected {width} fields; found {fields}",
                    records + 1, Math.Min(width, fields) + 1, recordLine, 1), ref widthTruncated);
            }
            records++;
            fields = 0;
            recordTouched = false;
        }

        void AppendHeader(char character)
        {
            if (header && records == 0)
                headerValue.Append(character);
        }

        void Syntax(string code, string message, int errorLine, int errorColumn) =>
            syntaxError = new(code, message, records + 1, fields + 1, errorLine, errorColumn);

        for (var index = 0; index < source.Length; index++)
        {
            var current = source[index];
            var newline = current is '\r' or '\n';
            var crlf = current == '\r' && index + 1 < source.Length && source[index + 1] == '\n';
            if (current == '\0')
            {
                Syntax("NUL_CHARACTER", "NUL characters are not supported", line, column);
                break;
            }

            if (state == FieldState.Quoted)
            {
                if (current == '"')
                {
                    if (index + 1 < source.Length && source[index + 1] == '"')
                    {
                        AppendHeader('"');
                        index++;
                        column += 2;
                        continue;
                    }
                    state = FieldState.Closed;
                }
                else
                {
                    AppendHeader(current);
                    if (crlf)
                    {
                        AppendHeader('\n');
                        index++;
                    }
                }

                if (newline)
                {
                    line++;
                    column = 1;
                }
                else
                    column++;
                continue;
            }

            if (current == delimiter)
            {
                FinishField();
                recordTouched = true;
                fieldLine = line;
                fieldColumn = ++column;
                continue;
            }
            if (newline)
            {
                FinishRecord();
                if (crlf)
                    index++;
                recordLine = fieldLine = ++line;
                column = fieldColumn = 1;
                continue;
            }
            if (state == FieldState.Closed)
            {
                Syntax("TEXT_AFTER_QUOTE", "Only a delimiter or line ending may follow a closing quote",
                    line, column);
                break;
            }
            if (current == '"')
            {
                if (state != FieldState.Start)
                {
                    Syntax("QUOTE_IN_UNQUOTED_FIELD", "A quote must start at the beginning of a field",
                        line, column);
                    break;
                }
                state = FieldState.Quoted;
            }
            else
            {
                state = FieldState.Unquoted;
                AppendHeader(current);
            }
            recordTouched = true;
            column++;
        }

        if (syntaxError is null && state == FieldState.Quoted)
            Syntax("UNCLOSED_QUOTE", "Quoted field is missing a closing quote", fieldLine, fieldColumn);
        if (syntaxError is null && recordTouched)
            FinishRecord();

        var diagnostics = new List<Diagnostic>();
        var truncated = widthTruncated || (records > 0 && headerTruncated);
        if (syntaxError is not null)
            diagnostics.Add(syntaxError);
        if (source.IsEmpty)
            diagnostics.Add(new("EMPTY_INPUT", "Input contains no records", 1, 1, 1, 1));
        if (records > 0)
        {
            foreach (var error in headerErrors)
                SaveError(diagnostics, error, ref truncated);
        }
        foreach (var error in widthErrors)
            SaveError(diagnostics, error, ref truncated);

        return new(diagnostics.Count == 0, records, records - (header && records > 0 ? 1 : 0),
            width, header, diagnostics, truncated, syntaxError is null);
    }
}
