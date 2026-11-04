import { validateCsv } from "../src/validate.mjs";

function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected validation report: ${JSON.stringify(actual)}`);
  }
}

Deno.test("portable API handles quoted Unicode, BOM and physical line positions", () => {
  const report = validateCsv('\ufeffid,note\r\n001,"Ada, 🦆"\r\n002,"two\r\nlines"\r\n003');
  equal(report.records, 4);
  equal(report.dataRecords, 3);
  equal(report.diagnostics, [{ code: "ROW_WIDTH", message: "Expected 2 fields; found 1", record: 4, field: 2, line: 5, column: 1 }]);
  equal(report.parseComplete, true);
});

Deno.test("portable API has exact syntax failures and bounded diagnostics", () => {
  const report = validateCsv('a,b\n1,"never closes');
  equal(report.parseComplete, false);
  equal(report.diagnostics[0], { code: "UNCLOSED_QUOTE", message: "Quoted field is missing a closing quote", record: 2, field: 2, line: 2, column: 3 });
  const bounded = validateCsv("a,b\n1\n2", { maxErrors: 1 });
  equal(bounded.diagnostics.length, 1);
  equal(bounded.diagnosticsTruncated, true);
  equal(bounded.valid, false);
});

Deno.test("portable API supports TSV without headers and rejects malformed options", () => {
  equal(validateCsv("001\tAda\r\n002\tBea", { delimiter: "\t", header: false }).dataRecords, 2);
  for (const options of [{ delimiter: "🦆" }, { maxErrors: 0 }]) {
    let rejected = false;
    try { validateCsv("a", options); } catch (error) { rejected = error instanceof TypeError; }
    equal(rejected, true);
  }
});
