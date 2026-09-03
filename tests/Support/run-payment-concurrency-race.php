<?php

declare(strict_types=1);

use App\Http\Controllers\Public\MockPaymentController;
use App\Models\BookingOrder;
use App\Models\Membership;
use App\Models\Transaction;
use App\Models\User;
use App\Services\Invoices\InvoicePdfArtifactService;
use App\Services\Monitoring\PerformanceMetricRepository;
use App\Services\Payments\PaymentAttemptService;
use App\Services\Payments\PaymentRecoveryService;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

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
        'pay_booking_order' => (function () use ($app, $payload): array {
            $order = BookingOrder::query()->findOrFail((int) $payload['booking_order_id']);
            $user = User::query()->findOrFail((int) $payload['user_id']);
            $request = Request::create(
                '/checkout/booking/'.$order->id.'/pay',
                'POST',
                [
                    'idempotency_key' => (string) $payload['idempotency_key'],
                    'payment_method' => (string) $payload['payment_method'],
                    'customer_name' => (string) $payload['customer_name'],
                    'whatsapp_number' => (string) $payload['whatsapp_number'],
                    'identity_category' => (string) $payload['identity_category'],
                    'identity_number' => $payload['identity_number'] ?? null,
                    'notes' => $payload['notes'] ?? null,
                ],
            );
            $request->setUserResolver(static fn (): User => $user);
            $app->instance('request', $request);
            Auth::setUser($user);

            $app->make(MockPaymentController::class)->pay($request, $order);
            $order->refresh();
            $order->loadMissing('transaction');

            return [
                'result' => 'payment_completed',
                'booking_order_id' => $order->id,
                'order_status' => $order->status,
                'transaction_status' => $order->transaction?->payment_status,
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
        'generate_booking_invoice' => (function () use ($app, $payload): array {
            $order = BookingOrder::query()->findOrFail((int) $payload['booking_order_id']);
            $artifact = $app->make(InvoicePdfArtifactService::class)
                ->generateForBooking($order);

            return [
                'result' => 'artifact_ready',
                'artifact_id' => $artifact->id,
                'cache_key' => $artifact->cache_key,
                'path' => $artifact->path,
                'sha256' => $artifact->content_sha256,
                'size_bytes' => $artifact->size_bytes,
            ];
        })(),
        'record_request_metric' => (function () use ($app, $payload): array {
            $app->make(PerformanceMetricRepository::class)->recordRequest(
                scope: (string) $payload['scope'],
                durationMs: (int) $payload['duration_ms'],
                failed: (bool) ($payload['failed'] ?? false),
                at: CarbonImmutable::parse((string) $payload['sampled_at']),
            );

            return ['result' => 'metric_recorded'];
        })(),
        default => throw new InvalidArgumentException('Unknown concurrency probe operation.'),
    };

    echo json_encode($result, JSON_THROW_ON_ERROR);
} catch (Throwable $exception) {
    fwrite(STDERR, get_class($exception).': '.$exception->getMessage()."\n");
    exit(4);
}
