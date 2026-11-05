package csvvalidator

import (
	"bufio"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestSharedConformance(t *testing.T) {
	file, err := os.Open("../rust/tests/fixtures/csv-v1.tsv")
	if errors.Is(err, os.ErrNotExist) {
		t.Skip("shared corpus is available in the complete source repository")
	}
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	rows := bufio.NewScanner(file)
	for rows.Scan() {
		row := rows.Text()
		if row == "" || strings.HasPrefix(row, "#") {
			continue
		}
		fields := strings.Split(row, "\t")
		if len(fields) != 6 {
			t.Fatal("invalid conformance row")
		}
		t.Run(fields[0], func(t *testing.T) {
			input, inputErr := hex.DecodeString(fields[1])
			delimiter, delimiterErr := hex.DecodeString(fields[2])
			header, headerErr := strconv.ParseBool(fields[3])
			maxErrors, maxErr := strconv.Atoi(fields[4])
			var want Report
			if inputErr != nil || delimiterErr != nil || headerErr != nil || maxErr != nil ||
				!utf8.Valid(delimiter) || utf8.RuneCount(delimiter) != 1 || json.Unmarshal([]byte(fields[5]), &want) != nil {
				t.Fatal("invalid conformance fixture")
			}
			delim, _ := utf8.DecodeRune(delimiter)
			got, err := Validate(string(input), Options{Delimiter: delim, Header: header, MaxErrors: maxErrors})
			if err != nil || !reflect.DeepEqual(got, want) {
				t.Fatalf("got %#v, error %v; want %#v", got, err, want)
			}
		})
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
}

func TestValidateInstalledModule(t *testing.T) {
	report, err := Validate("id,name\r\n1,Ada\r\n", DefaultOptions())
	if err != nil || !report.Valid || report.Records != 2 || report.DataRecords != 1 || report.Columns != 2 {
		t.Fatalf("unexpected report %#v, error %v", report, err)
	}
	if _, err := Validate("\xff", DefaultOptions()); err == nil {
		t.Fatal("accepted malformed UTF-8")
	}
	if _, err := Validate("a,b", Options{}); err == nil {
		t.Fatal("accepted invalid options")
	}
}
