<?php

namespace Tests\Unit;

use JsonException;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Process\Process;

final class DdosProtectionArtifactTest extends TestCase
{
    public function test_provider_evidence_requires_every_live_control_to_be_true(): void
    {
        $valid = $this->evidence();
        $accepted = $this->validate($valid);

        self::assertTrue($accepted->isSuccessful(), $accepted->getErrorOutput());
        self::assertStringContainsString('live managed edge controls are enabled', $accepted->getOutput());

        $valid['cdn'] = false;
        $rejected = $this->validate($valid);

        self::assertFalse($rejected->isSuccessful());
        self::assertStringContainsString('[cdn] as disabled', $rejected->getErrorOutput());

        $valid = $this->evidence();
        $valid['challenge'] = str_repeat('b', 64);
        $replayed = $this->validate($valid);
        self::assertFalse($replayed->isSuccessful());
        self::assertStringContainsString('not bound to this verification run', $replayed->getErrorOutput());
    }

    public function test_provider_evidence_rejects_stale_extra_or_secret_bearing_state(): void
    {
        $stale = $this->evidence();
        $stale['checked_at'] = gmdate('Y-m-d\TH:i:s\Z', time() - 121);
        self::assertFalse($this->validate($stale)->isSuccessful());

        $extra = $this->evidence();
        $extra['api_token'] = 'must-never-be-accepted';
        $process = $this->validate($extra);
        self::assertFalse($process->isSuccessful());
        self::assertStringNotContainsString('must-never-be-accepted', $process->getErrorOutput());
    }

    public function test_provider_evidence_is_bound_to_the_exact_origin_and_zone(): void
    {
        $wrongOrigin = $this->evidence();
        $wrongOrigin['origin'] = 'https://wrong.example';
        $process = $this->validate($wrongOrigin);
        self::assertFalse($process->isSuccessful());
        self::assertStringContainsString('configured public origin', $process->getErrorOutput());

        $wrongZone = $this->evidence();
        $wrongZone['zone_id'] = 'zone-staging-02';
        $process = $this->validate($wrongZone);
        self::assertFalse($process->isSuccessful());
        self::assertStringContainsString('configured provider zone', $process->getErrorOutput());
    }

    public function test_verifier_configuration_reader_accepts_only_allowlisted_non_secret_values(): void
    {
        $payload = [
            'schema' => 'ubsc.ddos-verification-config.v2',
            'provider' => 'managed-edge-provider',
            'provider_hook' => '/usr/local/libexec/ubsc-verify-ddos-provider',
            'provider_zone_fingerprint' => hash('sha256', 'zone-production-01'),
            'public_origin' => 'https://ubsportcenter.co.id',
            'edge_response_header' => 'x-edge-request-id',
            'timeout_seconds' => 30,
        ];

        $accepted = $this->readVerificationConfig($payload);
        self::assertTrue($accepted->isSuccessful(), $accepted->getErrorOutput());
        self::assertSame(
            "managed-edge-provider\n/usr/local/libexec/ubsc-verify-ddos-provider\nhttps://ubsportcenter.co.id\n".
            hash('sha256', 'zone-production-01')."\nx-edge-request-id\n30\n",
            $accepted->getOutput(),
        );

        $payload['provider_hook'] = '/tmp/untrusted-hook';
        self::assertFalse($this->readVerificationConfig($payload)->isSuccessful());

        $payload['provider_hook'] = '/usr/local/libexec/ubsc-verify-ddos-provider';
        $payload['provider_zone_fingerprint'] = str_repeat('0', 64);
        self::assertFalse($this->readVerificationConfig($payload)->isSuccessful());

        $payload['provider_zone_fingerprint'] = hash('sha256', 'zone-production-01');
        $payload['credential'] = 'forbidden';
        self::assertFalse($this->readVerificationConfig($payload)->isSuccessful());
    }

    public function test_edge_and_origin_artifacts_are_fail_closed_and_bounded(): void
    {
        $provider = $this->artifact('deploy/scripts/verify-ddos-protection.sh');
        $origin = $this->artifact('deploy/scripts/verify-origin-isolation.sh');
        $loadBalancer = $this->artifact('deploy/load-balancer/haproxy.cfg.example');
        $nginxZones = $this->artifact('deploy/nginx/00-ubsc-traffic-zones.conf.example');
        $nginxOrigin = $this->artifact('deploy/nginx/ubsc-origin.conf.example');

        self::assertStringContainsString('set -Eeuo pipefail', $provider);
        self::assertStringContainsString('root-owned without special, group-write, or any other-user bits', $provider);
        self::assertStringContainsString('HOOK_DIRECTORY_OWNER', $provider);
        self::assertStringContainsString('HOOK_DIRECTORY_MODE_DECIMAL & 8#7022', $provider);
        self::assertStringContainsString('2>/dev/null', $provider);
        self::assertStringContainsString('head -c 4097', $provider);
        self::assertStringContainsString('head -c 65537', $provider);
        self::assertStringContainsString('--verification-config', $provider);
        self::assertStringContainsString('--challenge "${CHALLENGE}"', $provider);
        self::assertStringContainsString('read-ddos-verification-config.php', $provider);
        self::assertStringContainsString('validate-ddos-provider-evidence.php', $provider);
        self::assertStringContainsString('CONFIGURED_PUBLIC_ORIGIN="${CONFIG_VALUES[2]}"', $provider);
        self::assertStringContainsString('PROVIDER_ZONE_FINGERPRINT="${CONFIG_VALUES[3]}"', $provider);
        self::assertStringContainsString('EDGE_RESPONSE_HEADER="${CONFIG_VALUES[4]}"', $provider);
        self::assertStringContainsString('!= "${CONFIGURED_PUBLIC_ORIGIN}"', $provider);

        self::assertStringContainsString('FILTER_VALIDATE_IP', $origin);
        self::assertStringContainsString('count > 16', $origin);
        self::assertStringContainsString('ORIGIN_PORTS="${3:-80,443,8443}"', $origin);
        self::assertStringContainsString('--insecure', $origin);
        self::assertStringContainsString("--write-out '%{http_code}|%{remote_ip}'", $origin);
        self::assertStringContainsString('"${status}" != \'000\'', $origin);
        self::assertStringContainsString('-n "${remote_ip}"', $origin);
        self::assertStringNotContainsString('000|403|421', $origin);

        self::assertStringContainsString('/etc/haproxy/ubsc-edge-cidrs.lst', $loadBalancer);
        self::assertStringContainsString('req.hdr_cnt(X-Verified-Client-IP) eq 1', $loadBalancer);
        self::assertStringContainsString('^[0-9A-Fa-f:.]{2,45}$', $loadBalancer);
        self::assertStringContainsString('del-header X-Verified-Client-IP', $loadBalancer);
        self::assertStringContainsString('set-header X-Forwarded-For %[var(txn.ubsc_client_ip)]', $loadBalancer);
        self::assertStringContainsString('http-request deny deny_status 421 unless ubsc_canonical_host', $loadBalancer);
        self::assertStringContainsString('hdr Host PUBLIC_HOSTNAME', $loadBalancer);
        self::assertStringContainsString('timeout queue 5s', $loadBalancer);
        self::assertStringContainsString('10.0.1.11:8443 check ssl verify required', $loadBalancer);
        self::assertStringContainsString('verifyhost ORIGIN_HOSTNAME', $loadBalancer);
        self::assertStringContainsString('maxconn 256 maxqueue 512', $loadBalancer);
        self::assertStringNotContainsString('10.0.1.11:8080', $loadBalancer);

        self::assertStringContainsString('zone=ubsc_dynamic_per_node', $nginxZones);
        self::assertStringContainsString('zone=ubsc_sensitive_per_ip', $nginxZones);
        self::assertStringContainsString(
            'geo $realip_remote_addr $ubsc_load_balancer_allowed',
            $nginxZones,
        );
        self::assertStringContainsString('LOAD_BALANCER_CIDR 1;', $nginxZones);
        self::assertStringContainsString(
            'if ($ubsc_load_balancer_allowed = 0) { return 403; }',
            $nginxOrigin,
        );
        self::assertStringContainsString('if ($host != PUBLIC_HOSTNAME) { return 421; }', $nginxOrigin);
        self::assertStringContainsString('server_name PUBLIC_HOSTNAME ORIGIN_HOSTNAME;', $nginxOrigin);
        self::assertStringContainsString('location = /index.php', $nginxOrigin);
        self::assertStringContainsString('location ~ \.php(?:/|$)', $nginxOrigin);
        self::assertStringContainsString('fastcgi_param HTTPS on;', $nginxOrigin);
        self::assertStringContainsString('fastcgi_param SERVER_PORT 443;', $nginxOrigin);
        self::assertStringContainsString('fastcgi_param HTTP_X_FORWARDED_PORT 443;', $nginxOrigin);
        self::assertStringNotContainsString('SCRIPT_FILENAME $realpath_root$fastcgi_script_name', $nginxOrigin);
        self::assertStringNotContainsString('allow LOAD_BALANCER_CIDR;', $nginxOrigin);
        self::assertStringContainsString('client_max_body_size 2m;', $nginxOrigin);
        self::assertStringContainsString('client_max_body_size 24m;', $nginxOrigin);
        self::assertStringContainsString('client_max_body_size 8m;', $nginxOrigin);
        self::assertStringContainsString('client_max_body_size 64k;', $nginxOrigin);
        self::assertStringContainsString('external-sli|log-receipts', $nginxOrigin);
        self::assertStringContainsString('external-sli|log-receipts', $nginxZones);
        self::assertStringContainsString('client_body_timeout 15s;', $nginxOrigin);
        self::assertStringContainsString('limit_req zone=ubsc_dynamic_per_node', $nginxOrigin);
    }

    public function test_release_and_external_workflow_require_independent_ddos_proofs(): void
    {
        $release = $this->artifact('deploy/scripts/verify-production-readiness.sh');
        $activation = $this->artifact('deploy/scripts/activate-release.sh');
        $rollout = $this->artifact('deploy/scripts/atomic-node-rollout.sh');
        $workflow = $this->artifact('.github/workflows/ddos-posture.yml');
        $environment = $this->artifact('deploy/production.env.example');

        self::assertStringContainsString('artisan production:ddos-check --strict', $release);
        self::assertStringContainsString('verify-ddos-protection.sh', $release);
        self::assertStringContainsString('production:ddos-check --strict', $activation);
        self::assertStringContainsString('production:ddos-check --strict', $rollout);
        self::assertStringContainsString('verify-origin-isolation.sh', $workflow);
        self::assertStringContainsString('secrets.EDGE_ORIGIN_IPS', $workflow);
        self::assertStringContainsString('persist-credentials: false', $workflow);

        foreach ([
            'DDOS_PROTECTION_CONTRACT_ENFORCE=true',
            'DDOS_EDGE_GLOBAL_SCRUBBING=true',
            'DDOS_EDGE_L3_L4_AUTOMATIC=true',
            'DDOS_EDGE_L7_AUTOMATIC=true',
            'DDOS_ORIGIN_DIRECT_ACCESS_DISABLED=true',
            'DDOS_PROVIDER_VERIFICATION_MODE=provider_api',
            'DDOS_PROVIDER_ZONE_FINGERPRINT=replace-with-sha256-of-exact-provider-zone-id',
            'SEO_CANONICAL_ORIGIN=https://ubsportcenter.co.id',
            'CACHE_LIMITER_STORE=traffic',
            'REDIS_TRAFFIC_URL=rediss://',
            'MONITORING_READINESS_REQUIRED_CHECKS=database,cache,sessions,locks,traffic',
        ] as $proof) {
            self::assertStringContainsString($proof, $environment);
        }
    }

    /** @return array<string, bool|string> */
    private function evidence(): array
    {
        return [
            'schema' => 'ubsc.ddos-provider-evidence.v2',
            'evidence_id' => '4d2bba82-d3e0-4bb0-b522-b40fb58de133',
            'challenge' => str_repeat('a', 64),
            'provider' => 'managed-edge-provider',
            'origin' => 'https://ubsportcenter.co.id',
            'zone_id' => 'zone-production-01',
            'checked_at' => gmdate('Y-m-d\TH:i:s\Z'),
            'managed_dns' => true,
            'cdn' => true,
            'waf' => true,
            'ddos' => true,
            'automatic_l3_l4' => true,
            'automatic_l7' => true,
            'adaptive_rate_limiting' => true,
            'bot_management' => true,
            'origin_restricted' => true,
            'security_event_stream' => true,
            'attack_alerting' => true,
        ];
    }

    /** @param array<string, mixed> $payload
     * @throws JsonException
     */
    private function validate(array $payload): Process
    {
        $path = tempnam(sys_get_temp_dir(), 'ubsc-ddos-evidence-');
        self::assertIsString($path);

        try {
            file_put_contents($path, json_encode($payload, JSON_THROW_ON_ERROR));
            $process = new Process([
                PHP_BINARY,
                $this->projectPath('deploy/scripts/validate-ddos-provider-evidence.php'),
                $path,
                'managed-edge-provider',
                str_repeat('a', 64),
                'https://ubsportcenter.co.id',
                hash('sha256', 'zone-production-01'),
            ]);
            $process->setTimeout(5);
            $process->run();

            return $process;
        } finally {
            @unlink($path);
        }
    }

    /** @param array<string, mixed> $payload
     * @throws JsonException
     */
    private function readVerificationConfig(array $payload): Process
    {
        $path = tempnam(sys_get_temp_dir(), 'ubsc-ddos-config-');
        self::assertIsString($path);

        try {
            file_put_contents($path, json_encode($payload, JSON_THROW_ON_ERROR));
            $process = new Process([
                PHP_BINARY,
                $this->projectPath('deploy/scripts/read-ddos-verification-config.php'),
                $path,
            ]);
            $process->setTimeout(5);
            $process->run();

            return $process;
        } finally {
            @unlink($path);
        }
    }

    private function artifact(string $path): string
    {
        $contents = file_get_contents($this->projectPath($path));
        self::assertIsString($contents, "Missing deployment artifact: {$path}");

        return $contents;
    }

    private function projectPath(string $path): string
    {
        return dirname(__DIR__, 2).DIRECTORY_SEPARATOR.str_replace(
            '/',
            DIRECTORY_SEPARATOR,
            $path,
        );
    }
}
