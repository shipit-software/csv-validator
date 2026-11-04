import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from shipit_csv_validator import validate_csv

ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / "rust/tests/fixtures/csv-v1.tsv"


class ValidatorTests(unittest.TestCase):
    def test_shared_conformance_v1(self):
        cases = 0
        for raw in CORPUS.read_text(encoding="utf-8").splitlines():
            if raw.startswith("#"):
                continue
            name, encoded, delimiter, header, maximum, expected = raw.split("\t")
            with self.subTest(case=name):
                actual = validate_csv(bytes.fromhex(encoded).decode("utf-8"),
                                      delimiter=bytes.fromhex(delimiter).decode("utf-8"),
                                      header=header == "true", max_errors=int(maximum))
                self.assertEqual(actual, json.loads(expected))
            cases += 1
        self.assertEqual(cases, 22)

    def test_invalid_options_and_strict_types(self):
        for text, options in [(None, {}), ("x", {"delimiter": "🦆"}),
                              ("x", {"delimiter": '"'}), ("x", {"header": 1}),
                              ("x", {"max_errors": True}), ("x", {"max_errors": 0}),
                              ("x", {"max_errors": 10001}), ("x", {"max_errors": 1.0})]:
            with self.subTest(text=text, options=options), self.assertRaises(TypeError):
                validate_csv(text, **options)

    def test_utf16_api_surrogate_parity(self):
        self.assertEqual(validate_csv("🦆,🦆")["diagnostics"][0]["column"], 4)
        self.assertEqual(validate_csv("\ud83e\udd86,🦆")["diagnostics"][0]["code"], "DUPLICATE_HEADER")
        report = validate_csv('a,b\n1,"🦆"x')
        self.assertEqual(report["diagnostics"][0]["column"], 7)

    def run_cli(self, args=(), data=b"id,name\n001,Ada", cwd=None):
        return subprocess.run([sys.executable, "-m", "shipit_csv_validator", *args],
                              input=data, capture_output=True, cwd=cwd, check=False,
                              timeout=30, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))

    def test_cli_stdin_json_and_human_output(self):
        result = self.run_cli(["--json"])
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout), validate_csv("id,name\n001,Ada"))
        human = self.run_cli()
        self.assertEqual(human.stdout, b"Valid CSV: 1 data records, 2 columns\n")
        self.assertEqual(human.stderr, b"")

    def test_cli_file_dash_name_spaces_and_preservation(self):
        with tempfile.TemporaryDirectory() as temporary:
            filename = Path(temporary) / "-input with spaces.csv"
            data = b'id,note\r\n001,"two\r\nlines"\r\n'
            filename.write_bytes(data)
            before = hashlib.sha256(data).hexdigest()
            result = self.run_cli(["--json", "--", filename.name], cwd=temporary)
            self.assertEqual(result.returncode, 0)
            self.assertEqual(json.loads(result.stdout)["records"], 2)
            self.assertEqual(hashlib.sha256(filename.read_bytes()).hexdigest(), before)

    def test_cli_invalid_encoding_read_and_usage_errors(self):
        for args, data, code in [(["--json"], b"\xff", "INPUT_ENCODING"),
                                 (["--json", "/definitely-not-a-file.csv"], b"", "INPUT_READ"),
                                 (["--invalid", "--json"], b"", "USAGE"),
                                 (["--json", "--max-errors", "0"], b"", "USAGE"),
                                 (["--json", "--max-errors", "1" * 10000], b"", "USAGE"),
                                 (["--delimiter", "🦆", "--json"], b"", "USAGE"),
                                 (["--json", "one", "two"], b"", "USAGE")]:
            with self.subTest(args=args):
                result = self.run_cli(args, data)
                self.assertEqual(result.returncode, 2)
                self.assertEqual(json.loads(result.stdout)["error"]["code"], code)
                self.assertEqual(result.stderr, b"")

    def test_cli_invalid_csv_and_limits(self):
        result = self.run_cli(["--json"], b"a,b\n1")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(result.stdout)["diagnostics"][0]["code"], "ROW_WIDTH")
        large = self.run_cli(["--json"], b"x" * (32 * 1024 * 1024 + 1))
        self.assertEqual(large.returncode, 2)
        self.assertEqual(json.loads(large.stdout)["error"]["code"], "INPUT_LIMIT")

    def test_cli_options_help_and_version(self):
        result = self.run_cli(["--json", "--delimiter", "tab", "--no-header"], b"a\tb\n1\t2")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout)["dataRecords"], 2)
        self.assertEqual(self.run_cli(["--version"]).stdout, b"0.1.0\n")
        self.assertIn(b"Usage:", self.run_cli(["--help"]).stdout)


if __name__ == "__main__":
    unittest.main()
