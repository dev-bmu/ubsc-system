<?php

namespace Tests\Unit;

use App\Services\Production\ProcessSupervisionContract;
use App\Services\Production\SupervisorConfigurationParser;
use Illuminate\Config\Repository;
use PHPUnit\Framework\TestCase;

final class ProcessSupervisionContractTest extends TestCase
{
    public function test_database_and_redis_supervisor_baselines_are_strictly_valid(): void
    {
        foreach (['database', 'redis'] as $profile) {
            $report = $this->contract()->inspect(
                $profile,
                $this->artifact("deploy/supervisor/ubsc-{$profile}.conf.example"),
                true,
            );

            self::assertTrue($report['valid'], $profile.' profile should be valid.');
            self::assertTrue($report['strict_valid']);
            self::assertSame(0, $report['failures']);
            self::assertSame(0, $report['warnings']);
        }
    }

    public function test_pooled_queue_program_is_rejected_as_a_bulkhead_violation(): void
    {
        $artifact = str_replace(
            '--queue=documents ',
            '--queue=documents,notifications ',
            $this->artifact('deploy/supervisor/ubsc-database.conf.example'),
        );
        $report = $this->contract()->inspect('database', $artifact, true);

        self::assertFalse($report['valid']);
        self::assertContains('worker.documents.command', $this->failedCodes($report));
        self::assertContains('workers.queue_isolation', $this->failedCodes($report));
    }

    public function test_missing_or_obsolete_program_is_rejected(): void
    {
        $artifact = preg_replace(
            '/\[program:ubsc-documents].*?(?=\R\[program:ubsc-notifications])/s',
            '',
            $this->artifact('deploy/supervisor/ubsc-database.conf.example'),
        );
        self::assertIsString($artifact);
        $report = $this->contract()->inspect('database', $artifact, true);

        self::assertFalse($report['valid']);
        self::assertContains('programs.closed_set', $this->failedCodes($report));
        self::assertContains('worker.documents.presence', $this->failedCodes($report));
    }

    public function test_restart_group_shutdown_and_log_rotation_are_mandatory(): void
    {
        $artifact = str_replace(
            [
                'autorestart=true',
                'stopasgroup=true',
                'stdout_logfile_maxbytes=20MB',
            ],
            [
                'autorestart=false',
                'stopasgroup=false',
                'stdout_logfile_maxbytes=0',
            ],
            $this->artifact('deploy/supervisor/ubsc-database.conf.example'),
        );
        $report = $this->contract()->inspect('database', $artifact, true);
        $failed = $this->failedCodes($report);

        self::assertContains('scheduler.lifecycle', $failed);
        self::assertContains('worker.critical.lifecycle', $failed);
        self::assertContains('worker.media_video.logging', $failed);
    }

    public function test_worker_timeout_must_remain_below_the_queue_visibility_lease(): void
    {
        $artifact = str_replace(
            '--timeout=80 --max-time=3600 --max-jobs=1000',
            '--timeout=90 --max-time=3600 --max-jobs=1000',
            $this->artifact('deploy/supervisor/ubsc-database.conf.example'),
        );
        $report = $this->contract()->inspect('database', $artifact, true);

        self::assertContains('worker.critical.command', $this->failedCodes($report));
        self::assertContains('worker.critical.lease', $this->failedCodes($report));
    }

    public function test_a_job_timeout_cannot_outgrow_its_supervised_worker_lane(): void
    {
        $configuration = $this->configuration();
        $configuration['invoice_pdf']['prewarm']['timeout_seconds'] = 81;
        $report = $this->contract($configuration)->inspect(
            'database',
            $this->artifact('deploy/supervisor/ubsc-database.conf.example'),
            true,
        );

        self::assertFalse($report['valid']);
        self::assertContains('worker.documents.job_timeout', $this->failedCodes($report));
        self::assertContains('worker.documents.lease', $this->failedCodes($report));
    }

    public function test_placeholders_are_allowed_only_in_bundled_templates(): void
    {
        $artifact = $this->artifact('deploy/supervisor/ubsc-database.conf.example');
        $bundled = $this->contract()->inspect('database', $artifact, true);
        $active = $this->contract()->inspect('database', $artifact, false);

        self::assertTrue($bundled['valid']);
        self::assertFalse($active['valid']);
        self::assertContains('scheduler.lifecycle', $this->failedCodes($active));
    }

    public function test_production_active_artifact_path_must_be_absolute(): void
    {
        $configuration = $this->configuration();
        $configuration['app']['env'] = 'production';
        $configuration['process_supervision']['enforce'] = true;
        $configuration['process_supervision']['active_config_path'] = 'deploy/supervisor/ubsc-database.conf.example';
        $report = $this->contract($configuration)->configuredReport();

        self::assertFalse($report['valid']);
        self::assertContains('artifact.active_path', $this->failedCodes($report));
    }

    public function test_parser_rejects_duplicate_directives_and_reports_do_not_echo_artifact_values(): void
    {
        $artifact = $this->artifact('deploy/supervisor/ubsc-database.conf.example')."\n".
            "[program:unrelated]\nenvironment=PASSWORD=do-not-disclose-this-value\n".
            "environment=TOKEN=second-secret\n";
        $report = $this->contract()->inspect('database', $artifact, true);
        $encoded = json_encode($report, JSON_THROW_ON_ERROR);

        self::assertFalse($report['valid']);
        self::assertContains('artifact.syntax', $this->failedCodes($report));
        self::assertStringNotContainsString('do-not-disclose-this-value', $encoded);
        self::assertStringNotContainsString('second-secret', $encoded);
    }

    public function test_oversized_log_rotation_value_is_rejected_without_integer_overflow(): void
    {
        $artifact = str_replace(
            'stdout_logfile_maxbytes=20MB',
            'stdout_logfile_maxbytes=999999999999999999999999999GB',
            $this->artifact('deploy/supervisor/ubsc-database.conf.example'),
        );
        $report = $this->contract()->inspect('database', $artifact, true);

        self::assertFalse($report['valid']);
        self::assertContains('scheduler.logging', $this->failedCodes($report));
        self::assertContains('worker.media_video.logging', $this->failedCodes($report));
    }

    /** @param array<string, mixed>|null $configuration */
    private function contract(?array $configuration = null): ProcessSupervisionContract
    {
        return new ProcessSupervisionContract(
            new Repository($configuration ?? $this->configuration()),
            new SupervisorConfigurationParser,
        );
    }

    /** @return array<string, mixed> */
    private function configuration(): array
    {
        /** @var array<string, mixed> $processSupervision */
        $processSupervision = require dirname(__DIR__, 2).'/config/process_supervision.php';

        return [
            'app' => ['env' => 'testing'],
            'process_supervision' => $processSupervision,
            'background_jobs' => [
                'connection' => 'database',
                'media_connection' => 'database-long',
                'queues' => [
                    'critical' => 'critical',
                    'documents' => 'documents',
                    'notifications' => 'notifications',
                    'media_image' => 'media-image',
                    'media_video' => 'media-video',
                    'media_maintenance' => 'media-maintenance',
                    'maintenance' => 'maintenance',
                    'default' => 'default',
                ],
                'worker_capacity' => [
                    'minimum' => [
                        'critical' => 2,
                        'documents' => 1,
                        'notifications' => 1,
                        'media_image' => 1,
                        'media_video' => 1,
                        'media_maintenance' => 1,
                        'maintenance' => 1,
                        'default' => 1,
                    ],
                    'maximum' => [
                        'critical' => 12,
                        'documents' => 4,
                        'notifications' => 8,
                        'media_image' => 3,
                        'media_video' => 2,
                        'media_maintenance' => 2,
                        'maintenance' => 4,
                        'default' => 8,
                    ],
                ],
            ],
            'queue' => [
                'connections' => [
                    'database' => ['driver' => 'database', 'retry_after' => 90],
                    'database-long' => ['driver' => 'database', 'retry_after' => 1_200],
                    'redis' => ['driver' => 'redis', 'retry_after' => 90],
                    'redis-long' => ['driver' => 'redis', 'retry_after' => 1_200],
                ],
            ],
            'invoice_pdf' => [
                'prewarm' => [
                    'connection' => '',
                    'queue' => 'documents',
                    'timeout_seconds' => 60,
                ],
            ],
        ];
    }

    private function artifact(string $relativePath): string
    {
        $contents = file_get_contents(dirname(__DIR__, 2).'/'.$relativePath);
        self::assertIsString($contents);

        return $contents;
    }

    /**
     * @param  array{checks:list<array{code:string,status:string,message:string}>}  $report
     * @return list<string>
     */
    private function failedCodes(array $report): array
    {
        return array_values(array_map(
            static fn (array $check): string => $check['code'],
            array_filter(
                $report['checks'],
                static fn (array $check): bool => $check['status'] === 'fail',
            ),
        ));
    }
}
