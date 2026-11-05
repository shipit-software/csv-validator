package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"unicode/utf8"

	validator "github.com/shipit-software/csv-validator/go"
)

const inputLimit = 32 * 1024 * 1024
const version = "0.1.0"

const help = `Usage: shipit-csv-validate [options] [FILE|-]
Validate UTF-8 CSV from a file or standard input.

  --json              Print a JSON report
  --delimiter CHAR    Use a different delimiter (use "tab" for a tab)
  --no-header         Treat the first record as data
  --max-errors N      Cap diagnostics (1-10000, default 100)
  --help              Show help
  --version           Show the version
  --                  End options

Exit codes: 0 valid, 1 invalid CSV, 2 usage or input error.
Input is buffered and limited to 32 MiB. No type or schema inference.
`

type settings struct {
	options validator.Options
	path    string
	action  string
}

func parse(args []string) (settings, error) {
	s := settings{options: validator.DefaultOptions()}
	hasPath, endOptions := false, false
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if !endOptions {
			switch arg {
			case "--":
				endOptions = true
				continue
			case "--json":
				continue
			case "--help", "--version":
				s.action = arg
				return s, nil
			case "--no-header":
				s.options.Header = false
				continue
			case "--delimiter", "--max-errors":
				if i+1 == len(args) {
					return s, errors.New("missing option value")
				}
				i++
				raw := args[i]
				if arg == "--delimiter" {
					if raw == "tab" {
						raw = "\t"
					}
					if !utf8.ValidString(raw) || utf8.RuneCountInString(raw) != 1 {
						return s, errors.New("delimiter must be one UTF-8 character")
					}
					s.options.Delimiter, _ = utf8.DecodeRuneInString(raw)
				} else {
					n, err := strconv.Atoi(raw)
					if err != nil || strconv.Itoa(n) != raw {
						return s, errors.New("maximum errors must be 1-10000")
					}
					s.options.MaxErrors = n
				}
				continue
			}
			if strings.HasPrefix(arg, "-") && arg != "-" {
				return s, errors.New("unknown option; use --help")
			}
		}
		if hasPath {
			return s, errors.New("provide one file, or standard input")
		}
		s.path, hasPath = arg, true
	}
	return s, s.options.Check()
}

func wantsJSON(args []string) bool {
	for _, arg := range args {
		switch arg {
		case "--":
			return false
		case "--json":
			return true
		}
	}
	return false
}

type inputError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func run(args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	asJSON := wantsJSON(args)
	fail := func(code, message string) int {
		if asJSON {
			json.NewEncoder(stdout).Encode(struct {
				Valid bool       `json:"valid"`
				Error inputError `json:"error"`
			}{false, inputError{code, message}})
		} else {
			fmt.Fprintln(stderr, message)
		}
		return 2
	}
	s, err := parse(args)
	if err != nil {
		return fail("USAGE", err.Error())
	}
	switch s.action {
	case "--help":
		fmt.Fprint(stdout, help)
		return 0
	case "--version":
		fmt.Fprintln(stdout, version)
		return 0
	}
	if s.path != "" && s.path != "-" {
		file, err := os.Open(s.path)
		if err != nil {
			return fail("INPUT_READ", "Could not read input")
		}
		defer file.Close()
		stdin = file
	}
	data, err := io.ReadAll(io.LimitReader(stdin, inputLimit+1))
	if err != nil {
		return fail("INPUT_READ", "Could not read input")
	}
	if len(data) > inputLimit {
		return fail("INPUT_LIMIT", "Input exceeds the 32 MiB limit")
	}
	report, err := validator.Validate(string(data), s.options)
	if err != nil {
		return fail("INPUT_ENCODING", err.Error())
	}
	if asJSON {
		json.NewEncoder(stdout).Encode(report)
	} else if report.Valid {
		fmt.Fprintf(stdout, "Valid CSV: %d data records, %d columns\n", report.DataRecords, report.Columns)
	} else {
		for _, issue := range report.Diagnostics {
			fmt.Fprintf(stdout, "%s: record %d, field %d, line %d, column %d: %s\n",
				issue.Code, issue.Record, issue.Field, issue.Line, issue.Column, issue.Message)
		}
		if report.DiagnosticsTruncated {
			fmt.Fprintln(stdout, "Additional diagnostics omitted")
		}
	}
	if report.Valid {
		return 0
	}
	return 1
}

func main() {
	os.Exit(run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr))
}
