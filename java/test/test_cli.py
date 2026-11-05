
"""Conformance and command-line smoke tests against the final executable JAR."""

import json
from pathlib import Path
import subprocess
import sys
import tempfile


jar, fixture = map(Path, sys.argv[1:])


def run(*args, data=b"", cwd=None):
    return subprocess.run(
        ["java", "-jar", str(jar.resolve()), *args],
        input=data,
        capture_output=True,
        cwd=cwd,
        timeout=15,
        check=False,
    )


def check_error(code, *args, data=b""):
    result = run("--json", *args, data=data)
    assert result.returncode == 2 and not result.stderr, result
    report = json.loads(result.stdout)
    assert report["valid"] is False and report["error"]["code"] == code, report


cases = 0
for row in fixture.read_text(encoding="utf-8").splitlines():
    if not row or row.startswith("#"):
        continue
    name, source, delimiter, header, limit, expected = row.split("\t", 5)
    expected = json.loads(expected)
    args = ["--json", "--delimiter", bytes.fromhex(delimiter).decode("utf-8"), "--max-errors", limit]
    if header == "false":
        args.append("--no-header")
    result = run(*args, data=bytes.fromhex(source))
    assert result.returncode == (0 if expected["valid"] else 1), (name, result)
    assert not result.stderr and json.loads(result.stdout) == expected, (name, result)
    cases += 1
assert cases >= 22

check_error("INPUT_ENCODING", data=b"\xff")
check_error("INPUT_LIMIT", data=b"a" * (32 * 1024 * 1024 + 1))
check_error("INPUT_READ", "/path-that-does-not-exist.csv")
check_error("USAGE", "--max-errors", "01")
check_error("USAGE", "--max-errors", "10001")
check_error("USAGE", "--delimiter", "😀")
check_error("USAGE", "--unknown")
check_error("USAGE", "one.csv", "two.csv")
assert run("--version").stdout == b"0.1.0\n"
assert b"Usage:" in run("--help").stdout
assert run("--delimiter", "tab", "-", data=b"a\tb\nc\td").returncode == 0
with tempfile.TemporaryDirectory() as directory:
    Path(directory, "-input.csv").write_bytes(b"one,two\n3,4\n")
    result = run("--", "-input.csv", cwd=directory)
    assert result.returncode == 0 and b"Valid CSV: 1 data records, 2 columns" in result.stdout
print(f"{cases} shared CSV conformance cases and 12 CLI checks passed")
