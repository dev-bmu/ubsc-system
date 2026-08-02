<?php

namespace App\Console\Commands;

use App\Services\Payments\PaymentOperationalLogger;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use RuntimeException;
use Throwable;

final class ArchivePaymentLogs extends Command
{
    protected $signature = 'payments:logs:archive
        {--dry-run : Report eligible files without changing them}';

    protected $description = 'Compress, checksum, and retain sanitized payment operation logs';

    public function handle(PaymentOperationalLogger $operationalLog): int
    {
        try {
            $sourcePath = $this->absolutePath((string) config(
                'logging.payment_archive.source_path',
                storage_path('logs/payments'),
            ));
            $archivePath = $this->absolutePath((string) config(
                'logging.payment_archive.archive_path',
                storage_path('app/private/payment-log-archive'),
            ));
        } catch (Throwable $exception) {
            $this->logFailure($operationalLog, 'archive_configuration', null, $exception);
            $this->error('Payment log archive paths are invalid.');

            return self::FAILURE;
        }

        $archiveAfterDays = (int) config('logging.payment_archive.archive_after_days', 30);
        $retentionDays = (int) config('logging.payment_archive.retention_days', 365);
        $localRotationDays = (int) config('logging.channels.payment_daily.days', 45);
        $dryRun = (bool) $this->option('dry-run');

        if ($archiveAfterDays < 1
            || $localRotationDays <= $archiveAfterDays
            || $retentionDays <= $localRotationDays) {
            $this->error(
                'Payment log retention must satisfy: 0 < archive threshold < local rotation window < archive retention.',
            );

            return self::FAILURE;
        }

        if (! extension_loaded('zlib')) {
            $this->error('The PHP zlib extension is required to archive payment logs safely.');

            return self::FAILURE;
        }

        if (strcasecmp($sourcePath, $archivePath) === 0
            || str_starts_with(
                strtolower($archivePath.DIRECTORY_SEPARATOR),
                strtolower($sourcePath.DIRECTORY_SEPARATOR),
            )) {
            $this->error('Payment log source and archive paths must be different.');

            return self::FAILURE;
        }

        $today = CarbonImmutable::today((string) config('app.timezone', 'Asia/Jakarta'));
        $report = [
            'eligible' => 0,
            'archived' => 0,
            'already_archived' => 0,
            'pruned' => 0,
            'errors' => 0,
            'dry_run' => $dryRun,
        ];

        try {
            $this->archiveEligibleFiles(
                $sourcePath,
                $archivePath,
                $today->subDays($archiveAfterDays),
                $dryRun,
                $report,
                $operationalLog,
            );
            $this->pruneExpiredArchives(
                $archivePath,
                $today->subDays($retentionDays),
                $dryRun,
                $report,
                $operationalLog,
            );
        } catch (Throwable $exception) {
            $report['errors']++;
            $this->logFailure($operationalLog, 'archive_run', null, $exception);
        }

        if (! $this->option('quiet')) {
            $this->line((string) json_encode(
                $report,
                JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES,
            ));
        }

        $operationalLog->record('payment_log_archive_completed', $report);

        return $report['errors'] === 0
            ? self::SUCCESS
            : self::FAILURE;
    }

    /**
     * @param  array<string, int|bool>  $report
     */
    private function archiveEligibleFiles(
        string $sourcePath,
        string $archivePath,
        CarbonImmutable $archiveCutoff,
        bool $dryRun,
        array &$report,
        PaymentOperationalLogger $operationalLog,
    ): void {
        if (! is_dir($sourcePath)) {
            return;
        }

        $files = glob($sourcePath.DIRECTORY_SEPARATOR.'payment-????-??-??.log');

        if ($files === false) {
            throw new RuntimeException('Unable to enumerate payment log files.');
        }

        sort($files, SORT_STRING);

        foreach ($files as $sourceFile) {
            $basename = basename($sourceFile);
            $date = $this->dateFromFilename($basename, '/\Apayment-(\d{4}-\d{2}-\d{2})\.log\z/');

            if ($date === null || $date->greaterThan($archiveCutoff)) {
                continue;
            }

            if (! is_file($sourceFile) || is_link($sourceFile)) {
                continue;
            }

            $report['eligible']++;

            if ($dryRun) {
                continue;
            }

            try {
                $destinationDirectory = $archivePath
                    .DIRECTORY_SEPARATOR.$date->format('Y')
                    .DIRECTORY_SEPARATOR.$date->format('m');
                $this->ensurePrivateDirectory($destinationDirectory);

                $destination = $destinationDirectory.DIRECTORY_SEPARATOR.$basename.'.gz';
                $checksumPath = $destination.'.sha256';
                $sourceHash = hash_file('sha256', $sourceFile);

                if (! is_string($sourceHash)) {
                    throw new RuntimeException('Unable to checksum a payment log before archiving.');
                }

                if (is_file($destination)) {
                    if ($this->archiveMatches($destination, $checksumPath, $sourceHash)) {
                        if (! unlink($sourceFile)) {
                            throw new RuntimeException('Unable to remove the already archived source log.');
                        }

                        $report['already_archived']++;

                        continue;
                    }

                    if (is_file($checksumPath)) {
                        throw new RuntimeException(
                            'An existing payment archive conflicts with the source checksum.',
                        );
                    }

                    // A gzip without its checksum is an incomplete commit.
                    // The source is still authoritative, so only this orphan
                    // may be replaced; a checksummed archive is immutable.
                    @unlink($destination);
                }

                if (is_file($checksumPath)) {
                    @unlink($checksumPath);
                }

                $this->compressAtomically($sourceFile, $destination, $sourceHash);

                if (! $this->archiveMatches($destination, $checksumPath, $sourceHash)) {
                    @unlink($destination);
                    @unlink($checksumPath);

                    throw new RuntimeException('Committed payment log archive failed verification.');
                }

                if (! unlink($sourceFile)) {
                    throw new RuntimeException('Archive completed but the source log could not be removed.');
                }

                $report['archived']++;
            } catch (Throwable $exception) {
                $report['errors']++;
                $this->logFailure($operationalLog, 'archive_file', $basename, $exception);
            }
        }
    }

    /**
     * @param  array<string, int|bool>  $report
     */
    private function pruneExpiredArchives(
        string $archivePath,
        CarbonImmutable $retentionCutoff,
        bool $dryRun,
        array &$report,
        PaymentOperationalLogger $operationalLog,
    ): void {
        if (! is_dir($archivePath)) {
            return;
        }

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator(
                $archivePath,
                RecursiveDirectoryIterator::SKIP_DOTS,
            ),
        );

        foreach ($iterator as $file) {
            if (! $file->isFile() || $file->isLink()) {
                continue;
            }

            $basename = $file->getBasename();
            $date = $this->dateFromFilename(
                $basename,
                '/\Apayment-(\d{4}-\d{2}-\d{2})\.log\.gz\z/',
            );

            if ($date === null || $date->greaterThan($retentionCutoff)) {
                continue;
            }

            if ($dryRun) {
                $report['pruned']++;

                continue;
            }

            $archiveFile = $file->getPathname();
            $checksumFile = $archiveFile.'.sha256';

            try {
                if (! unlink($archiveFile)) {
                    throw new RuntimeException('Unable to remove an expired payment log archive.');
                }

                if (is_file($checksumFile) && ! unlink($checksumFile)) {
                    throw new RuntimeException('Unable to remove an expired archive checksum.');
                }

                $report['pruned']++;
            } catch (Throwable $exception) {
                $report['errors']++;
                $this->logFailure($operationalLog, 'prune_archive', $basename, $exception);
            }
        }
    }

    private function compressAtomically(
        string $source,
        string $destination,
        string $sourceHash,
    ): void {
        $suffix = '.tmp-'.bin2hex(random_bytes(8));
        $temporaryArchive = $destination.$suffix;
        $temporaryChecksum = $destination.'.sha256'.$suffix;
        $input = fopen($source, 'rb');
        $output = gzopen($temporaryArchive, 'wb9');

        if ($input === false || $output === false) {
            if (is_resource($input)) {
                fclose($input);
            }
            if (is_resource($output)) {
                gzclose($output);
            }
            @unlink($temporaryArchive);

            throw new RuntimeException('Unable to open payment log streams for compression.');
        }

        $compressionFailure = null;

        try {
            while (! feof($input)) {
                $chunk = fread($input, 1024 * 1024);

                if ($chunk === false) {
                    throw new RuntimeException('Unable to read a payment log during compression.');
                }

                if ($chunk !== '' && gzwrite($output, $chunk) !== strlen($chunk)) {
                    throw new RuntimeException('Unable to write a complete compressed payment log chunk.');
                }
            }
        } catch (Throwable $exception) {
            $compressionFailure = $exception;
        } finally {
            fclose($input);
            gzclose($output);
        }

        if ($compressionFailure !== null) {
            @unlink($temporaryArchive);

            throw $compressionFailure;
        }

        if (! file_put_contents(
            $temporaryChecksum,
            $sourceHash.'  '.basename($source).PHP_EOL,
            LOCK_EX,
        )) {
            @unlink($temporaryArchive);
            @unlink($temporaryChecksum);

            throw new RuntimeException('Unable to write the payment log checksum.');
        }

        @chmod($temporaryArchive, 0640);
        @chmod($temporaryChecksum, 0640);

        if (! rename($temporaryArchive, $destination)) {
            @unlink($temporaryArchive);
            @unlink($temporaryChecksum);

            throw new RuntimeException('Unable to commit the compressed payment log.');
        }

        if (! rename($temporaryChecksum, $destination.'.sha256')) {
            @unlink($destination);
            @unlink($temporaryChecksum);

            throw new RuntimeException('Unable to commit the payment log checksum.');
        }
    }

    private function ensurePrivateDirectory(string $directory): void
    {
        if (! is_dir($directory)
            && ! mkdir($directory, 0750, true)
            && ! is_dir($directory)) {
            throw new RuntimeException('Unable to create the private payment log archive directory.');
        }
    }

    private function archiveMatches(
        string $archivePath,
        string $checksumPath,
        string $expectedHash,
    ): bool {
        if (! is_file($archivePath)
            || is_link($archivePath)
            || ! is_file($checksumPath)
            || is_link($checksumPath)) {
            return false;
        }

        $contents = file_get_contents($checksumPath);

        return is_string($contents)
            && preg_match('/\A([a-f0-9]{64})(?:\s|\z)/', trim($contents), $matches) === 1
            && hash_equals($expectedHash, $matches[1])
            && hash_equals($expectedHash, $this->compressedContentHash($archivePath));
    }

    private function compressedContentHash(string $archivePath): string
    {
        $input = gzopen($archivePath, 'rb');

        if ($input === false) {
            return '';
        }

        $hash = hash_init('sha256');

        try {
            while (! gzeof($input)) {
                $chunk = gzread($input, 1024 * 1024);

                if ($chunk === false) {
                    return '';
                }

                hash_update($hash, $chunk);
            }
        } finally {
            gzclose($input);
        }

        return hash_final($hash);
    }

    private function dateFromFilename(string $filename, string $pattern): ?CarbonImmutable
    {
        if (preg_match($pattern, $filename, $matches) !== 1) {
            return null;
        }

        try {
            $date = CarbonImmutable::createFromFormat(
                '!Y-m-d',
                $matches[1],
                (string) config('app.timezone', 'Asia/Jakarta'),
            );
        } catch (Throwable) {
            return null;
        }

        return $date !== false && $date->format('Y-m-d') === $matches[1]
            ? $date
            : null;
    }

    private function absolutePath(string $path): string
    {
        $path = rtrim(trim($path), '\\/');

        if ($path === '') {
            throw new RuntimeException('Payment log path cannot be empty.');
        }

        return $path;
    }

    private function logFailure(
        PaymentOperationalLogger $operationalLog,
        string $operation,
        ?string $filename,
        Throwable $exception,
    ): void {
        $operationalLog->record('payment_log_archive_failed', [
            'operation' => $operation,
            'filename' => $filename,
            'exception' => $exception::class,
            'error_fingerprint' => hash(
                'sha256',
                $exception::class.'|'.$exception->getMessage(),
            ),
        ]);
    }
}
