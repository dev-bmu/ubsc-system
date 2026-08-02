<?php

namespace Tests\Feature;

use App\Services\Payments\PaymentOperationalLogger;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Tests\TestCase;

class PaymentLogArchiveTest extends TestCase
{
    private string $root;

    private string $source;

    private string $archive;

    protected function setUp(): void
    {
        parent::setUp();

        CarbonImmutable::setTestNow('2026-08-02 12:00:00');
        $this->root = storage_path('framework/testing/payment-logs-'.Str::uuid());
        $this->source = $this->root.DIRECTORY_SEPARATOR.'hot';
        $this->archive = $this->root.DIRECTORY_SEPARATOR.'archive';

        File::ensureDirectoryExists($this->source);
        config([
            'logging.payment_archive.source_path' => $this->source,
            'logging.payment_archive.archive_path' => $this->archive,
            'logging.payment_archive.archive_after_days' => 7,
            'logging.payment_archive.retention_days' => 365,
            'logging.channels.payment_daily.days' => 30,
        ]);
    }

    protected function tearDown(): void
    {
        Log::forgetChannel('payments');
        Log::forgetChannel('payment_daily');
        CarbonImmutable::setTestNow();
        File::deleteDirectory($this->root);

        parent::tearDown();
    }

    public function test_it_archives_with_original_checksum_and_prunes_expired_archives(): void
    {
        $oldContents = "{\"message\":\"payment_status_transitioned\"}\n";
        $oldSource = $this->source.DIRECTORY_SEPARATOR.'payment-2026-07-25.log';
        $youngSource = $this->source.DIRECTORY_SEPARATOR.'payment-2026-07-31.log';
        File::put($oldSource, $oldContents);
        File::put($youngSource, "young\n");

        $expiredDirectory = $this->archive.DIRECTORY_SEPARATOR.'2025'.DIRECTORY_SEPARATOR.'07';
        File::ensureDirectoryExists($expiredDirectory);
        $expiredArchive = $expiredDirectory.DIRECTORY_SEPARATOR.'payment-2025-07-31.log.gz';
        File::put($expiredArchive, gzencode('expired'));
        File::put($expiredArchive.'.sha256', hash('sha256', 'expired')."  payment-2025-07-31.log\n");

        $this->artisan('payments:logs:archive')
            ->assertSuccessful();

        $destination = $this->archive
            .DIRECTORY_SEPARATOR.'2026'
            .DIRECTORY_SEPARATOR.'07'
            .DIRECTORY_SEPARATOR.'payment-2026-07-25.log.gz';

        $this->assertFileDoesNotExist($oldSource);
        $this->assertFileExists($youngSource);
        $this->assertFileExists($destination);
        $this->assertFileExists($destination.'.sha256');
        $this->assertSame($oldContents, gzdecode((string) File::get($destination)));
        $this->assertStringStartsWith(hash('sha256', $oldContents), File::get($destination.'.sha256'));
        $this->assertFileDoesNotExist($expiredArchive);
        $this->assertFileDoesNotExist($expiredArchive.'.sha256');
    }

    public function test_dry_run_reports_without_modifying_logs(): void
    {
        $source = $this->source.DIRECTORY_SEPARATOR.'payment-2026-07-25.log';
        File::put($source, "preserve\n");

        $this->artisan('payments:logs:archive --dry-run')
            ->expectsOutputToContain('"eligible":1')
            ->assertSuccessful();

        $this->assertFileExists($source);
        $this->assertDirectoryDoesNotExist($this->archive);
    }

    public function test_verified_existing_archive_makes_source_cleanup_idempotent(): void
    {
        $contents = "same durable log\n";
        $source = $this->source.DIRECTORY_SEPARATOR.'payment-2026-07-25.log';
        File::put($source, $contents);

        $this->artisan('payments:logs:archive')->assertSuccessful();

        $destination = $this->archive
            .DIRECTORY_SEPARATOR.'2026'
            .DIRECTORY_SEPARATOR.'07'
            .DIRECTORY_SEPARATOR.'payment-2026-07-25.log.gz';
        $firstArchiveHash = hash_file('sha256', $destination);

        // Simulate a process stop after the archive commit but before source
        // cleanup. The next run verifies both checksum and gzip contents.
        File::put($source, $contents);

        $this->artisan('payments:logs:archive')->assertSuccessful();

        $this->assertFileDoesNotExist($source);
        $this->assertSame($firstArchiveHash, hash_file('sha256', $destination));
    }

    public function test_conflicting_checksummed_archive_never_overwrites_or_deletes_source(): void
    {
        $source = $this->source.DIRECTORY_SEPARATOR.'payment-2026-07-25.log';
        File::put($source, "new source\n");
        $destinationDirectory = $this->archive.DIRECTORY_SEPARATOR.'2026'.DIRECTORY_SEPARATOR.'07';
        File::ensureDirectoryExists($destinationDirectory);
        $destination = $destinationDirectory.DIRECTORY_SEPARATOR.'payment-2026-07-25.log.gz';
        $originalArchive = (string) gzencode("existing archive\n");
        File::put($destination, $originalArchive);
        File::put(
            $destination.'.sha256',
            hash('sha256', "existing archive\n")."  payment-2026-07-25.log\n",
        );

        $this->artisan('payments:logs:archive')->assertFailed();

        $this->assertFileExists($source);
        $this->assertSame("new source\n", File::get($source));
        $this->assertSame($originalArchive, File::get($destination));
    }

    public function test_corrupt_archive_with_matching_sidecar_never_causes_source_deletion(): void
    {
        $contents = "authoritative source\n";
        $source = $this->source.DIRECTORY_SEPARATOR.'payment-2026-07-25.log';
        File::put($source, $contents);
        $destinationDirectory = $this->archive.DIRECTORY_SEPARATOR.'2026'.DIRECTORY_SEPARATOR.'07';
        File::ensureDirectoryExists($destinationDirectory);
        $destination = $destinationDirectory.DIRECTORY_SEPARATOR.'payment-2026-07-25.log.gz';
        File::put($destination, 'truncated-not-a-valid-gzip-stream');
        File::put(
            $destination.'.sha256',
            hash('sha256', $contents)."  payment-2026-07-25.log\n",
        );

        $this->artisan('payments:logs:archive')->assertFailed();

        $this->assertFileExists($source);
        $this->assertSame($contents, File::get($source));
        $this->assertSame('truncated-not-a-valid-gzip-stream', File::get($destination));
    }

    public function test_it_fails_closed_for_an_unsafe_retention_relationship(): void
    {
        config([
            'logging.payment_archive.archive_after_days' => 30,
            'logging.channels.payment_daily.days' => 7,
            'logging.payment_archive.retention_days' => 365,
        ]);
        $source = $this->source.DIRECTORY_SEPARATOR.'payment-2026-06-01.log';
        File::put($source, "preserve\n");

        $this->artisan('payments:logs:archive')
            ->assertFailed();

        $this->assertFileExists($source);
    }

    public function test_structured_logger_drops_unapproved_and_complex_context(): void
    {
        $logPath = $this->root.DIRECTORY_SEPARATOR.'structured'.DIRECTORY_SEPARATOR.'payment.log';
        config([
            'logging.channels.payment_daily.path' => $logPath,
            'logging.channels.payments.channels' => ['payment_daily'],
        ]);
        Log::forgetChannel('payments');
        Log::forgetChannel('payment_daily');

        $written = app(PaymentOperationalLogger::class)->record('payment_recovery_failed', [
            'operation' => 'booking_order',
            'record_id' => 42,
            'exception' => 'RuntimeException',
            'error_fingerprint' => str_repeat('a', 64),
            'email' => 'member@example.test',
            'authorization' => 'Bearer secret',
            'payload' => ['card_number' => '4111111111111111'],
        ]);

        Log::forgetChannel('payments');
        Log::forgetChannel('payment_daily');

        $this->assertTrue($written);
        $files = glob(dirname($logPath).DIRECTORY_SEPARATOR.'payment-????-??-??.log');
        $this->assertIsArray($files);
        $this->assertCount(1, $files);

        $contents = (string) File::get($files[0]);
        $entry = json_decode(trim($contents), true, flags: JSON_THROW_ON_ERROR);

        $this->assertSame('payment_recovery_failed', $entry['message']);
        $this->assertSame('booking_order', $entry['context']['operation']);
        $this->assertSame(42, $entry['context']['record_id']);
        $this->assertArrayNotHasKey('email', $entry['context']);
        $this->assertArrayNotHasKey('authorization', $entry['context']);
        $this->assertArrayNotHasKey('payload', $entry['context']);
        $this->assertStringNotContainsString('member@example.test', $contents);
        $this->assertStringNotContainsString('4111111111111111', $contents);
        $this->assertStringNotContainsString('Bearer secret', $contents);
    }

    public function test_successful_state_change_log_is_written_only_after_commit(): void
    {
        $logPath = $this->configureStructuredLog();

        DB::transaction(function () use ($logPath): void {
            $queued = app(PaymentOperationalLogger::class)->recordAfterCommit(
                'reservation_confirmed',
                [
                    'booking_order_id' => 12,
                    'transaction_id' => 18,
                    'booking_count' => 2,
                    'confirmation_source' => 'test',
                ],
            );

            $this->assertTrue($queued);
            $this->assertSame([], glob(dirname($logPath).DIRECTORY_SEPARATOR.'payment-????-??-??.log'));
        });

        Log::forgetChannel('payments');
        Log::forgetChannel('payment_daily');
        $files = glob(dirname($logPath).DIRECTORY_SEPARATOR.'payment-????-??-??.log');

        $this->assertIsArray($files);
        $this->assertCount(1, $files);
        $this->assertStringContainsString('reservation_confirmed', File::get($files[0]));
    }

    public function test_rolled_back_state_change_does_not_emit_a_success_log(): void
    {
        $logPath = $this->configureStructuredLog();

        try {
            DB::transaction(function (): void {
                app(PaymentOperationalLogger::class)->recordAfterCommit(
                    'membership_activated',
                    [
                        'membership_id' => 12,
                        'transaction_id' => 18,
                        'activation_source' => 'test',
                    ],
                );

                throw new \RuntimeException('force rollback');
            });
        } catch (\RuntimeException) {
            // Expected rollback.
        }

        Log::forgetChannel('payments');
        Log::forgetChannel('payment_daily');

        $this->assertSame([], glob(dirname($logPath).DIRECTORY_SEPARATOR.'payment-????-??-??.log'));
    }

    private function configureStructuredLog(): string
    {
        $logPath = $this->root.DIRECTORY_SEPARATOR.'structured'.DIRECTORY_SEPARATOR.'payment.log';
        config([
            'logging.channels.payment_daily.path' => $logPath,
            'logging.channels.payments.channels' => ['payment_daily'],
        ]);
        Log::forgetChannel('payments');
        Log::forgetChannel('payment_daily');

        return $logPath;
    }
}
