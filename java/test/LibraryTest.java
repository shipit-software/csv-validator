
import com.shipitsoftware.csvvalidator.CsvValidator;
import com.shipitsoftware.csvvalidator.CsvValidator.Report;

/** Smoke tests against the packaged public API. */
final class LibraryTest {
    public static void main(String[] args) {
        Report valid = CsvValidator.validate("name,age\nAda,36\n");
        check(valid.valid() && valid.records() == 2 && valid.dataRecords() == 1 && valid.columns() == 2);
        Report duplicate = CsvValidator.validate("id;id\n1;2", ';', true, 1);
        check(!duplicate.valid() && duplicate.diagnostics().get(0).code().equals("DUPLICATE_HEADER"));
        Report noHeader = CsvValidator.validate("a\tb\nc\td", '\t', false, 2);
        check(noHeader.valid() && noHeader.dataRecords() == 2 && !noHeader.header());
        expectFailure(UnsupportedOperationException.class, duplicate.diagnostics()::clear);
        expectFailure(IllegalArgumentException.class, () -> CsvValidator.validate("a", '"', true, 10));
        expectFailure(IllegalArgumentException.class, () -> CsvValidator.validate("a", ',', true, 0));
        System.out.println("6 Java library checks passed");
    }

    private static void check(boolean success) {
        if (!success) {
            throw new AssertionError("Unexpected validation report");
        }
    }

    private static void expectFailure(Class<? extends RuntimeException> type, Runnable operation) {
        try {
            operation.run();
        } catch (RuntimeException error) {
            if (type.isInstance(error)) {
                return;
            }
            throw error;
        }
        throw new AssertionError("Expected " + type.getName());
    }
}
