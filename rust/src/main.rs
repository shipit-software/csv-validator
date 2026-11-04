use std::{env, fs::File, io::{self, Read}, process::ExitCode};
use shipit_csv_validator::{json_string, validate_csv, Options};
const LIMIT: u64 = 32 * 1024 * 1024;
const HELP: &str = "Usage: shipit-csv-validate [options] [FILE|-]\nValidate UTF-8 CSV locally without changing values.\n\nOptions: --json --delimiter CHAR --no-header --max-errors N --help --version\nUse delimiter 'tab' for TSV. Use -- before a filename starting with a dash.\nExit codes: 0 valid, 1 invalid CSV, 2 usage or input error.\nInput limit: 32 MiB. No schema/type inference.\n";
fn fail(json: bool, code: &str, message: &str) -> ExitCode {
    if json { println!("{{\"valid\":false,\"error\":{{\"code\":{},\"message\":{}}}}}", json_string(code), json_string(message)); }
    else { eprintln!("{message}"); }
    ExitCode::from(2)
}
fn main() -> ExitCode {
    let args: Vec<String> = match env::args_os().skip(1).map(|a| a.into_string()).collect() {
        Ok(args) => args, Err(_) => return fail(false, "USAGE", "Arguments must be valid Unicode"),
    };
    let boundary = args.iter().position(|a| a == "--").unwrap_or(args.len());
    let json = args[..boundary].iter().any(|a| a == "--json");
    let mut options = Options::default();
    let (mut file, mut end_options, mut index) = (None, false, 0);
    while index < args.len() {
        let arg = &args[index];
        if !end_options {
            match arg.as_str() {
                "--" => { end_options = true; index += 1; continue; }
                "--json" => { index += 1; continue; }
                "--help" => { print!("{HELP}"); return ExitCode::SUCCESS; }
                "--version" => { println!("0.1.0"); return ExitCode::SUCCESS; }
                "--no-header" => { options.header = false; index += 1; continue; }
                "--delimiter" => {
                    index += 1;
                    let value = args.get(index).map(String::as_str).unwrap_or("");
                    let value = if value == "tab" { "\t" } else { value };
                    let mut chars = value.chars();
                    match (chars.next(), chars.next()) {
                        (Some(c), None) if c.len_utf16() == 1 && !['"','\r','\n','\0'].contains(&c) => options.delimiter = c,
                        _ => return fail(json, "USAGE", "Delimiter must be one character other than quote, newline or NUL"),
                    }
                    index += 1; continue;
                }
                "--max-errors" => {
                    index += 1;
                    let raw = args.get(index).map(String::as_str).unwrap_or("");
                    if raw.is_empty() || raw.starts_with('0') || !raw.bytes().all(|b| b.is_ascii_digit()) {
                        return fail(json, "USAGE", "Maximum errors must be 1-10000");
                    }
                    options.max_errors = match raw.parse::<usize>() {
                        Ok(n) if (1..=10000).contains(&n) => n,
                        _ => return fail(json, "USAGE", "Maximum errors must be 1-10000"),
                    };
                    index += 1; continue;
                }
                a if a.starts_with('-') && a != "-" => return fail(json, "USAGE", "Unknown option; use --help"),
                _ => {}
            }
        }
        if file.is_some() { return fail(json, "USAGE", "Provide one file, or standard input"); }
        file = Some(arg); index += 1;
    }
    let mut input: Box<dyn Read> = match file.map(String::as_str) {
        None | Some("-") => Box::new(io::stdin()),
        Some(path) => match File::open(path) {
            Ok(file) => Box::new(file), Err(_) => return fail(json, "INPUT_READ", "Could not read input"),
        },
    };
    let mut bytes = Vec::new();
    if input.by_ref().take(LIMIT+1).read_to_end(&mut bytes).is_err() { return fail(json, "INPUT_READ", "Could not read input"); }
    if bytes.len() as u64 > LIMIT { return fail(json, "INPUT_LIMIT", "Input exceeds the 32 MiB limit"); }
    let text = match std::str::from_utf8(&bytes) {
        Ok(text) => text, Err(_) => return fail(json, "INPUT_ENCODING", "Input must be valid UTF-8"),
    };
    let report = match validate_csv(text, options) {
        Ok(report) => report, Err(error) => return fail(json, "USAGE", &error.to_string()),
    };
    if json { println!("{}", report.to_json()); }
    else if report.valid { println!("Valid CSV: {} data records, {} columns", report.data_records, report.columns); }
    else {
        for d in &report.diagnostics { println!("{}: record {}, field {}, line {}, column {}: {}", d.code, d.record, d.field, d.line, d.column, d.message); }
        if report.diagnostics_truncated { println!("Additional diagnostics omitted"); }
    }
    ExitCode::from(if report.valid { 0 } else { 1 })
}
