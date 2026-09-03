<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use SplFileInfo;

class BookingInventoryWriteArchitectureTest extends TestCase
{
    public function test_new_booking_rows_can_only_be_created_by_guarded_transactional_writers(): void
    {
        $writers = [];
        $projectRoot = dirname(__DIR__, 2);
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($projectRoot.'/app'),
        );
        $creationPattern = '/(?:\bBooking::create\s*\(|\bBooking::query\(\)->create\s*\(|->bookings\(\)->create\s*\(|DB::table\([\'\"]bookings[\'\"]\)->(?:insert|upsert)\s*\()/s';

        /** @var SplFileInfo $file */
        foreach ($iterator as $file) {
            if (! $file->isFile() || $file->getExtension() !== 'php') {
                continue;
            }

            $source = file_get_contents($file->getPathname());
            if (! is_string($source) || preg_match($creationPattern, $source) !== 1) {
                continue;
            }

            $writers[] = str_replace(
                '\\',
                '/',
                substr($file->getPathname(), strlen($projectRoot) + 1),
            );
        }

        sort($writers);
        $this->assertSame([
            'app/Http/Controllers/Admin/BookingController.php',
            'app/Http/Controllers/Public/PublicCheckoutController.php',
        ], $writers, 'A new Booking writer bypassed the reviewed inventory boundary.');

        foreach ($writers as $writer) {
            $source = file_get_contents($projectRoot.'/'.$writer);
            $this->assertIsString($source);
            $this->assertStringContainsString('DB::transaction', $source, $writer);
            $this->assertStringContainsString('lockResources', $source, $writer);
            $this->assertStringContainsString('assertAvailable', $source, $writer);
            $this->assertStringContainsString(
                'assertPersistedBookingsWithinCapacity',
                $source,
                $writer,
            );
            $this->assertStringContainsString('transaction_attempts', $source, $writer);
        }
    }
}
