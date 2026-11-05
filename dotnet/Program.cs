using System.Globalization;
using System.Text;
using System.Text.Json;

namespace Shipit.CsvValidator;

internal static class Program
{
    private const int InputLimit = 32 * 1024 * 1024;
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly UTF8Encoding Utf8 = new(false, true);
    private const string Help = """
        Usage: shipit-csv-validate [options] [FILE|-]
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

    public static int Main(string[] args)
    {
        CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;
        var optionEnd = Array.IndexOf(args, "--");
        var json = args.Take(optionEnd < 0 ? args.Length : optionEnd).Contains("--json");
        var endOptions = false;
        var header = true;
        var delimiter = ',';
        var maxErrors = 100;
        string? file = null;

        int Fail(string code, string message)
        {
            if (json)
                Console.WriteLine(JsonSerializer.Serialize(new { valid = false, error = new { code, message } }, Json));
            else
                Console.Error.WriteLine(message);
            return 2;
        }

        for (var index = 0; index < args.Length; index++)
        {
            var argument = args[index];
            if (!endOptions)
            {
                switch (argument)
                {
                    case "--":
                        endOptions = true;
                        continue;
                    case "--json":
                        continue;
                    case "--no-header":
                        header = false;
                        continue;
                    case "--help":
                        Console.WriteLine(Help);
                        return 0;
                    case "--version":
                        var version = typeof(Program).Assembly.GetName().Version!;
                        Console.WriteLine(version.ToString(3));
                        return 0;
                    case "--delimiter":
                        var value = ++index < args.Length ? args[index] : "";
                        if (value == "tab")
                            value = "\t";
                        if (value.Length != 1 || char.IsSurrogate(value[0]) || value[0] is '"' or '\r' or '\n' or '\0')
                            return Fail("USAGE", "Delimiter must be one BMP character other than quote, newline or NUL");
                        delimiter = value[0];
                        continue;
                    case "--max-errors":
                        var limit = ++index < args.Length ? args[index] : "";
                        if (limit.Length == 0 || limit[0] == '0' ||
                            !int.TryParse(limit, NumberStyles.None, CultureInfo.InvariantCulture, out maxErrors) ||
                            maxErrors is < 1 or > 10000)
                            return Fail("USAGE", "Maximum errors must be 1-10000");
                        continue;
                }
                if (argument.StartsWith('-') && argument != "-")
                    return Fail("USAGE", "Unknown option; use --help");
            }

            if (file is not null)
                return Fail("USAGE", "Provide one file, or standard input");
            file = argument;
        }

        string source;
        try
        {
            using var input = file is null or "-" ? Console.OpenStandardInput() : File.OpenRead(file);
            using var bytes = new MemoryStream();
            var buffer = new byte[65536];
            int count;
            while ((count = input.Read(buffer)) != 0)
            {
                if (bytes.Length + count > InputLimit)
                    return Fail("INPUT_LIMIT", "Input exceeds the 32 MiB limit");
                bytes.Write(buffer, 0, count);
            }
            source = Utf8.GetString(bytes.GetBuffer(), 0, (int)bytes.Length);
        }
        catch (DecoderFallbackException)
        {
            return Fail("INPUT_ENCODING", "Input must be valid UTF-8");
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or ArgumentException)
        {
            return Fail("INPUT_READ", "Could not read input");
        }

        var report = Validator.Validate(source, delimiter, header, maxErrors);
        if (json)
            Console.WriteLine(JsonSerializer.Serialize(report, Json));
        else if (report.Valid)
            Console.WriteLine($"Valid CSV: {report.DataRecords} data records, {report.Columns} columns");
        else
        {
            foreach (var issue in report.Diagnostics)
                Console.WriteLine($"{issue.Code}: record {issue.Record}, field {issue.Field}, line {issue.Line}, column {issue.Column}: {issue.Message}");
            if (report.DiagnosticsTruncated)
                Console.WriteLine("Additional diagnostics omitted");
        }
        return report.Valid ? 0 : 1;
    }
}
