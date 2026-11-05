// Package csvvalidator checks the structure of UTF-8 CSV without changing data.
package csvvalidator

import (
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"
)

// Options controls delimiter, header handling, and diagnostic limits.
type Options struct {
	Delimiter rune
	Header    bool
	MaxErrors int
}

// DefaultOptions returns comma-separated validation with a header and 100 diagnostics.
func DefaultOptions() Options {
	return Options{Delimiter: ',', Header: true, MaxErrors: 100}
}

// Check reports unsupported option values.
func (o Options) Check() error {
	if o.Delimiter <= 0 || o.Delimiter > 0xffff || !utf8.ValidRune(o.Delimiter) ||
		o.Delimiter == '"' || o.Delimiter == '\r' || o.Delimiter == '\n' {
		return errors.New("delimiter must be one BMP character other than quote, newline or NUL")
	}
	if o.MaxErrors < 1 || o.MaxErrors > 10000 {
		return errors.New("maximum errors must be 1-10000")
	}
	return nil
}

// Diagnostic describes a CSV problem at one-based coordinates.
type Diagnostic struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Record  int    `json:"record"`
	Field   int    `json:"field"`
	Line    int    `json:"line"`
	Column  int    `json:"column"`
}

// Report summarizes complete records and diagnostics.
type Report struct {
	Valid                bool         `json:"valid"`
	Records              int          `json:"records"`
	DataRecords          int          `json:"dataRecords"`
	Columns              int          `json:"columns"`
	Header               bool         `json:"header"`
	Diagnostics          []Diagnostic `json:"diagnostics"`
	DiagnosticsTruncated bool         `json:"diagnosticsTruncated"`
	ParseComplete        bool         `json:"parseComplete"`
}

type position struct {
	line, column int
}

type fieldState uint8

const (
	fieldStart fieldState = iota
	unquoted
	quoted
	closed
)

// Validate checks UTF-8 CSV using options. Invalid options or UTF-8 return an
// error; invalid CSV returns a report. Diagnostic columns count UTF-16 units.
func Validate(input string, options Options) (Report, error) {
	if err := options.Check(); err != nil {
		return Report{}, err
	}
	if !utf8.ValidString(input) {
		return Report{}, errors.New("input must be valid UTF-8")
	}
	input = strings.TrimPrefix(input, "\ufeff")
	report := Report{Header: options.Header, Diagnostics: []Diagnostic{}, ParseComplete: true}
	at := position{1, 1}
	rowAt, fieldAt := at, at
	state := fieldStart
	fields := 0
	touched := false
	var name strings.Builder
	var headerIssues []Diagnostic
	headerTruncated := false
	seen := make(map[string]int)
	add := func(d Diagnostic) {
		if len(report.Diagnostics) == options.MaxErrors {
			report.DiagnosticsTruncated = true
			return
		}
		report.Diagnostics = append(report.Diagnostics, d)
	}
	headerIssue := func(code, message string) {
		if len(headerIssues) == options.MaxErrors {
			headerTruncated = true
			return
		}
		headerIssues = append(headerIssues, Diagnostic{code, message, 1, fields, fieldAt.line, fieldAt.column})
	}
	appendName := func(text string) {
		if options.Header && report.Records == 0 {
			name.WriteString(text)
		}
	}
	finishField := func() {
		fields++
		state = fieldStart
		if !options.Header || report.Records != 0 {
			return
		}
		value := name.String()
		if value == "" {
			headerIssue("EMPTY_HEADER", "Header name is empty")
		}
		if earlier, exists := seen[value]; exists {
			headerIssue("DUPLICATE_HEADER", fmt.Sprintf("Header repeats field %d", earlier))
		} else {
			seen[value] = fields
		}
		name.Reset()
	}
	finishRecord := func() {
		finishField()
		report.Records++
		if report.Records == 1 {
			report.Columns = fields
			report.Diagnostics = append(report.Diagnostics, headerIssues...)
			report.DiagnosticsTruncated = headerTruncated
			seen, headerIssues = nil, nil
		} else if fields != report.Columns {
			add(Diagnostic{"ROW_WIDTH", fmt.Sprintf("Expected %d fields; found %d", report.Columns, fields),
				report.Records, min(fields, report.Columns) + 1, rowAt.line, rowAt.column})
		}
		fields = 0
		touched = false
	}
	fatal := func(code, message string, p position) {
		report.ParseComplete = false
		if len(report.Diagnostics) == options.MaxErrors {
			report.Diagnostics = report.Diagnostics[:len(report.Diagnostics)-1]
			report.DiagnosticsTruncated = true
		}
		issue := Diagnostic{code, message, report.Records + 1, fields + 1, p.line, p.column}
		report.Diagnostics = append([]Diagnostic{issue}, report.Diagnostics...)
	}
	for offset := 0; offset < len(input); {
		ch, n := utf8.DecodeRuneInString(input[offset:])
		newline := ch == '\r' || ch == '\n'
		if ch == '\r' && offset+n < len(input) && input[offset+n] == '\n' {
			n++
		}
		advance := func() {
			offset += n
			switch {
			case newline:
				at.line++
				at.column = 1
			case ch > 0xffff:
				at.column += 2
			default:
				at.column++
			}
		}
		if ch == 0 {
			fatal("NUL_CHARACTER", "NUL characters are not supported", at)
			break
		}
		if state == quoted {
			if ch == '"' {
				if offset+n < len(input) && input[offset+n] == '"' {
					appendName("\"")
					offset += 2
					at.column += 2
					continue
				}
				state = closed
			} else {
				appendName(input[offset : offset+n])
			}
			advance()
			continue
		}
		switch {
		case ch == options.Delimiter:
			touched = true
			finishField()
			advance()
			fieldAt = at
		case newline:
			finishRecord()
			advance()
			rowAt, fieldAt = at, at
		case state == closed:
			fatal("TEXT_AFTER_QUOTE", "Only a delimiter or line ending may follow a closing quote", at)
		case ch == '"' && state != fieldStart:
			fatal("QUOTE_IN_UNQUOTED_FIELD", "A quote must start at the beginning of a field", at)
		case ch == '"':
			state, touched = quoted, true
			advance()
		default:
			state, touched = unquoted, true
			appendName(input[offset : offset+n])
			advance()
		}
		if !report.ParseComplete {
			break
		}
	}
	if report.ParseComplete && state == quoted {
		fatal("UNCLOSED_QUOTE", "Quoted field is missing a closing quote", fieldAt)
	}
	if report.ParseComplete && touched {
		finishRecord()
	}
	if input == "" {
		add(Diagnostic{"EMPTY_INPUT", "Input contains no records", 1, 1, 1, 1})
	}
	report.DataRecords = report.Records
	if options.Header && report.Records != 0 {
		report.DataRecords--
	}
	report.Valid = len(report.Diagnostics) == 0
	return report, nil
}
