<?php

declare(strict_types=1);

namespace ShipitSoftware\CsvValidator;

use InvalidArgumentException;

/** Validate CSV structure without modifying or interpreting cell values. */
final class Validator
{
    /**
     * Interpret input as UTF-8 and return a JSON-compatible diagnostic report.
     *
     * @return array{valid: bool, records: int, dataRecords: int, columns: int,
     *     header: bool, diagnostics: list<array{code: string, message: string,
     *     record: int, field: int, line: int, column: int}>,
     *     diagnosticsTruncated: bool, parseComplete: bool}
     * @throws InvalidArgumentException If input encoding or an option is invalid.
     */
    public static function validate(
        string $input,
        string $delimiter = ',',
        bool $header = true,
        int $maxErrors = 100
    ): array {
        if (preg_match('//u', $input) !== 1) {
            throw new InvalidArgumentException('Input must be valid UTF-8');
        }
        if (preg_match('/\A[^\x{0}"\r\n\x{10000}-\x{10FFFF}]\z/u', $delimiter) !== 1) {
            throw new InvalidArgumentException('Delimiter must be one BMP character other than quote, newline or NUL');
        }
        if ($maxErrors < 1 || $maxErrors > 10_000) {
            throw new InvalidArgumentException('Maximum errors must be 1-10000');
        }

        $start = str_starts_with($input, "\xEF\xBB\xBF") ? 3 : 0;
        return (new Parser($input, $delimiter, $header, $maxErrors))->parse($start);
    }
}
