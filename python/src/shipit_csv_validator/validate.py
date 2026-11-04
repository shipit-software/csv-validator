"""CSV conformance v1 without type inference or external dependencies."""


def _units(text: str) -> str:
    """Use UTF-16 units for the cross-language delimiter/column contract."""
    data = text.encode("utf-16-le", "surrogatepass")
    return "".join(chr(data[i] | data[i + 1] << 8) for i in range(0, len(data), 2))


def validate_csv(
    text: str, *, delimiter: str = ",", header: bool = True, max_errors: int = 100
) -> dict[str, object]:
    """Validate complete CSV text and return the shared JSON-compatible report.

    Positions are one-based UTF-16 columns. The API has no byte limit; the CLI
    bounds input at 32 MiB. No filesystem, network, environment or cell execution
    occurs. Invalid arguments raise TypeError.
    """
    if not isinstance(text, str):
        raise TypeError("Input must be a string")
    if (
        not isinstance(delimiter, str)
        or len(_units(delimiter)) != 1
        or delimiter in ('"', "\r", "\n", "\0")
    ):
        raise TypeError("Delimiter must be one character other than quote, newline or NUL")
    if type(header) is not bool or type(max_errors) is not int or not 1 <= max_errors <= 10000:
        raise TypeError("Invalid validation options")
    source = _units(text[1:] if text.startswith("\ufeff") else text)
    delimiter = _units(delimiter)
    rows = []
    diagnostics = []
    truncated = False
    record = line = column = 1
    row_start = (line, column)
    field_start = (line, column)
    fields = []
    value = []
    state = "start"
    row_touched = fatal = False

    def error(code, message, at=None, field=None, row_number=None):
        nonlocal truncated
        if len(diagnostics) < max_errors:
            at_line, at_column = (line, column) if at is None else at
            diagnostics.append({
                "code": code, "message": message,
                "record": record if row_number is None else row_number,
                "field": len(fields) + 1 if field is None else field,
                "line": at_line, "column": at_column,
            })
        else:
            truncated = True

    def finish_field():
        nonlocal value, state
        fields.append(("".join(value), field_start))
        value = []
        state = "start"

    def finish_record():
        nonlocal fields, record, row_touched
        finish_field()
        rows.append((fields, row_start))
        fields = []
        record += 1
        row_touched = False

    index = 0
    while index < len(source):
        character = source[index]
        newline = character in ("\r", "\n")
        crlf = character == "\r" and source[index + 1:index + 2] == "\n"
        if character == "\0":
            error("NUL_CHARACTER", "NUL characters are not supported")
            fatal = True
            break
        if state == "quoted":
            row_touched = True
            if character == '"':
                if source[index + 1:index + 2] == '"':
                    value.append('"')
                    index += 2
                    column += 2
                    continue
                state = "closed"
            else:
                value.append(character)
                if crlf:
                    value.append("\n")
                    index += 1
            if newline:
                line += 1
                column = 1
            else:
                column += 1
            index += 1
            continue
        if character == delimiter:
            row_touched = True
            finish_field()
            column += 1
            field_start = (line, column)
            index += 1
            continue
        if newline:
            finish_record()
            if crlf:
                index += 1
            line += 1
            column = 1
            row_start = field_start = (line, column)
            index += 1
            continue
        if state == "closed":
            error("TEXT_AFTER_QUOTE", "Only a delimiter or line ending may follow a closing quote")
            fatal = True
            break
        if character == '"':
            if state != "start":
                error("QUOTE_IN_UNQUOTED_FIELD", "A quote must start at the beginning of a field")
                fatal = True
                break
            state = "quoted"
        else:
            value.append(character)
            state = "plain"
        row_touched = True
        column += 1
        index += 1
    if not fatal and state == "quoted":
        error("UNCLOSED_QUOTE", "Quoted field is missing a closing quote", field_start)
        fatal = True
    if not fatal and (row_touched or fields or value):
        finish_record()
    width = len(rows[0][0]) if rows else 0
    if not source:
        error("EMPTY_INPUT", "Input contains no records", (1, 1), 1, 1)
    if header and rows:
        seen = {}
        for index, (field_value, at) in enumerate(rows[0][0], 1):
            if not field_value:
                error("EMPTY_HEADER", "Header name is empty", at, index, 1)
            if field_value in seen:
                error("DUPLICATE_HEADER", f"Header repeats field {seen[field_value]}", at, index, 1)
            else:
                seen[field_value] = index
    for index, (row_fields, at) in enumerate(rows, 1):
        if len(row_fields) != width:
            error("ROW_WIDTH", f"Expected {width} fields; found {len(row_fields)}",
                  at, min(width, len(row_fields)) + 1, index)
    return {
        "valid": not diagnostics, "records": len(rows),
        "dataRecords": max(0, len(rows) - (1 if header and rows else 0)),
        "columns": width, "header": header, "diagnostics": diagnostics,
        "diagnosticsTruncated": truncated, "parseComplete": not fatal,
    }
