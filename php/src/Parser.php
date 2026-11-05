<?php

declare(strict_types=1);

namespace ShipitSoftware\CsvValidator;

/** @internal */
final class Parser
{
    private const START = 0;
    private const UNQUOTED = 1;
    private const QUOTED = 2;
    private const CLOSED = 3;

    private int $state = self::START;
    private int $records = 0;
    private int $columns = 0;
    private int $fields = 0;
    private int $line = 1;
    private int $column = 1;
    private int $rowLine = 1;
    private int $fieldLine = 1;
    private int $fieldColumn = 1;
    private bool $touched = false;
    private bool $complete = true;
    private bool $truncated = false;
    private bool $headerTruncated = false;
    private array $diagnostics = [];
    private array $headerIssues = [];
    private array $names = [];
    private string $name = '';

    public function __construct(
        private readonly string $input,
        private readonly string $delimiter,
        private readonly bool $header,
        private readonly int $maxErrors
    ) {
    }

    public function parse(int $start): array
    {
        $length = strlen($this->input);
        if ($start === $length) {
            $this->diagnostics[] = self::issue('EMPTY_INPUT', 'Input contains no records', 1, 1, 1, 1);
        }

        for ($offset = $start; $offset < $length && $this->complete;) {
            $lead = ord($this->input[$offset]);
            // Validator checks the complete UTF-8 input before the scanner runs.
            $width = match (true) {
                $lead < 0x80 => 1,
                $lead < 0xE0 => 2,
                $lead < 0xF0 => 3,
                default => 4,
            };
            $token = substr($this->input, $offset, $width);
            $offset += $width;
            $newline = $token === "\r" || $token === "\n";
            if ($token === "\r" && ($this->input[$offset] ?? '') === "\n") {
                $token = "\r\n";
                ++$offset;
            }

            if ($token === "\0") {
                $this->fatal('NUL_CHARACTER', 'NUL characters are not supported');
            } elseif ($this->state === self::QUOTED) {
                if ($token === '"' && ($this->input[$offset] ?? '') === '"') {
                    $this->appendName('"');
                    ++$offset;
                    $this->column += 2;
                } elseif ($token === '"') {
                    $this->state = self::CLOSED;
                    ++$this->column;
                } else {
                    $this->appendName($token);
                    if ($newline) {
                        $this->advanceLine();
                    } else {
                        $this->column += $width === 4 ? 2 : 1;
                    }
                }
            } elseif ($token === $this->delimiter) {
                $this->touched = true;
                $this->finishField();
                $this->fieldLine = $this->line;
                $this->fieldColumn = ++$this->column;
            } elseif ($newline) {
                $this->finishRecord();
                $this->advanceLine();
                $this->rowLine = $this->fieldLine = $this->line;
                $this->fieldColumn = 1;
            } elseif ($this->state === self::CLOSED) {
                $this->fatal('TEXT_AFTER_QUOTE', 'Only a delimiter or line ending may follow a closing quote');
            } elseif ($token === '"') {
                if ($this->state === self::START) {
                    $this->state = self::QUOTED;
                    $this->touched = true;
                    ++$this->column;
                } else {
                    $this->fatal('QUOTE_IN_UNQUOTED_FIELD', 'A quote must start at the beginning of a field');
                }
            } else {
                $this->state = self::UNQUOTED;
                $this->touched = true;
                $this->appendName($token);
                $this->column += $width === 4 ? 2 : 1;
            }
        }

        if ($this->complete && $this->state === self::QUOTED) {
            $this->fatal(
                'UNCLOSED_QUOTE',
                'Quoted field is missing a closing quote',
                $this->fieldLine,
                $this->fieldColumn
            );
        } elseif ($this->complete && $this->touched) {
            $this->finishRecord();
        }

        return [
            'valid' => $this->diagnostics === [],
            'records' => $this->records,
            'dataRecords' => $this->header && $this->records > 0 ? $this->records - 1 : $this->records,
            'columns' => $this->columns,
            'header' => $this->header,
            'diagnostics' => $this->diagnostics,
            'diagnosticsTruncated' => $this->truncated,
            'parseComplete' => $this->complete,
        ];
    }

    private function advanceLine(): void
    {
        ++$this->line;
        $this->column = 1;
    }

    private function appendName(string $token): void
    {
        if ($this->header && $this->records === 0) {
            $this->name .= $token;
        }
    }

    private function finishField(): void
    {
        ++$this->fields;
        $this->state = self::START;
        if (!$this->header || $this->records !== 0) {
            return;
        }

        if ($this->name === '') {
            $this->headerIssue('EMPTY_HEADER', 'Header name is empty');
        }
        // Keep PHP from coercing numeric-looking CSV header names to integer keys.
        $key = ':' . $this->name;
        if (isset($this->names[$key])) {
            $this->headerIssue('DUPLICATE_HEADER', "Header repeats field {$this->names[$key]}");
        } else {
            $this->names[$key] = $this->fields;
        }
        $this->name = '';
    }

    private function finishRecord(): void
    {
        $this->finishField();
        ++$this->records;
        if ($this->records === 1) {
            $this->columns = $this->fields;
            $this->diagnostics = $this->headerIssues;
            $this->truncated = $this->headerTruncated;
            $this->headerIssues = $this->names = [];
        } elseif ($this->fields !== $this->columns) {
            if (count($this->diagnostics) < $this->maxErrors) {
                $this->diagnostics[] = self::issue(
                    'ROW_WIDTH',
                    "Expected {$this->columns} fields; found {$this->fields}",
                    $this->records,
                    min($this->fields, $this->columns) + 1,
                    $this->rowLine,
                    1
                );
            } else {
                $this->truncated = true;
            }
        }
        $this->fields = 0;
        $this->touched = false;
    }

    private function headerIssue(string $code, string $message): void
    {
        if (count($this->headerIssues) < $this->maxErrors) {
            $this->headerIssues[] = self::issue($code, $message, 1, $this->fields, $this->fieldLine, $this->fieldColumn);
        } else {
            $this->headerTruncated = true;
        }
    }

    private function fatal(string $code, string $message, ?int $line = null, ?int $column = null): void
    {
        if (count($this->diagnostics) === $this->maxErrors) {
            array_pop($this->diagnostics);
            $this->truncated = true;
        }
        array_unshift($this->diagnostics, self::issue(
            $code,
            $message,
            $this->records + 1,
            $this->fields + 1,
            $line ?? $this->line,
            $column ?? $this->column
        ));
        $this->complete = false;
    }

    private static function issue(string $code, string $message, int $record, int $field, int $line, int $column): array
    {
        return compact('code', 'message', 'record', 'field', 'line', 'column');
    }
}
