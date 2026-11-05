# frozen_string_literal: true

require "strscan"

module Shipit
  module CsvValidator
    VERSION = "0.1.0"

    # Return a report with JSON-compatible string keys and one-based positions.
    # Input is interpreted as UTF-8 bytes. Bad encoding or options raise ArgumentError.
    def self.validate(input, delimiter: ",", header: true, max_errors: 100)
      raise ArgumentError, "input must be a UTF-8 string" unless input.is_a?(String)

      input = input.dup.force_encoding(Encoding::UTF_8)
      raise ArgumentError, "input must be valid UTF-8" unless input.valid_encoding?

      unless delimiter.is_a?(String) && delimiter.encoding.ascii_compatible?
        raise ArgumentError, "delimiter must be one BMP character other than quote, newline or NUL"
      end
      delimiter = delimiter.dup.force_encoding(Encoding::UTF_8)
      unless delimiter.valid_encoding? && delimiter.length == 1 &&
             delimiter.ord <= 0xffff && !["\"", "\r", "\n", "\0"].include?(delimiter)
        raise ArgumentError, "delimiter must be one BMP character other than quote, newline or NUL"
      end
      raise ArgumentError, "header must be true or false" unless [true, false].include?(header)
      unless max_errors.is_a?(Integer) && (1..10_000).cover?(max_errors)
        raise ArgumentError, "maximum errors must be 1-10000"
      end

      Parser.new(input.delete_prefix("\uFEFF"), delimiter, header, max_errors).report
    end

    class Parser
      def initialize(input, delimiter, header, max_errors)
        @scanner = StringScanner.new(input)
        @delimiter, @header, @max_errors = delimiter, header, max_errors
        @records = @columns = @fields = 0
        @line = @column = 1
        @row_line = @field_line = @field_column = 1
        @state = :start
        @touched = false
        @parse_complete = true
        @diagnostics = []
        @truncated = false
        @header_issues = []
        @header_truncated = false
        @names = {}
        @name = +""
      end

      def report
        add(issue("EMPTY_INPUT", "Input contains no records", 1, 1, 1, 1)) if @scanner.eos?
        while (token = @scanner.scan(/\r\n|./m))
          consume(token)
          break unless @parse_complete
        end

        if @parse_complete
          if @state == :quoted
            fatal("UNCLOSED_QUOTE", "Quoted field is missing a closing quote", @field_line, @field_column)
          elsif @touched
            finish_record
          end
        end

        {
          "valid" => @diagnostics.empty?,
          "records" => @records,
          "dataRecords" => @header && @records.positive? ? @records - 1 : @records,
          "columns" => @columns,
          "header" => @header,
          "diagnostics" => @diagnostics,
          "diagnosticsTruncated" => @truncated,
          "parseComplete" => @parse_complete
        }
      end

      private

      def consume(token)
        newline = token.start_with?("\r", "\n")
        if token == "\0"
          fatal("NUL_CHARACTER", "NUL characters are not supported")
        elsif @state == :quoted
          consume_quoted(token, newline)
        elsif token == @delimiter
          @touched = true
          finish_field
          @column += 1
          @field_line, @field_column = @line, @column
        elsif newline
          finish_record
          advance_line
          @row_line = @field_line = @line
          @field_column = @column
        elsif @state == :closed
          fatal("TEXT_AFTER_QUOTE", "Only a delimiter or line ending may follow a closing quote")
        elsif token == "\""
          if @state == :start
            @state = :quoted
            @touched = true
            @column += 1
          else
            fatal("QUOTE_IN_UNQUOTED_FIELD", "A quote must start at the beginning of a field")
          end
        else
          @state = :unquoted
          @touched = true
          append_name(token)
          @column += token.ord > 0xffff ? 2 : 1
        end
      end

      def consume_quoted(token, newline)
        if token == "\""
          if @scanner.scan(/"/)
            append_name(token)
            @column += 2
          else
            @state = :closed
            @column += 1
          end
        else
          append_name(token)
          if newline
            advance_line
          else
            @column += token.ord > 0xffff ? 2 : 1
          end
        end
      end

      def advance_line
        @line += 1
        @column = 1
      end

      def append_name(token)
        @name << token if @header && @records.zero?
      end

      def finish_field
        @fields += 1
        @state = :start
        return unless @header && @records.zero?

        header_issue("EMPTY_HEADER", "Header name is empty") if @name.empty?
        if (earlier = @names[@name])
          header_issue("DUPLICATE_HEADER", "Header repeats field #{earlier}")
        else
          @names[@name] = @fields
        end
        @name = +""
      end

      def finish_record
        finish_field
        @records += 1
        if @records == 1
          @columns = @fields
          @diagnostics.concat(@header_issues)
          @truncated = @header_truncated
          @header_issues.clear
          @names.clear
        elsif @fields != @columns
          add(issue("ROW_WIDTH", "Expected #{@columns} fields; found #{@fields}",
                    @records, [@fields, @columns].min + 1, @row_line, 1))
        end
        @fields = 0
        @touched = false
      end

      def issue(code, message, record, field, line, column)
        { "code" => code, "message" => message, "record" => record, "field" => field,
          "line" => line, "column" => column }
      end

      def header_issue(code, message)
        if @header_issues.length < @max_errors
          @header_issues << issue(code, message, 1, @fields, @field_line, @field_column)
        else
          @header_truncated = true
        end
      end

      def add(diagnostic)
        if @diagnostics.length < @max_errors
          @diagnostics << diagnostic
        else
          @truncated = true
        end
      end

      def fatal(code, message, line = @line, column = @column)
        if @diagnostics.length == @max_errors
          @diagnostics.pop
          @truncated = true
        end
        @diagnostics.unshift(issue(code, message, @records + 1, @fields + 1, line, column))
        @parse_complete = false
      end
    end

    private_constant :Parser
  end
end
