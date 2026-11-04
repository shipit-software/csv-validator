//! Local, dependency-free CSV validation. Values remain strings and are never evaluated.
//! Positions use one-based records/fields/lines and UTF-16 source columns.
use std::collections::HashMap;

#[derive(Clone, Copy, Debug)]
pub struct Options { pub delimiter: char, pub header: bool, pub max_errors: usize }
impl Default for Options {
    fn default() -> Self { Self { delimiter: ',', header: true, max_errors: 100 } }
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Diagnostic {
    pub code: &'static str, pub message: String,
    pub record: usize, pub field: usize, pub line: usize, pub column: usize,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Report {
    pub valid: bool, pub records: usize, pub data_records: usize, pub columns: usize,
    pub header: bool, pub diagnostics: Vec<Diagnostic>, pub diagnostics_truncated: bool,
    pub parse_complete: bool,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OptionsError { Delimiter, MaximumErrors }
impl std::fmt::Display for OptionsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::Delimiter => "Delimiter must be one character other than quote, newline or NUL",
            Self::MaximumErrors => "Maximum errors must be 1-10000",
        })
    }
}
impl std::error::Error for OptionsError {}

#[derive(Clone, Copy, PartialEq)]
enum State { Start, Plain, Quoted, Closed }
struct Field { value: String, line: usize, column: usize }
struct Row { fields: Vec<Field>, line: usize, column: usize }

fn add(diagnostics: &mut Vec<Diagnostic>, truncated: &mut bool, max: usize, issue: Diagnostic) {
    if diagnostics.len() < max { diagnostics.push(issue); } else { *truncated = true; }
}
fn issue(code: &'static str, message: impl Into<String>, record: usize, field: usize, line: usize, column: usize) -> Diagnostic {
    Diagnostic { code, message: message.into(), record, field, line, column }
}

/// Validate the complete CSV text. One leading BOM is ignored. No input-size limit
/// is imposed by this library; the command-line program caps input at 32 MiB.
/// Delimiters must occupy exactly one UTF-16 code unit, matching the JavaScript API.
pub fn validate_csv(input: &str, options: Options) -> Result<Report, OptionsError> {
    if options.delimiter.len_utf16() != 1 || ['"', '\r', '\n', '\0'].contains(&options.delimiter) {
        return Err(OptionsError::Delimiter);
    }
    if !(1..=10000).contains(&options.max_errors) { return Err(OptionsError::MaximumErrors); }
    let source = input.strip_prefix('\u{feff}').unwrap_or(input);
    let chars: Vec<char> = source.chars().collect();
    let mut rows: Vec<Row> = Vec::new();
    let mut diagnostics = Vec::new();
    let mut truncated = false;
    let (mut record, mut line, mut column) = (1, 1, 1);
    let (mut row_start, mut field_start) = ((1, 1), (1, 1));
    let mut fields = Vec::new();
    let mut value = String::new();
    let mut state = State::Start;
    let (mut touched, mut fatal) = (false, false);
    let mut index = 0;
    while index < chars.len() {
        let ch = chars[index];
        let newline = ch == '\r' || ch == '\n';
        let crlf = ch == '\r' && chars.get(index + 1) == Some(&'\n');
        if ch == '\0' {
            add(&mut diagnostics, &mut truncated, options.max_errors,
                issue("NUL_CHARACTER", "NUL characters are not supported", record, fields.len()+1, line, column));
            fatal = true; break;
        }
        if state == State::Quoted {
            touched = true;
            if ch == '"' {
                if chars.get(index + 1) == Some(&'"') {
                    value.push('"'); index += 2; column += 2; continue;
                }
                state = State::Closed;
            } else {
                value.push(ch);
                if crlf { value.push('\n'); index += 1; }
            }
            if newline { line += 1; column = 1; } else { column += ch.len_utf16(); }
            index += 1; continue;
        }
        if ch == options.delimiter {
            touched = true;
            fields.push(Field { value: std::mem::take(&mut value), line: field_start.0, column: field_start.1 });
            state = State::Start; column += 1; field_start = (line, column);
            index += 1; continue;
        }
        if newline {
            fields.push(Field { value: std::mem::take(&mut value), line: field_start.0, column: field_start.1 });
            state = State::Start;
            rows.push(Row { fields: std::mem::take(&mut fields), line: row_start.0, column: row_start.1 });
            record += 1; touched = false;
            if crlf { index += 1; }
            line += 1; column = 1; row_start = (line, column); field_start = row_start;
            index += 1; continue;
        }
        if state == State::Closed {
            add(&mut diagnostics, &mut truncated, options.max_errors,
                issue("TEXT_AFTER_QUOTE", "Only a delimiter or line ending may follow a closing quote", record, fields.len()+1, line, column));
            fatal = true; break;
        }
        if ch == '"' {
            if state != State::Start {
                add(&mut diagnostics, &mut truncated, options.max_errors,
                    issue("QUOTE_IN_UNQUOTED_FIELD", "A quote must start at the beginning of a field", record, fields.len()+1, line, column));
                fatal = true; break;
            }
            state = State::Quoted;
        } else { value.push(ch); state = State::Plain; }
        touched = true; column += ch.len_utf16(); index += 1;
    }
    if !fatal && state == State::Quoted {
        add(&mut diagnostics, &mut truncated, options.max_errors,
            issue("UNCLOSED_QUOTE", "Quoted field is missing a closing quote", record, fields.len()+1, field_start.0, field_start.1));
        fatal = true;
    }
    if !fatal && (touched || !fields.is_empty() || !value.is_empty()) {
        fields.push(Field { value, line: field_start.0, column: field_start.1 });
        rows.push(Row { fields, line: row_start.0, column: row_start.1 });
    }
    let width = rows.first().map_or(0, |row| row.fields.len());
    if source.is_empty() {
        add(&mut diagnostics, &mut truncated, options.max_errors, issue("EMPTY_INPUT", "Input contains no records", 1, 1, 1, 1));
    }
    if options.header {
        if let Some(row) = rows.first() {
            let mut seen = HashMap::new();
            for (index, field) in row.fields.iter().enumerate() {
                if field.value.is_empty() {
                    add(&mut diagnostics, &mut truncated, options.max_errors,
                        issue("EMPTY_HEADER", "Header name is empty", 1, index+1, field.line, field.column));
                }
                if let Some(previous) = seen.get(&field.value) {
                    add(&mut diagnostics, &mut truncated, options.max_errors,
                        issue("DUPLICATE_HEADER", format!("Header repeats field {previous}"), 1, index+1, field.line, field.column));
                } else { seen.insert(&field.value, index+1); }
            }
        }
    }
    for (index, row) in rows.iter().enumerate() {
        if row.fields.len() != width {
            add(&mut diagnostics, &mut truncated, options.max_errors,
                issue("ROW_WIDTH", format!("Expected {width} fields; found {}", row.fields.len()), index+1,
                    width.min(row.fields.len())+1, row.line, row.column));
        }
    }
    Ok(Report { valid: diagnostics.is_empty(), records: rows.len(),
        data_records: rows.len().saturating_sub(usize::from(options.header && !rows.is_empty())),
        columns: width, header: options.header, diagnostics,
        diagnostics_truncated: truncated, parse_complete: !fatal })
}

/// Encode a JSON string without a serialization dependency.
pub fn json_string(value: &str) -> String {
    let mut out = String::from("\"");
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""), '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"), '\r' => out.push_str("\\r"), '\t' => out.push_str("\\t"),
            ch if ch < ' ' => out.push_str(&format!("\\u{:04x}", ch as u32)),
            ch => out.push(ch),
        }
    }
    out.push('"'); out
}
impl Report {
    /// JSON property names and diagnostic order match the JavaScript report.
    pub fn to_json(&self) -> String {
        let diagnostics = self.diagnostics.iter().map(|d| format!(
            "{{\"code\":{},\"message\":{},\"record\":{},\"field\":{},\"line\":{},\"column\":{}}}",
            json_string(d.code), json_string(&d.message), d.record, d.field, d.line, d.column)).collect::<Vec<_>>().join(",");
        format!("{{\"valid\":{},\"records\":{},\"dataRecords\":{},\"columns\":{},\"header\":{},\"diagnostics\":[{}],\"diagnosticsTruncated\":{},\"parseComplete\":{}}}",
            self.valid, self.records, self.data_records, self.columns, self.header, diagnostics, self.diagnostics_truncated, self.parse_complete)
    }
}
