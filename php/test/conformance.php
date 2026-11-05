<?php

declare(strict_types=1);

use ShipitSoftware\CsvValidator\Validator;

require dirname(__DIR__) . '/src/Parser.php';
require dirname(__DIR__) . '/src/Validator.php';

$fixture = dirname(__DIR__, 2) . '/rust/tests/fixtures/csv-v1.tsv';
$cases = 0;
foreach (file($fixture, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $row) {
    if (str_starts_with($row, '#')) {
        continue;
    }
    [$name, $input, $delimiter, $header, $limit, $expected] = explode("\t", $row, 6);
    $report = Validator::validate(hex2bin($input), hex2bin($delimiter), $header === 'true', (int) $limit);
    if ($report !== json_decode($expected, true, flags: JSON_THROW_ON_ERROR)) {
        throw new RuntimeException("Conformance failure in {$name}: " . json_encode($report));
    }
    ++$cases;
}
if ($cases === 0) {
    throw new RuntimeException('Missing conformance cases');
}
echo "{$cases} conformance cases passed" . PHP_EOL;
