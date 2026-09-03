<?php

namespace App\Console\Commands;

use App\Services\Production\ProductionTopologyResolver;
use Illuminate\Console\Command;

final class ShowProductionTopology extends Command
{
    protected $signature = 'production:topology {--json : Emit a machine-readable result}';

    protected $description = 'Print the explicitly configured production topology';

    public function handle(ProductionTopologyResolver $topology): int
    {
        $resolved = $topology->current();
        $value = $resolved?->value ?? $topology->configuredValue();

        if ((bool) $this->option('json')) {
            $this->line(json_encode([
                'valid' => $resolved !== null,
                'topology' => $value,
            ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
        } else {
            $this->line($value);
        }

        return $resolved === null ? self::FAILURE : self::SUCCESS;
    }
}
