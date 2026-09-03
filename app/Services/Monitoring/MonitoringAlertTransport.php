<?php

namespace App\Services\Monitoring;

use App\Models\MonitoringAlertDelivery;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class MonitoringAlertTransport
{
    public function __construct(private readonly MonitoringAlertChannelRegistry $channels) {}

    public function deliver(MonitoringAlertDelivery $delivery): void
    {
        match ($delivery->channel) {
            'log' => $this->toLog($delivery),
            'webhook' => $this->toWebhook($delivery),
            default => throw new RuntimeException('unsupported_channel'),
        };
    }

    private function toLog(MonitoringAlertDelivery $delivery): void
    {
        $level = $delivery->severity === 'critical' ? 'critical' : 'warning';
        $channel = config('monitoring.alerting.log_channel');
        $logger = is_string($channel) && trim($channel) !== ''
            ? Log::channel($channel)
            : Log::getFacadeRoot();

        $logger->log($level, 'monitoring.incident_alert', [
            'delivery_id' => $delivery->public_id,
            'event' => $delivery->event,
            'severity' => $delivery->severity,
            'payload' => $delivery->payload,
        ]);
    }

    private function toWebhook(MonitoringAlertDelivery $delivery): void
    {
        if (! $this->channels->webhookIsValid()) {
            throw new RuntimeException('webhook_not_configured');
        }

        $body = json_encode($delivery->payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        $secret = (string) config('monitoring.alerting.webhook.secret');
        $timestamp = (string) now('UTC')->timestamp;
        $deliveryId = (string) $delivery->public_id;
        $canonical = "v1\n{$timestamp}\n{$deliveryId}\n".hash('sha256', $body);
        $response = Http::timeout((int) config('monitoring.alerting.webhook.timeout_seconds', 5))
            ->connectTimeout((int) config('monitoring.alerting.webhook.connect_timeout_seconds', 2))
            ->withOptions(['allow_redirects' => false])
            ->withHeaders([
                'Content-Type' => 'application/json',
                'User-Agent' => 'UBSC-Monitoring/1.0',
                'X-UBSC-Alert-Id' => $deliveryId,
                'X-UBSC-Alert-Timestamp' => $timestamp,
                'X-UBSC-Alert-Signature' => 'sha256='.hash_hmac(
                    'sha256',
                    $canonical,
                    $secret,
                ),
            ])
            ->withBody($body, 'application/json')
            ->post((string) config('monitoring.alerting.webhook.url'));

        if (! $response->successful()) {
            throw new RuntimeException('webhook_http_'.$response->status());
        }
    }
}
