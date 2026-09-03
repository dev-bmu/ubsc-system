<?php

namespace Tests\Unit;

use App\Services\BookingCheckoutSchema;
use Illuminate\Database\QueryException;
use PDOException;
use PHPUnit\Framework\TestCase;
use RuntimeException;

final class BookingCheckoutSchemaTest extends TestCase
{
    public function test_it_recognizes_missing_column_errors_without_parsing_sensitive_sql(): void
    {
        $previous = new PDOException('Column not found', 1054);
        $previous->errorInfo = ['42S22', 1054, 'Column not found'];
        $exception = new QueryException('mysql', 'insert into bookings', [], $previous);

        self::assertTrue(BookingCheckoutSchema::causedByQueryException($exception));
    }

    public function test_it_does_not_misclassify_unrelated_database_failures(): void
    {
        $exception = new QueryException(
            'mysql',
            'insert into bookings',
            [],
            new RuntimeException('Connection lost', 2006),
        );

        self::assertFalse(BookingCheckoutSchema::causedByQueryException($exception));
    }
}
