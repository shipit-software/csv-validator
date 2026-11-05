package main

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRun(t *testing.T) {
	for _, tc := range []struct {
		name string
		args []string
		csv  string
		code int
		text string
	}{
		{"valid stdin", []string{"--json", "-"}, "id,name\n1,Ada", 0, `"valid":true`},
		{"row width", []string{"--json"}, "id,name\n1", 1, `"code":"ROW_WIDTH"`},
		{"invalid encoding", []string{"--json"}, "\xff", 2, `"code":"INPUT_ENCODING"`},
		{"invalid delimiter", []string{"--json", "--delimiter", "ab"}, "", 2, `"code":"USAGE"`},
		{"out of range maximum", []string{"--json", "--max-errors", "10001"}, "", 2, `"code":"USAGE"`},
		{"tab and no header", []string{"--delimiter", "tab", "--no-header"}, "1\t2\n3\t4", 0, "2 data records, 2 columns"},
		{"version", []string{"--version"}, "", 0, "0.1.0"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			code := run(tc.args, strings.NewReader(tc.csv), &stdout, &stderr)
			if code != tc.code || !strings.Contains(stdout.String()+stderr.String(), tc.text) {
				t.Fatalf("exit %d, stdout %q, stderr %q", code, &stdout, &stderr)
			}
		})
	}
}

func TestReadFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sample.csv")
	if err := os.WriteFile(path, []byte("id,name\n1,Ada"), 0600); err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if code := run([]string{"--", path}, strings.NewReader(""), &out, io.Discard); code != 0 {
		t.Fatalf("exit %d, stdout %q", code, &out)
	}
}

type repeatedByte struct{}

func (repeatedByte) Read(p []byte) (int, error) {
	for i := range p {
		p[i] = 'a'
	}
	return len(p), nil
}

func TestReadLimit(t *testing.T) {
	var out bytes.Buffer
	code := run([]string{"--json"}, io.LimitReader(repeatedByte{}, inputLimit+1), &out, io.Discard)
	if code != 2 || !strings.Contains(out.String(), `"code":"INPUT_LIMIT"`) {
		t.Fatalf("exit %d, stdout %q", code, &out)
	}
}
