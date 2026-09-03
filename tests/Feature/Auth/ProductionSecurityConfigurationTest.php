<?php

namespace Tests\Feature\Auth;

use App\Providers\AppServiceProvider;
use Illuminate\Encryption\Encrypter;
use RuntimeException;
use Tests\TestCase;

class ProductionSecurityConfigurationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->app->detectEnvironment(static fn (): string => 'production');
        config([
            'app.debug' => false,
            'app.cipher' => 'AES-256-CBC',
            'app.key' => 'base64:'.base64_encode(Encrypter::generateKey('AES-256-CBC')),
            'app.url' => 'https://example.com',
            'seo.canonical_origin' => 'https://example.com',
            'passkeys.user_handle_secret' => str_repeat('p', 32),
            'passkeys.user_handle_secret_is_dedicated' => true,
            'passkeys.relying_party_id' => 'example.com',
            'passkeys.allowed_origins' => ['https://example.com'],
            'security.admin_mfa.recovery_pepper' => str_repeat('r', 32),
            'security.admin_mfa.recovery_pepper_is_dedicated' => true,
            'security.trusted_proxies' => '',
            'session.encrypt' => true,
            'session.secure' => true,
            'session.http_only' => true,
            'session.same_site' => 'lax',
            'session.driver' => 'database',
            'cache.default' => 'database',
            'database.default' => 'mysql',
            'database.connections.mysql.driver' => 'mysql',
            'queue.default' => 'database',
            'mail.default' => 'smtp',
        ]);
    }

    public function test_secure_production_configuration_is_accepted(): void
    {
        $this->validateProductionSecurityConfiguration();

        $this->addToAssertionCount(1);
    }

    public function test_production_debug_mode_is_rejected(): void
    {
        config(['app.debug' => true]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('APP_DEBUG');

        $this->validateProductionSecurityConfiguration();
    }

    public function test_missing_or_malformed_application_key_is_rejected(): void
    {
        config(['app.key' => 'base64:not-a-valid-key']);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('APP_KEY');

        $this->validateProductionSecurityConfiguration();
    }

    public function test_non_delivery_mailer_is_rejected(): void
    {
        config(['mail.default' => 'array']);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('delivery mailers');

        $this->validateProductionSecurityConfiguration();
    }

    public function test_failover_chain_cannot_fall_back_to_a_log_transport(): void
    {
        config([
            'mail.default' => 'failover',
            'mail.mailers.failover' => [
                'transport' => 'failover',
                'mailers' => ['smtp', 'log'],
            ],
        ]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('delivery mailers');

        $this->validateProductionSecurityConfiguration();
    }

    public function test_database_without_row_level_locking_is_rejected(): void
    {
        config([
            'database.default' => 'sqlite',
            'database.connections.sqlite.driver' => 'sqlite',
        ]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('row-level locking');

        $this->validateProductionSecurityConfiguration();
    }

    public function test_broad_or_noncanonical_trusted_proxy_network_is_rejected(): void
    {
        config(['security.trusted_proxies' => '10.0.0.7/8']);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('TRUSTED_PROXIES');

        $this->validateProductionSecurityConfiguration();
    }

    private function validateProductionSecurityConfiguration(): void
    {
        $provider = new AppServiceProvider($this->app);
        $validator = \Closure::bind(
            fn () => $this->validateProductionSecurityConfiguration(),
            $provider,
            AppServiceProvider::class,
        );

        $validator();
    }
}
