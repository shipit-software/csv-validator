# frozen_string_literal: true

require "json"
require "open3"
require "rbconfig"
require "tmpdir"
require_relative "../lib/shipit/csv_validator"

fixture = File.expand_path("../../rust/tests/fixtures/csv-v1.tsv", __dir__)
case_count = 0
File.foreach(fixture, chomp: true) do |row|
  next if row.start_with?("#") || row.empty?

  name, input, delimiter, header, limit, expected = row.split("\t", 6)
  actual = Shipit::CsvValidator.validate([input].pack("H*"), delimiter: [delimiter].pack("H*"),
                                         header: header == "true", max_errors: Integer(limit))
  raise "conformance failure in #{name}: #{actual.inspect}" unless actual == JSON.parse(expected)

  case_count += 1
end
raise "missing conformance cases" if case_count.zero?
puts "#{case_count} conformance cases passed"

def cli(*arguments, input: "")
  source = File.expand_path("..", __dir__)
  Open3.capture3(RbConfig.ruby, "-I#{source}/lib", "#{source}/exe/shipit-csv-validate",
                 *arguments, stdin_data: input, binmode: true)
end

def check(label, code, *args, input: "")
  out, err, status = cli(*args, input: input)
  raise "#{label}: exit #{status.exitstatus}: #{err}" unless status.exitstatus == code

  JSON.parse(out)
end

raise "stdin" unless check("stdin", 0, "--json", input: "id,name\n1,Ada\n")["dataRecords"] == 1
raise "tab" unless check("tab", 0, "--json", "--delimiter", "tab", "-", input: "1\t2")["columns"] == 2
raise "quote" unless check("quote", 1, "--json", input: "x\nabc\"")["diagnostics"][0]["code"] == "QUOTE_IN_UNQUOTED_FIELD"
raise "empty" unless check("empty", 1, "--json")["diagnostics"][0]["code"] == "EMPTY_INPUT"
raise "UTF-8" unless check("UTF-8", 2, "--json", input: "\xff".b)["error"]["code"] == "INPUT_ENCODING"
raise "usage" unless check("usage", 2, "--json", "--delimiter", "xx")["error"]["code"] == "USAGE"
raise "extra path" unless check("extra path", 2, "--json", "one", "two")["error"]["code"] == "USAGE"
raise "missing file" unless check("missing file", 2, "--json", "missing-file.csv")["error"]["code"] == "INPUT_READ"
Dir.mktmpdir do |dir|
  path = File.join(dir, "input.csv")
  File.binwrite(path, "x,y\n0,1")
  raise "file" unless check("file", 0, "--json", "--", path)["columns"] == 2
  File.truncate(path, 32 * 1024 * 1024 + 1)
  raise "size cap" unless check("size cap", 2, "--json", path)["error"]["code"] == "INPUT_LIMIT"
end
version, _, status = cli("--version")
raise "version" unless status.success? && version.chomp == Shipit::CsvValidator::VERSION
puts "11 CLI cases passed"
