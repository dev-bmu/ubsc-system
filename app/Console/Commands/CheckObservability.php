<?php

namespace App\Console\Commands;

use App\Services\Monitoring\ExternalAvailabilityConfiguration;
use App\Services\Monitoring\LogExportReceiptStatus;
use App\Services\Monitoring\MonitoringAlertStatus;
use App\Services\Monitoring\MonitoringSloService;
use App\Services\Production\ObservabilityContract;
use Illuminate\Console\Command;

final class CheckObservability extends Command
{
    protected $signature = 'production:observability-check
        {--strict : Treat unconnected advanced signals as deployment blockers}
        {--live : Require a healthy alert dispatcher and evaluate available SLOs}
        {--require-log-receipt : Require a current provider-signed off-host log receipt}';

    protected $description = 'Validate observability, SLO, and off-host alerting contracts';

    public function handle(
        ObservabilityContract $contract,
        MonitoringAlertStatus $alerting,
        MonitoringSloService $slos,
        ExternalAvailabilityConfiguration $externalAvailability,
        LogExportReceiptStatus $logExport,
    ): int {
        $report = $contract->report();
        $strict = (bool) $this->option('strict');

        $this->components->info('UBSC observability contract');
        $this->table(
            ['Status', 'Check', 'Result'],
            array_map(static fn (array $check): array => [
                strtoupper($check['status']),
                $check['code'],
                $check['message'],
            ], $report['checks']),
        );

        $liveFailed = false;
        if ((bool) $this->option('live')) {
            $alert = $alerting->summary();
            $slo = $slos->summary();
            $external = $externalAvailability->summary();
            $logReceipt = $logExport->summary();
            $this->newLine();
            $this->components->info('Observed control-plane state');
            $this->line(json_encode([
                'alerting_status' => $alert['status'],
                'pending_deliveries' => $alert['pending_deliveries'],
                'dead_deliveries' => $alert['dead_deliveries'],
                'external_availability_status' => $external['status'],
                'external_availability_last_seen_at' => $external['last_external_check_at'],
                'off_host_log_receipt_status' => $logReceipt['status'],
                'off_host_log_receipt_last_seen_at' => $logReceipt['last_seen_at'],
                'slo_evaluation_status' => $slo['evaluation_status'],
            ], JSON_THROW_ON_ERROR));
            $liveFailed = $alert['status'] !== 'operational'
                || $external['status'] !== 'operational'
                || ((bool) $this->option('require-log-receipt')
                    && $logReceipt['status'] !== 'operational');
        }

        $failed = $liveFailed || ($strict ? ! $report['strict_valid'] : ! $report['valid']);
        if ($failed) {
            $this->components->error('Observability contract failed.');

            return self::FAILURE;
        }

        $this->components->info('Observability contract passed.');

        return self::SUCCESS;
    }
}
