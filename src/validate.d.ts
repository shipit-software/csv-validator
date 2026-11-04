/** Controls for complete-text CSV validation. */
export interface ValidationOptions {
  /** One UTF-16 code unit, excluding quote, CR, LF and NUL. Default comma. */
  delimiter?: string;
  /** Check the first record's exact header names. Default true. */
  header?: boolean;
  /** Maximum returned diagnostics, from 1 to 10,000. Default 100. */
  maxErrors?: number;
}

/** A stable CSV diagnostic, with one-based source positions. */
export interface Diagnostic {
  code: "EMPTY_INPUT" | "NUL_CHARACTER" | "TEXT_AFTER_QUOTE" |
    "QUOTE_IN_UNQUOTED_FIELD" | "UNCLOSED_QUOTE" | "EMPTY_HEADER" |
    "DUPLICATE_HEADER" | "ROW_WIDTH";
  message: string;
  record: number;
  field: number;
  line: number;
  /** One-based UTF-16 source column. */
  column: number;
}

/** Validation summary; syntax failures include only completely parsed records. */
export interface ValidationReport {
  valid: boolean;
  records: number;
  dataRecords: number;
  columns: number;
  header: boolean;
  diagnostics: Diagnostic[];
  diagnosticsTruncated: boolean;
  parseComplete: boolean;
}

/**
 * Validate complete CSV text without guessing types, changing values or reading files.
 * Throws TypeError for invalid input/options. Input may begin with a UTF-8 BOM.
 * @example
 * const report = validateCsv('id,name\n001,Ada');
 * console.log(report.valid); // true
 */
export function validateCsv(input: string, options?: ValidationOptions): ValidationReport;
