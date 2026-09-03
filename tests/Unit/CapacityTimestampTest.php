<?php

namespace Tests\Unit;

use App\Services\Capacity\CapacityTimestamp;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class CapacityTimestampTest extends TestCase
{
    public function test_accepts_unambiguous_real_calendar_instants(): void
    {
        $this->assertTrue(CapacityTimestamp::valid('2024-02-29T23:59:59.123456Z'));
        $this->assertTrue(CapacityTimestamp::valid('2026-08-24T10:00:00+14:00'));
        $this->assertSame(
            '2026-08-23T20:00:00+00:00',
            CapacityTimestamp::parse('2026-08-24T10:00:00+14:00')?->toIso8601String(),
        );
    }

    #[DataProvider('invalidTimestamps')]
    public function test_rejects_ambiguous_or_impossible_instants(mixed $value): void
    {
        $this->assertFalse(CapacityTimestamp::valid($value));
        $this->assertNull(CapacityTimestamp::parse($value));
    }

    /** @return iterable<string, array{mixed}> */
    public static function invalidTimestamps(): iterable
    {
        yield 'timezone missing' => ['2026-08-24T10:00:00'];
        yield 'unknown offset' => ['2026-08-24T10:00:00-00:00'];
        yield 'non leap day' => ['2023-02-29T10:00:00Z'];
        yield 'hour overflow' => ['2026-08-24T24:00:00Z'];
        yield 'offset overflow' => ['2026-08-24T10:00:00+14:01'];
        yield 'excessive precision' => ['2026-08-24T10:00:00.1234567Z'];
        yield 'non string' => [1_772_000_000];
    }
}
