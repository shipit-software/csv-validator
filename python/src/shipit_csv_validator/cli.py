"""Bounded UTF-8 CSV command-line input; never writes the source file."""
import json
import re
import sys

from . import __version__
from .validate import _units, validate_csv

LIMIT = 32 * 1024 * 1024
HELP = """Usage: shipit-csv-validate [options] [FILE|-]
Validate a UTF-8 CSV file or standard input without changing its contents.

Options:
  --json              Print a stable JSON report
  --delimiter CHAR    Use one delimiter character (use "tab" for a tab)
  --no-header         Treat the first record as data
  --max-errors N      Maximum reported diagnostics (1-10000; default 100)
  --help              Show this help
  --version           Show the version
  --                  End options; allows filenames starting with a dash

Exit codes: 0 valid, 1 invalid CSV, 2 usage or input error.
Limit: buffered UTF-8 input, up to 32 MiB. No type/schema inference.
"""


def _fail(json_mode, code, message):
    if json_mode:
        print(json.dumps({"valid": False, "error": {"code": code, "message": message}},
                         ensure_ascii=True, separators=(",", ":")))
    else:
        print(message, file=sys.stderr)
    return 2


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    boundary = args.index("--") if "--" in args else len(args)
    json_mode = "--json" in args[:boundary]
    delimiter, header, max_errors, filename = ",", True, 100, None
    end_options = False
    index = 0
    try:
        while index < len(args):
            argument = args[index]
            index += 1
            if not end_options and argument == "--":
                end_options = True
                continue
            if not end_options and argument == "--json":
                continue
            if not end_options and argument == "--help":
                print(HELP, end="")
                return 0
            if not end_options and argument == "--version":
                print(__version__)
                return 0
            if not end_options and argument == "--no-header":
                header = False
                continue
            if not end_options and argument in ("--delimiter", "--max-errors"):
                raw = args[index] if index < len(args) else None
                index += 1
                if argument == "--delimiter":
                    delimiter = "\t" if raw == "tab" else raw
                    if (not isinstance(delimiter, str) or len(_units(delimiter)) != 1
                            or delimiter in ('"', "\r", "\n", "\0")):
                        raise TypeError("Delimiter must be one character other than quote, newline or NUL")
                else:
                    if raw is None or len(raw) > 5 or not re.fullmatch(r"[1-9][0-9]*", raw) or int(raw) > 10000:
                        raise TypeError("Maximum errors must be 1-10000")
                    max_errors = int(raw)
                continue
            if not end_options and argument.startswith("-") and argument != "-":
                raise TypeError("Unknown option; use --help")
            if filename is not None:
                raise TypeError("Provide one file, or standard input")
            filename = argument
    except TypeError as error:
        return _fail(json_mode, "USAGE", str(error))
    try:
        if filename is None or filename == "-":
            data = sys.stdin.buffer.read(LIMIT + 1)
        else:
            with open(filename, "rb") as source:
                data = source.read(LIMIT + 1)
    except (OSError, ValueError):
        return _fail(json_mode, "INPUT_READ", "Could not read input")
    if len(data) > LIMIT:
        return _fail(json_mode, "INPUT_LIMIT", "Input exceeds the 32 MiB limit")
    try:
        text = data.decode("utf-8", "strict")
    except UnicodeDecodeError:
        return _fail(json_mode, "INPUT_ENCODING", "Input must be valid UTF-8")
    report = validate_csv(text, delimiter=delimiter, header=header, max_errors=max_errors)
    if json_mode:
        print(json.dumps(report, ensure_ascii=True, separators=(",", ":")))
    elif report["valid"]:
        print(f'Valid CSV: {report["dataRecords"]} data records, {report["columns"]} columns')
    else:
        for issue in report["diagnostics"]:
            print(f'{issue["code"]}: record {issue["record"]}, field {issue["field"]}, '
                  f'line {issue["line"]}, column {issue["column"]}: {issue["message"]}')
        if report["diagnosticsTruncated"]:
            print("Additional diagnostics omitted")
    return 0 if report["valid"] else 1
