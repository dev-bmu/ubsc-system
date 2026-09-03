<?php

declare(strict_types=1);

use App\Services\Production\ResilienceDrillLedger;
use Illuminate\Contracts\Console\Kernel;
use Tests\Support\TestingDatabaseGuard;

require dirname(__DIR__, 2).'/vendor/autoload.php';

$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$connectionName = (string) $app['config']->get('database.default');
$connection = $app['db']->connection($connectionName);
TestingDatabaseGuard::assertSafe(
    (string) $app->environment(),
    (string) $connection->getDriverName(),
    (string) $connection->getDatabaseName(),
);

if ($argc !== 5) {
    fwrite(STDERR, "Expected barrier, ready marker, configuration, and envelope arguments.\n");
    exit(64);
}

try {
    $configuration = json_decode(
        base64_decode((string) $argv[3], true),
        true,
        16,
        JSON_THROW_ON_ERROR,
    );
    $envelope = json_decode(
        base64_decode((string) $argv[4], true),
        true,
        32,
        JSON_THROW_ON_ERROR,
    );
    if (! is_array($configuration) || ! is_array($envelope)) {
        throw new RuntimeException('Race input is malformed.');
    }
    foreach ($configuration as $key => $value) {
        if (! is_string($key) || ! str_starts_with($key, 'resilience_drills.')) {
            throw new RuntimeException('Race configuration key is outside resilience scope.');
        }
        config()->set($key, $value);
    }

    if (! @touch((string) $argv[2])) {
        throw new RuntimeException('Race ready marker could not be created.');
    }

    $deadline = microtime(true) + 15;
    while (! is_file((string) $argv[1])) {
        if (microtime(true) >= $deadline) {
            throw new RuntimeException('Race barrier timed out.');
        }
        usleep(10_000);
    }

    $evidence = app(ResilienceDrillLedger::class)->record($envelope);
    fwrite(STDOUT, json_encode([
        'result' => 'recorded',
        'campaign_id' => (string) $evidence->campaign_id,
        'sequence' => (int) $evidence->sequence,
        'record_hash' => (string) $evidence->record_hash,
    ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
} catch (Throwable $exception) {
    fwrite(STDERR, json_encode([
        'result' => 'failed',
        'failure_class' => $exception::class,
    ], JSON_THROW_ON_ERROR));
    exit(1);
}
