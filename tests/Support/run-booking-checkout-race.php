<?php

declare(strict_types=1);

use App\Http\Controllers\Public\PublicCheckoutController;
use App\Http\Requests\StorePublicBookingCheckoutRequest;
use App\Models\BookingOrder;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

require dirname(__DIR__, 2).'/vendor/autoload.php';

$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

[$script, $barrierPath, $encodedPayload] = $argv + [null, null, null];

if (! is_string($barrierPath) || ! is_string($encodedPayload)) {
    fwrite(STDERR, "Missing concurrency probe arguments.\n");
    exit(2);
}

$decoded = base64_decode($encodedPayload, true);
$payload = is_string($decoded) ? json_decode($decoded, true) : null;

if (! is_array($payload) || ! isset($payload['user_id'], $payload['request'])) {
    fwrite(STDERR, "Invalid concurrency probe payload.\n");
    exit(2);
}

$deadline = microtime(true) + 15;
while (! is_file($barrierPath)) {
    if (microtime(true) >= $deadline) {
        fwrite(STDERR, "Concurrency barrier timed out.\n");
        exit(3);
    }

    usleep(2_000);
}

try {
    $startedAt = microtime(true);
    $trace = [];
    DB::listen(function ($query) use (&$trace, $startedAt): void {
        if (str_contains($query->sql, '`facilities`')
            || str_contains($query->sql, '`bookings`')) {
            $trace[] = [
                'at_ms' => (int) round((microtime(true) - $startedAt) * 1000),
                'duration_ms' => (float) $query->time,
                'sql' => $query->sql,
            ];
        }
    });
    $user = User::query()->findOrFail((int) $payload['user_id']);
    $request = StorePublicBookingCheckoutRequest::create(
        '/checkout/booking',
        'POST',
        $payload['request'],
    );
    $request->setUserResolver(static fn (): User => $user);
    $request->setContainer($app);
    $request->setRedirector($app->make('redirect'));
    $request->validateResolved();
    $app->instance('request', $request);
    Auth::setUser($user);

    $app->make(PublicCheckoutController::class)->store($request);
    $order = BookingOrder::query()
        ->where('idempotency_key', $payload['request']['idempotency_key'])
        ->firstOrFail();

    echo json_encode([
        'result' => 'created',
        'order_id' => $order->id,
        'database' => DB::connection()->getDatabaseName(),
        'trace' => $trace,
    ], JSON_THROW_ON_ERROR);
} catch (ValidationException $exception) {
    echo json_encode([
        'result' => 'conflict',
        'errors' => $exception->errors(),
        'database' => DB::connection()->getDatabaseName(),
        'trace' => $trace,
    ], JSON_THROW_ON_ERROR);
} catch (Throwable $exception) {
    fwrite(STDERR, get_class($exception).': '.$exception->getMessage()."\n");
    exit(4);
}
