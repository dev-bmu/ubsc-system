<?php

namespace App\Services\Production;

use App\Exceptions\ProcessSupervisionContractViolation;
use Illuminate\Contracts\Config\Repository;

final class ProcessSupervisionContract
{
    public function __construct(
        private readonly Repository $config,
        private readonly SupervisorConfigurationParser $parser,
    ) {}

    public function shouldEnforce(): bool
    {
        return (bool) $this->config->get('process_supervision.enforce', false);
    }

    /** @return array<string, mixed> */
    public function configuredReport(): array
    {
        $profile = $this->activeProfile();
        $checks = [];
        $production = (string) $this->config->get('app.env', 'production') === 'production';
        $enforced = $this->shouldEnforce();

        $this->add(
            $checks,
            'contract.enforcement',
            $enforced ? 'pass' : ($production ? 'fail' : 'warning'),
            $enforced
                ? 'Production process supervision is enforced.'
                : ($production
                    ? 'PROCESS_SUPERVISION_ENFORCE must be enabled in production.'
                    : 'Process supervision enforcement is intentionally disabled outside production.'),
        );

        if ($profile === null) {
            $this->add(
                $checks,
                'artifact.profile',
                'fail',
                'The active background queue driver is not supported by the Supervisor contract.',
            );

            return $this->summarize('unknown', 'active', $checks);
        }

        $configuredPath = trim((string) $this->config->get(
            'process_supervision.active_config_path',
            '',
        ));
        if ($configuredPath === '') {
            if ($production || $this->shouldEnforce()) {
                $this->add(
                    $checks,
                    'artifact.active_path',
                    'fail',
                    'PROCESS_SUPERVISOR_CONFIG_PATH must identify the exact file loaded by supervisord.',
                );

                return $this->summarize($profile, 'active', $checks);
            }

            $report = $this->bundledReport($profile);
            $this->add(
                $checks,
                'artifact.active_path',
                'warning',
                'No active Supervisor artifact is configured; the bundled development baseline was inspected.',
            );

            return $this->summarize(
                $profile,
                'bundled',
                [...$checks, ...$report['checks']],
            );
        }

        if ($production && ! $this->isAbsolutePath($configuredPath)) {
            $this->add(
                $checks,
                'artifact.active_path',
                'fail',
                'PROCESS_SUPERVISOR_CONFIG_PATH must be an absolute production path.',
            );

            return $this->summarize($profile, 'active', $checks);
        }

        $path = $this->resolvePath($configuredPath);
        $contents = $this->readArtifact($path, $checks);

        if ($contents === null) {
            return $this->summarize($profile, 'active', $checks);
        }

        $report = $this->inspect($profile, $contents, false);

        return $this->summarize(
            $profile,
            'active',
            [...$checks, ...$report['checks']],
        );
    }

    /** @return array<string, mixed> */
    public function bundledReport(string $profile): array
    {
        $profile = strtolower(trim($profile));
        $checks = [];
        $relative = (string) $this->config->get(
            "process_supervision.templates.{$profile}",
            '',
        );

        if (! in_array($profile, ['database', 'redis'], true) || $relative === '') {
            $this->add(
                $checks,
                'artifact.profile',
                'fail',
                'The requested Supervisor profile is not supported.',
            );

            return $this->summarize($profile ?: 'unknown', 'bundled', $checks);
        }

        $contents = $this->readArtifact($this->resolvePath($relative), $checks);

        if ($contents === null) {
            return $this->summarize($profile, 'bundled', $checks);
        }

        $report = $this->inspect($profile, $contents, true);

        return $this->summarize(
            $profile,
            'bundled',
            [...$checks, ...$report['checks']],
        );
    }

    /**
     * @return array{profile:string,source:string,valid:bool,strict_valid:bool,failures:int,warnings:int,checks:list<array{code:string,status:string,message:string>>}
     */
    public function inspect(string $profile, string $contents, bool $bundled = false): array
    {
        $profile = strtolower(trim($profile));
        $checks = [];

        if (! in_array($profile, ['database', 'redis'], true)) {
            $this->add($checks, 'artifact.profile', 'fail', 'Unsupported Supervisor profile.');

            return $this->summarize($profile ?: 'unknown', $bundled ? 'bundled' : 'active', $checks);
        }

        $maximumBytes = (int) $this->config->get(
            'process_supervision.safety.maximum_artifact_bytes',
            1_048_576,
        );
        $sizeIsSafe = $contents !== '' && strlen($contents) <= $maximumBytes;
        $this->add(
            $checks,
            'artifact.size',
            $sizeIsSafe ? 'pass' : 'fail',
            $sizeIsSafe
                ? 'The Supervisor artifact is non-empty and bounded.'
                : 'The Supervisor artifact is empty or exceeds the safety limit.',
        );

        if (! $sizeIsSafe) {
            return $this->summarize($profile, $bundled ? 'bundled' : 'active', $checks);
        }

        $parsed = $this->parser->parse($contents);
        $syntaxIsValid = $parsed['errors'] === [];
        $this->add(
            $checks,
            'artifact.syntax',
            $syntaxIsValid ? 'pass' : 'fail',
            $syntaxIsValid
                ? 'The Supervisor artifact has an unambiguous section and key structure.'
                : 'The Supervisor artifact contains malformed or duplicate directives.',
        );

        if (! $syntaxIsValid) {
            return $this->summarize($profile, $bundled ? 'bundled' : 'active', $checks);
        }

        $sections = $parsed['sections'];
        $workers = (array) $this->config->get('process_supervision.workers', []);
        $scheduler = (array) $this->config->get('process_supervision.scheduler', []);
        $schedulerProgram = (string) ($scheduler['program'] ?? 'ubsc-scheduler');
        $expectedPrograms = [$schedulerProgram];

        foreach ($workers as $worker) {
            if (is_array($worker) && is_string($worker['program'] ?? null)) {
                $expectedPrograms[] = $worker['program'];
            }
        }

        $this->validateGroup($checks, $sections, $expectedPrograms);
        $this->validateNoUnknownPrograms($checks, $sections, $expectedPrograms);
        $this->validateScheduler(
            $checks,
            $sections,
            $schedulerProgram,
            $scheduler,
            $bundled,
        );

        $seenQueues = [];
        foreach ($workers as $key => $worker) {
            if (! is_string($key) || ! is_array($worker)) {
                $this->add(
                    $checks,
                    'worker.definition',
                    'fail',
                    'A process worker definition is malformed.',
                );

                continue;
            }

            $this->validateWorker(
                $checks,
                $sections,
                $profile,
                $key,
                $worker,
                $bundled,
                $seenQueues,
            );
        }

        $expectedQueueCount = count($workers);
        $queuesAreIsolated = count($seenQueues) === $expectedQueueCount
            && count(array_unique($seenQueues)) === $expectedQueueCount;
        $this->add(
            $checks,
            'workers.queue_isolation',
            $queuesAreIsolated ? 'pass' : 'fail',
            $queuesAreIsolated
                ? 'Every queue lane has exactly one isolated worker program.'
                : 'Queue lanes must be non-empty, unique, and owned by exactly one worker program.',
        );

        return $this->summarize($profile, $bundled ? 'bundled' : 'active', $checks);
    }

    public function assertSatisfied(): void
    {
        $report = $this->configuredReport();

        if ($report['valid']) {
            return;
        }

        throw ProcessSupervisionContractViolation::fromCodes($this->failedCodes($report));
    }

    /**
     * @param  list<array{code:string,status:string,message:string}>  $checks
     * @param  array<string, array<string, string>>  $sections
     * @param  list<string>  $expectedPrograms
     */
    private function validateGroup(array &$checks, array $sections, array $expectedPrograms): void
    {
        $group = strtolower((string) $this->config->get('process_supervision.group', 'ubsc'));
        $definition = $sections['group:'.$group] ?? null;
        $programs = is_array($definition)
            ? array_values(array_filter(array_map('trim', explode(',', (string) ($definition['programs'] ?? '')))))
            : [];
        $expected = $expectedPrograms;
        sort($programs);
        sort($expected);
        $valid = $definition !== null
            && $programs === $expected
            && (int) ($definition['priority'] ?? 0) > 0;

        $this->add(
            $checks,
            'group.membership',
            $valid ? 'pass' : 'fail',
            $valid
                ? 'The UBSC process group contains every required program exactly once.'
                : 'The UBSC process group is missing, duplicated, or contains an unexpected program.',
        );
    }

    /**
     * @param  list<array{code:string,status:string,message:string}>  $checks
     * @param  array<string, array<string, string>>  $sections
     * @param  list<string>  $expectedPrograms
     */
    private function validateNoUnknownPrograms(array &$checks, array $sections, array $expectedPrograms): void
    {
        $actual = [];

        foreach (array_keys($sections) as $section) {
            if (str_starts_with($section, 'program:ubsc-')) {
                $actual[] = substr($section, strlen('program:'));
            }
        }

        sort($actual);
        sort($expectedPrograms);
        $valid = $actual === $expectedPrograms;

        $this->add(
            $checks,
            'programs.closed_set',
            $valid ? 'pass' : 'fail',
            $valid
                ? 'No obsolete or unmanaged UBSC process remains in the artifact.'
                : 'The Supervisor artifact contains an obsolete, unknown, or missing UBSC program.',
        );
    }

    /**
     * @param  list<array{code:string,status:string,message:string}>  $checks
     * @param  array<string, array<string, string>>  $sections
     * @param  array<string, mixed>  $expected
     */
    private function validateScheduler(
        array &$checks,
        array $sections,
        string $program,
        array $expected,
        bool $bundled,
    ): void {
        $definition = $sections['program:'.strtolower($program)] ?? null;
        $code = 'scheduler';

        if (! is_array($definition)) {
            $this->add($checks, "{$code}.presence", 'fail', 'The scheduler program is missing.');

            return;
        }

        $this->validateLifecycle($checks, $code, $definition, $bundled);
        $this->validateLogging($checks, $code, $definition);

        $command = $this->normalizeSpaces((string) ($definition['command'] ?? ''));
        $commandIsSafe = preg_match(
            '#^/usr/bin/php artisan schedule:work --no-interaction$#',
            $command,
        ) === 1;
        $identityIsSafe = (int) ($definition['numprocs'] ?? 0)
                === (int) ($expected['processes_per_node'] ?? 1)
            && (int) ($definition['stopwaitsecs'] ?? -1)
                === (int) ($expected['stop_wait_seconds'] ?? 30);

        $this->add(
            $checks,
            "{$code}.command",
            $commandIsSafe ? 'pass' : 'fail',
            $commandIsSafe
                ? 'One persistent scheduler is supervised on this node.'
                : 'The scheduler must run schedule:work non-interactively.',
        );
        $this->add(
            $checks,
            "{$code}.node_redundancy",
            $identityIsSafe ? 'pass' : 'fail',
            $identityIsSafe
                ? 'The artifact runs exactly one scheduler per node with bounded shutdown.'
                : 'Each node must supervise exactly one scheduler with the configured shutdown allowance.',
        );
    }

    /**
     * @param  list<array{code:string,status:string,message:string}>  $checks
     * @param  array<string, array<string, string>>  $sections
     * @param  array<string, mixed>  $expected
     * @param  list<string>  $seenQueues
     */
    private function validateWorker(
        array &$checks,
        array $sections,
        string $profile,
        string $key,
        array $expected,
        bool $bundled,
        array &$seenQueues,
    ): void {
        $program = strtolower((string) ($expected['program'] ?? ''));
        $definition = $sections['program:'.$program] ?? null;
        $code = 'worker.'.$key;

        if ($program === '' || ! is_array($definition)) {
            $this->add($checks, "{$code}.presence", 'fail', 'A required queue worker program is missing.');

            return;
        }

        $this->validateLifecycle($checks, $code, $definition, $bundled);
        $this->validateLogging($checks, $code, $definition);

        $command = $this->normalizeSpaces((string) ($definition['command'] ?? ''));
        $connection = $this->commandConnection($command);
        $queue = $this->commandOption($command, 'queue');
        $queueKey = (string) ($expected['queue_key'] ?? $key);
        $expectedConnection = $this->expectedConnection($profile, $key, $expected, $bundled);
        $expectedQueue = $this->expectedQueue($queueKey, $key, $bundled);

        if (is_string($queue) && $queue !== '' && ! str_contains($queue, ',')) {
            $seenQueues[] = $queue;
        }

        $expectedOptions = [
            'sleep' => 1,
            'tries' => 3,
            'backoff' => 5,
            'timeout' => (int) ($expected['timeout'] ?? 0),
            'max-time' => (int) ($expected['max_time'] ?? 0),
            'max-jobs' => (int) ($expected['max_jobs'] ?? 0),
            'memory' => (int) ($expected['memory'] ?? 0),
        ];
        $optionsAreSafe = true;

        foreach ($expectedOptions as $option => $value) {
            $optionsAreSafe = $optionsAreSafe
                && $this->commandOption($command, $option) === (string) $value;
        }

        $commandIsSafe = str_starts_with($command, '/usr/bin/php artisan queue:work ')
            && str_contains($command, ' --no-interaction')
            && $connection === $expectedConnection
            && $queue === $expectedQueue
            && $queue !== ''
            && ! str_contains($queue, ',')
            && $optionsAreSafe;
        $this->add(
            $checks,
            "{$code}.command",
            $commandIsSafe ? 'pass' : 'fail',
            $commandIsSafe
                ? 'The worker owns one expected queue with bounded execution and retry behavior.'
                : 'The worker command, queue ownership, connection, or safety limits do not match the contract.',
        );

        $numprocs = $this->positiveInteger($definition['numprocs'] ?? null);
        $minimum = max(1, (int) $this->config->get(
            "background_jobs.worker_capacity.minimum.{$key}",
            $expected['baseline_processes'] ?? 1,
        ));
        $maximum = max($minimum, (int) $this->config->get(
            "background_jobs.worker_capacity.maximum.{$key}",
            $minimum,
        ));
        $baseline = (int) ($expected['baseline_processes'] ?? 1);
        $processName = (string) ($definition['process_name'] ?? '');
        $processNameIsSafe = str_contains($processName, '%(program_name)s')
            && str_contains($processName, '%(process_num)');
        $capacityIsSafe = $numprocs !== null
            && ($bundled ? $numprocs === $baseline : ($numprocs >= $minimum && $numprocs <= $maximum))
            && $processNameIsSafe;
        $this->add(
            $checks,
            "{$code}.capacity",
            $capacityIsSafe ? 'pass' : 'fail',
            $capacityIsSafe
                ? 'Worker process count is bounded and every process has a stable identity.'
                : 'Worker process count or process naming is outside the approved capacity bounds.',
        );

        $timeoutOption = $this->commandOption($command, 'timeout');
        $timeout = is_numeric($timeoutOption) ? (int) $timeoutOption : 0;
        $maximumJobTimeout = $this->maximumJobTimeout($expected);
        $stopWait = $this->positiveInteger($definition['stopwaitsecs'] ?? null);
        $retryAfter = $this->retryAfter($expectedConnection);
        $jobTimeoutIsSafe = $maximumJobTimeout !== null
            && $timeout >= $maximumJobTimeout;
        $this->add(
            $checks,
            "{$code}.job_timeout",
            $jobTimeoutIsSafe ? 'pass' : 'fail',
            $jobTimeoutIsSafe
                ? 'The worker timeout covers the largest job assigned to this lane.'
                : 'A configured job timeout exceeds the worker execution allowance.',
        );

        $effectiveTimeout = max($timeout, $maximumJobTimeout ?? PHP_INT_MAX);
        $leaseIsSafe = $timeout > 0
            && $jobTimeoutIsSafe
            && $stopWait === (int) ($expected['stop_wait_seconds'] ?? 0)
            && $stopWait > $effectiveTimeout
            && $retryAfter !== null
            && $retryAfter > $effectiveTimeout;
        $this->add(
            $checks,
            "{$code}.lease",
            $leaseIsSafe ? 'pass' : 'fail',
            $leaseIsSafe
                ? 'Queue visibility, worker timeout, and graceful shutdown windows cannot duplicate in-flight work.'
                : 'Worker timeout must remain below its queue lease and graceful shutdown allowance.',
        );
    }

    /**
     * @param  list<array{code:string,status:string,message:string}>  $checks
     * @param  array<string, string>  $definition
     */
    private function validateLifecycle(
        array &$checks,
        string $code,
        array $definition,
        bool $bundled,
    ): void {
        $startRetries = $this->positiveInteger($definition['startretries'] ?? null);
        $startSeconds = $this->positiveInteger($definition['startsecs'] ?? null);
        $directory = trim((string) ($definition['directory'] ?? ''));
        $user = trim((string) ($definition['user'] ?? ''));
        $minimumRetries = (int) $this->config->get(
            'process_supervision.safety.minimum_start_retries',
            5,
        );
        $maximumStart = (int) $this->config->get(
            'process_supervision.safety.maximum_start_seconds',
            30,
        );
        $identityIsSafe = $directory !== ''
            && $user !== ''
            && strtolower($user) !== 'root'
            && ($bundled || (
                ! $this->isPlaceholder($directory)
                && ! $this->isPlaceholder($user)
                && $this->directoryServesCurrentRelease($directory)
            ));
        $lifecycleIsSafe = $this->boolean($definition['autostart'] ?? null)
            && $this->boolean($definition['autorestart'] ?? null)
            && $startRetries !== null
            && $startRetries >= $minimumRetries
            && $startSeconds !== null
            && $startSeconds <= $maximumStart
            && strtoupper((string) ($definition['stopsignal'] ?? '')) === 'TERM'
            && $this->boolean($definition['stopasgroup'] ?? null)
            && $this->boolean($definition['killasgroup'] ?? null);

        $this->add(
            $checks,
            "{$code}.lifecycle",
            $lifecycleIsSafe && $identityIsSafe ? 'pass' : 'fail',
            $lifecycleIsSafe && $identityIsSafe
                ? 'The process starts on boot, restarts after failure, and terminates its full process group safely.'
                : 'Process identity, automatic restart, startup retry, or graceful group shutdown is unsafe.',
        );
    }

    /**
     * @param  list<array{code:string,status:string,message:string}>  $checks
     * @param  array<string, string>  $definition
     */
    private function validateLogging(array &$checks, string $code, array $definition): void
    {
        $bytes = $this->parseByteSize((string) ($definition['stdout_logfile_maxbytes'] ?? ''));
        $backups = $this->positiveInteger($definition['stdout_logfile_backups'] ?? null);
        $minimumBackups = (int) $this->config->get(
            'process_supervision.safety.minimum_log_backups',
            2,
        );
        $maximumBackups = (int) $this->config->get(
            'process_supervision.safety.maximum_log_backups',
            20,
        );
        $maximumBytes = (int) $this->config->get(
            'process_supervision.safety.maximum_log_bytes',
            104_857_600,
        );
        $valid = $this->boolean($definition['redirect_stderr'] ?? null)
            && trim((string) ($definition['stdout_logfile'] ?? '')) !== ''
            && $bytes !== null
            && $bytes > 0
            && $bytes <= $maximumBytes
            && $backups !== null
            && $backups >= $minimumBackups
            && $backups <= $maximumBackups;

        $this->add(
            $checks,
            "{$code}.logging",
            $valid ? 'pass' : 'fail',
            $valid
                ? 'Process output is captured with bounded rotation and retention.'
                : 'Process logs must capture stderr and use bounded non-zero rotation.',
        );
    }

    private function activeProfile(): ?string
    {
        $connection = trim((string) $this->config->get('background_jobs.connection', ''));
        $driver = strtolower(trim((string) $this->config->get(
            "queue.connections.{$connection}.driver",
            '',
        )));

        return in_array($driver, ['database', 'redis'], true) ? $driver : null;
    }

    /** @param array<string, mixed> $expected */
    private function expectedConnection(
        string $profile,
        string $workerKey,
        array $expected,
        bool $bundled,
    ): string {
        if ($bundled) {
            return ($expected['connection_kind'] ?? 'regular') === 'media'
                ? $profile.'-long'
                : $profile;
        }

        if ($workerKey === 'documents') {
            $invoice = trim((string) $this->config->get(
                'invoice_pdf.prewarm.connection',
                '',
            ));

            if ($invoice !== '') {
                return $invoice;
            }
        }

        return ($expected['connection_kind'] ?? 'regular') === 'media'
            ? trim((string) $this->config->get('background_jobs.media_connection', ''))
            : trim((string) $this->config->get('background_jobs.connection', ''));
    }

    private function expectedQueue(string $queueKey, string $workerKey, bool $bundled): string
    {
        if (! $bundled && $workerKey === 'documents') {
            $invoice = trim((string) $this->config->get('invoice_pdf.prewarm.queue', ''));

            if ($invoice !== '') {
                return $invoice;
            }
        }

        return trim((string) $this->config->get("background_jobs.queues.{$queueKey}", ''));
    }

    private function retryAfter(string $connection): ?int
    {
        $value = $this->config->get("queue.connections.{$connection}.retry_after");

        return is_numeric($value) && (int) $value > 0 ? (int) $value : null;
    }

    /** @param array<string, mixed> $expected */
    private function maximumJobTimeout(array $expected): ?int
    {
        $configured = null;
        $configKey = trim((string) ($expected['job_timeout_config'] ?? ''));

        if ($configKey !== '') {
            $configured = $this->config->get($configKey);
        }

        $value = $configured ?? ($expected['maximum_job_timeout'] ?? null);

        return $this->positiveInteger($value);
    }

    private function commandConnection(string $command): ?string
    {
        return preg_match('/\bqueue:work\s+([a-zA-Z0-9_.:-]+)/', $command, $matches) === 1
            ? $matches[1]
            : null;
    }

    private function commandOption(string $command, string $option): ?string
    {
        $quoted = preg_quote($option, '/');

        return preg_match('/(?:^|\s)--'.$quoted.'=([^\s]+)/', $command, $matches) === 1
            ? trim($matches[1], "\"'")
            : null;
    }

    private function normalizeSpaces(string $value): string
    {
        return trim((string) preg_replace('/\s+/', ' ', $value));
    }

    private function boolean(mixed $value): bool
    {
        return filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) === true;
    }

    private function positiveInteger(mixed $value): ?int
    {
        if (! is_numeric($value) || (int) $value < 1 || (string) (int) $value !== trim((string) $value)) {
            return null;
        }

        return (int) $value;
    }

    private function parseByteSize(string $value): ?int
    {
        if (preg_match('/^(\d+)(B|KB|MB|GB)?$/i', trim($value), $matches) !== 1) {
            return null;
        }

        $multiplier = match (strtoupper($matches[2] ?? 'B')) {
            'KB' => 1024,
            'MB' => 1024 * 1024,
            'GB' => 1024 * 1024 * 1024,
            default => 1,
        };

        $numeric = ltrim($matches[1], '0');
        $numeric = $numeric === '' ? '0' : $numeric;
        $maximumBase = intdiv(PHP_INT_MAX, $multiplier);

        if (strlen($numeric) > strlen((string) $maximumBase)
            || (strlen($numeric) === strlen((string) $maximumBase)
                && strcmp($numeric, (string) $maximumBase) > 0)) {
            return null;
        }

        return (int) $numeric * $multiplier;
    }

    private function isPlaceholder(string $value): bool
    {
        return preg_match('/\b(?:APP_DIRECTORY|RUN_AS_USER|REPLACE|PLACEHOLDER)\b/i', $value) === 1;
    }

    private function directoryServesCurrentRelease(string $directory): bool
    {
        if (! $this->isAbsolutePath($directory)) {
            return false;
        }

        $configuredArtisan = realpath(rtrim($directory, '/\\').DIRECTORY_SEPARATOR.'artisan');
        $currentArtisan = realpath(base_path('artisan'));

        if (! is_string($configuredArtisan) || ! is_string($currentArtisan)) {
            return false;
        }

        $configured = str_replace('\\', '/', $configuredArtisan);
        $current = str_replace('\\', '/', $currentArtisan);

        return DIRECTORY_SEPARATOR === '\\'
            ? strcasecmp($configured, $current) === 0
            : hash_equals($configured, $current);
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function readArtifact(string $path, array &$checks): ?string
    {
        if ($path === '' || ! is_file($path) || ! is_readable($path)) {
            $this->add(
                $checks,
                'artifact.readable',
                'fail',
                'The Supervisor artifact is missing or unreadable.',
            );

            return null;
        }

        $maximumBytes = (int) $this->config->get(
            'process_supervision.safety.maximum_artifact_bytes',
            1_048_576,
        );
        $size = filesize($path);

        if (! is_int($size) || $size < 1 || $size > $maximumBytes) {
            $this->add(
                $checks,
                'artifact.readable',
                'fail',
                'The Supervisor artifact is empty or exceeds the bounded read limit.',
            );

            return null;
        }

        $contents = file_get_contents($path, false, null, 0, $maximumBytes + 1);

        if (! is_string($contents) || strlen($contents) !== $size) {
            $this->add(
                $checks,
                'artifact.readable',
                'fail',
                'The Supervisor artifact could not be read completely.',
            );

            return null;
        }

        $this->add(
            $checks,
            'artifact.readable',
            'pass',
            'The selected Supervisor artifact is readable and bounded.',
        );

        return $contents;
    }

    private function resolvePath(string $path): string
    {
        $path = trim($path);

        if ($path === '' || $this->isAbsolutePath($path)) {
            return $path;
        }

        return base_path(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $path));
    }

    private function isAbsolutePath(string $path): bool
    {
        return preg_match('#^(?:[a-zA-Z]:[\\\\/]|/|\\\\\\\\)#', trim($path)) === 1;
    }

    /**
     * @param  list<array{code:string,status:string,message:string}>  $checks
     * @return array{profile:string,source:string,valid:bool,strict_valid:bool,failures:int,warnings:int,checks:list<array{code:string,status:string,message:string>>}
     */
    private function summarize(string $profile, string $source, array $checks): array
    {
        $failures = count(array_filter(
            $checks,
            static fn (array $check): bool => $check['status'] === 'fail',
        ));
        $warnings = count(array_filter(
            $checks,
            static fn (array $check): bool => $check['status'] === 'warning',
        ));

        return [
            'profile' => $profile,
            'source' => $source,
            'valid' => $failures === 0,
            'strict_valid' => $failures === 0 && $warnings === 0,
            'failures' => $failures,
            'warnings' => $warnings,
            'checks' => array_values($checks),
        ];
    }

    /** @param list<array{code:string,status:string,message:string}> $checks */
    private function add(array &$checks, string $code, string $status, string $message): void
    {
        $checks[] = compact('code', 'status', 'message');
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
