<?php

namespace App\Console\Commands;

use App\Services\Payments\PaymentRecoveryRunner;
use Illuminate\Console\Command;

class RecoverPayments extends Command
{
    protected $signature = 'payments:recover
        {--limit=100 : Database chunk size per recovery category}
        {--stale-seconds= : Override the stale creating threshold for this run}';

    protected $description = 'Recover interrupted payment projections without creating a new charge';

    public function handle(
        PaymentRecoveryRunner $runner,
    ): int {
        $limit = max(1, min(1000, (int) $this->option('limit')));
        $staleOption = $this->option('stale-seconds');
        $staleSeconds = $staleOption === null || $staleOption === ''
            ? null
            : max(30, min(86400, (int) $staleOption));
        $report = $runner->run($limit, $staleSeconds);

        if (! $this->option('quiet')) {
            $this->line(json_encode(
                $report,
                JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES,
            ));
        }

        return ((int) $report['errors']) === 0
            ? self::SUCCESS
            : self::FAILURE;
    }
}
