<?php

namespace App\Services\Monitoring;

class MonitoringAlertChannelRegistry
{
    /** @return list<string> */
    public function activeChannels(): array
    {
        return collect($this->descriptors())
            ->where('configured', true)
            ->pluck('key')
            ->values()
            ->all();
    }

    /** @return list<array{key:string,label:string,configured:bool,off_host:bool,message:string}> */
    public function descriptors(): array
    {
        $requested = collect((array) config('monitoring.alerting.channels', []))
            ->filter(static fn (mixed $channel): bool => is_string($channel) && trim($channel) !== '')
            ->map(static fn (string $channel): string => strtolower(trim($channel)))
            ->unique()
            ->values();

        return $requested->map(function (string $channel): array {
            return match ($channel) {
                'log' => [
                    'key' => 'log',
                    'label' => 'Sanitized application log',
                    'configured' => true,
                    'off_host' => false,
                    'message' => 'Local fallback only; ship this log off-host in production.',
                ],
                'webhook' => [
                    'key' => 'webhook',
                    'label' => 'Signed incident webhook',
                    'configured' => $this->webhookIsValid(),
                    'off_host' => true,
                    'message' => $this->webhookIsValid()
                        ? 'HTTPS destination and HMAC signing secret are configured.'
                        : 'A valid HTTPS URL and a secret of at least 32 characters are required.',
                ],
                default => [
                    'key' => $channel,
                    'label' => 'Unsupported channel',
                    'configured' => false,
                    'off_host' => false,
                    'message' => 'This channel is not supported by the current deployment.',
                ],
            };
        })->all();
    }

    public function hasOffHostChannel(): bool
    {
        return collect($this->descriptors())->contains(
            static fn (array $channel): bool => $channel['configured'] && $channel['off_host'],
        );
    }

    public function webhookIsValid(): bool
    {
        $url = (string) config('monitoring.alerting.webhook.url', '');
        $secret = (string) config('monitoring.alerting.webhook.secret', '');
        $parts = parse_url($url);

        if (! is_array($parts)
            || ! isset($parts['scheme'], $parts['host'])
            || isset($parts['user'], $parts['pass'])
            || ! $this->isStrongSecret($secret)) {
            return false;
        }

        $host = strtolower((string) $parts['host']);
        $applicationHost = strtolower((string) parse_url(
            (string) config('app.url'),
            PHP_URL_HOST,
        ));
        if ($host === 'localhost'
            || str_ends_with($host, '.localhost')
            || ($applicationHost !== '' && hash_equals($applicationHost, $host))
            || (filter_var($host, FILTER_VALIDATE_IP) !== false
                && filter_var(
                    $host,
                    FILTER_VALIDATE_IP,
                    FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE,
                ) === false)) {
            return false;
        }

        $scheme = strtolower((string) $parts['scheme']);

        if ($scheme === 'https') {
            return true;
        }

        return in_array((string) config('app.env'), ['local', 'testing'], true)
            && $scheme === 'http';
    }

    private function isStrongSecret(string $value): bool
    {
        return strlen($value) >= 32
            && preg_match('/replace|example|placeholder|secret-manager/i', $value) !== 1
            && count(array_unique(unpack('C*', $value) ?: [])) >= 8;
    }
}
