Gem::Specification.new do |spec|
  spec.name = "shipit-csv-validator"
  spec.version = "0.1.0"
  spec.authors = ["Shipit Software"]
  spec.summary = "Validate CSV structure from Ruby or a terminal"
  spec.description = "Check UTF-8 CSV for quoting, header and row width problems with precise diagnostics."
  spec.license = "MIT"
  spec.homepage = "https://csvfile.tools/validate"
  spec.metadata = {
    "homepage_uri" => spec.homepage,
    "source_code_uri" => "https://github.com/shipit-software/csv-validator"
  }
  spec.required_ruby_version = ">= 3.0"
  spec.files = %w[LICENSE README.md exe/shipit-csv-validate lib/shipit/csv_validator.rb]
  spec.bindir = "exe"
  spec.executables = ["shipit-csv-validate"]
end
