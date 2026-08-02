<?php

declare(strict_types=1);

use App\Models\BookingOrder;
use App\Models\Membership;
use App\Models\Transaction;
use App\Models\User;
use App\Services\Payments\PaymentAttemptService;
use App\Services\Payments\PaymentRecoveryService;
use Illuminate\Contracts\Console\Kernel;

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

if (! is_array($payload) || ! is_string($payload['operation'] ?? null)) {
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
    $result = match ($payload['operation']) {
        'create_payment_attempt' => (function () use ($app, $payload): array {
            $transaction = Transaction::query()->findOrFail((int) $payload['transaction_id']);
            $user = User::query()->findOrFail((int) $payload['user_id']);
            $attempt = $app->make(PaymentAttemptService::class)->createOrResume(
                $transaction,
                $user,
                (string) $payload['idempotency_key'],
                (string) $payload['request_fingerprint'],
            );

            return [
                'result' => 'attempt_created_or_resumed',
                'attempt_id' => $attempt->id,
                'attempt_number' => $attempt->attempt_number,
            ];
        })(),
        'recover_booking_order' => (function () use ($app, $payload): array {
            $order = BookingOrder::query()->findOrFail((int) $payload['booking_order_id']);
            $changed = $app->make(PaymentRecoveryService::class)
                ->recoverBookingOrder($order->id);

            return [
                'result' => $changed ? 'recovered' : 'already_recovered',
                'booking_order_id' => $order->id,
            ];
        })(),
        'recover_membership' => (function () use ($app, $payload): array {
            $membership = Membership::query()->findOrFail((int) $payload['membership_id']);
            $changed = $app->make(PaymentRecoveryService::class)
                ->recoverMembership($membership->id);

            return [
                'result' => $changed ? 'recovered' : 'already_recovered',
                'membership_id' => $membership->id,
            ];
        })(),
        default => throw new InvalidArgumentException('Unknown concurrency probe operation.'),
    };

    echo json_encode($result, JSON_THROW_ON_ERROR);
} catch (Throwable $exception) {
    fwrite(STDERR, get_class($exception).': '.$exception->getMessage()."\n");
    exit(4);
}
