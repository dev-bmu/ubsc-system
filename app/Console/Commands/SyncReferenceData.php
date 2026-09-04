<?php

namespace App\Console\Commands;

use App\Services\ReferenceData\PricingCatalogSynchronizer;
use App\Services\ReferenceData\PublicContentSynchronizer;
use Illuminate\Console\Command;
use JsonException;
use Throwable;

class SyncReferenceData extends Command
{
    protected $signature = 'reference-data:sync
        {--dry-run : Calculate and validate changes, then roll the transaction back}
        {--repair : Recheck missing baseline records even when this catalog version is current}
        {--json : Emit a machine-readable report}';

    protected $description = 'Safely synchronize version-controlled product reference data without touching operational records';

    public function handle(
        PricingCatalogSynchronizer $pricingSynchronizer,
        PublicContentSynchronizer $contentSynchronizer,
    ): int {
        try {
            $options = [
                'dryRun' => (bool) $this->option('dry-run'),
                'repair' => (bool) $this->option('repair'),
            ];
            $reports = [
                'pricing_catalog' => $pricingSynchronizer->sync(...$options),
                'public_content' => $contentSynchronizer->sync(...$options),
            ];
        } catch (Throwable $exception) {
            $this->components->error('Reference data synchronization failed closed.');
            $this->line($exception->getMessage());

            return self::FAILURE;
        }

        if ($this->option('json')) {
            try {
                $this->line(json_encode(
                    $reports,
                    JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES,
                ));
            } catch (JsonException $exception) {
                $this->components->error($exception->getMessage());

                return self::FAILURE;
            }

            return self::SUCCESS;
        }

        if (collect($reports)->every(fn (array $report): bool => (bool) $report['already_current'])) {
            $this->components->info(
                'All reference data catalogs are already current.',
            );

            return self::SUCCESS;
        }

        $this->components->info(
            $options['dryRun']
                ? 'Reference data dry run passed; no database changes were retained.'
                : 'Version-controlled reference data synchronized safely.',
        );

        foreach ($reports as $catalog => $report) {
            $this->newLine();
            $this->components->twoColumnDetail(
                str($catalog)->replace('_', ' ')->headline()->toString(),
                (string) $report['version'],
            );
            $this->table(['Operation', 'Count'], collect($report)
                ->except(['version', 'checksum', 'dry_run', 'already_current'])
                ->map(fn (bool|int|string $value, string $key): array => [
                    str($key)->replace('_', ' ')->headline()->toString(),
                    (string) $value,
                ])
                ->values()
                ->all());
        }

        return self::SUCCESS;
    }
}
