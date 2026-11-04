use shipit_csv_validator::{json_string, validate_csv, Options, OptionsError};
use std::{io::Write, process::{Command, Stdio}};

fn decode_hex(value: &str) -> String {
    let bytes = (0..value.len()).step_by(2).map(|i| u8::from_str_radix(&value[i..i+2],16).unwrap()).collect();
    String::from_utf8(bytes).unwrap()
}

#[test]
fn shared_contract_v1() {
    let mut count = 0;
    for line in include_str!("fixtures/csv-v1.tsv").lines().filter(|line| !line.starts_with('#') && !line.is_empty()) {
        let row: Vec<_> = line.split('\t').collect();
        assert_eq!(row.len(),6);
        let input = decode_hex(row[1]);
        let options = Options { delimiter: decode_hex(row[2]).chars().next().unwrap(), header: row[3].parse().unwrap(), max_errors: row[4].parse().unwrap() };
        assert_eq!(validate_csv(&input,options).unwrap().to_json(),row[5],"case {}",row[0]);
        count += 1;
    }
    assert_eq!(count,22);
}

#[test]
fn invalid_options_and_json_escaping() {
    for delimiter in ['"','\r','\n','\0','🦆'] {
        assert_eq!(validate_csv("a",Options{delimiter,..Options::default()}),Err(OptionsError::Delimiter));
    }
    for max_errors in [0,10001,usize::MAX] {
        assert_eq!(validate_csv("a",Options{max_errors,..Options::default()}),Err(OptionsError::MaximumErrors));
    }
    assert_eq!(json_string("\"\\\t\n\r\u{0001}🦆"),"\"\\\"\\\\\\t\\n\\r\\u0001🦆\"");
}

fn cli(args: &[&str], input: &[u8]) -> std::process::Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_shipit-csv-validate")).args(args)
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
    if let Some(mut stdin) = child.stdin.take() { let _ = stdin.write_all(input); }
    child.wait_with_output().unwrap()
}

#[test]
fn cli_exit_codes_and_encoding() {
    assert_eq!(cli(&["--json"], b"a,b\n1,2").status.code(),Some(0));
    let invalid = cli(&["--json"],b"a,b\n1");
    assert_eq!(invalid.status.code(),Some(1));
    assert!(String::from_utf8(invalid.stdout).unwrap().contains("ROW_WIDTH"));
    let encoding = cli(&["--json"],&[0xff]);
    assert_eq!(encoding.status.code(),Some(2));
    assert!(String::from_utf8(encoding.stdout).unwrap().contains("INPUT_ENCODING"));
    let missing = cli(&["--json","/missing-input.csv"],b"");
    assert_eq!(missing.status.code(),Some(2));
    let output = String::from_utf8(missing.stdout).unwrap();
    assert!(output.contains("INPUT_READ")); assert!(!output.contains("/missing"));
}

#[test]
fn cli_arguments_and_input_limit() {
    for args in [vec!["--unknown","--json"],vec!["--json","--delimiter"],vec!["--json","--max-errors","01"],vec!["--json","--delimiter","🦆"]] {
        let result = cli(&args,b"");
        assert_eq!(result.status.code(),Some(2));
        assert!(String::from_utf8(result.stdout).unwrap().contains("USAGE"));
        assert!(result.stderr.is_empty());
    }
    assert_eq!(cli(&["--help"],b"").status.code(),Some(0));
    assert_eq!(cli(&["--version"],b"").stdout,b"0.1.0\n");
    assert_eq!(cli(&["--json","--delimiter","tab","--no-header"],b"a\ta\n1\t2").status.code(),Some(0));
    let boundary = cli(&["--","--json"],b"");
    assert!(boundary.stdout.is_empty()); assert_eq!(boundary.stderr,b"Could not read input\n");
    let limit = cli(&["--json"],&vec![b'a';32*1024*1024+1]);
    assert_eq!(limit.status.code(),Some(2));
    assert!(String::from_utf8(limit.stdout).unwrap().contains("INPUT_LIMIT"));
}

#[test]
fn cli_reads_explicit_file_and_preserves_contents() {
    let directory = std::env::temp_dir().join(format!("shipit-csv-file-{}-{}",std::process::id(),
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
    std::fs::create_dir(&directory).unwrap();
    let path = directory.join("--json");
    let bytes = b"id,name\r\n001,Ada\r\n";
    std::fs::write(&path,bytes).unwrap();
    let result = cli(&["--json","--",path.to_str().unwrap()],b"");
    let after = std::fs::read(&path).unwrap();
    std::fs::remove_file(&path).unwrap();
    std::fs::remove_dir(&directory).unwrap();
    assert_eq!(result.status.code(),Some(0));
    assert_eq!(after,bytes);
    assert!(String::from_utf8(result.stdout).unwrap().contains("\"dataRecords\":1"));
}
