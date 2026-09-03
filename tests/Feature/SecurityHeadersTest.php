<?php

namespace Tests\Feature;

use App\Http\Middleware\EnforceCanonicalHost;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SecurityHeadersTest extends TestCase
{
    use RefreshDatabase;

    public function test_html_responses_use_nonce_based_browser_security_headers(): void
    {
        $response = $this->get('/');

        $response->assertOk();
        $policy = (string) $response->headers->get('Content-Security-Policy');

        $this->assertMatchesRegularExpression("/script-src[^;]*'nonce-([A-Za-z0-9]+)'/", $policy);
        preg_match("/'nonce-([A-Za-z0-9]+)'/", $policy, $matches);

        $response->assertSee('name="csrf-token"', false);
        $response->assertSee('nonce="'.$matches[1].'"', false);
        $this->assertStringContainsString("object-src 'none'", $policy);
        $this->assertStringContainsString("frame-ancestors 'none'", $policy);
        $this->assertStringContainsString('http://[::1]:*', $policy);
        $this->assertStringNotContainsString("script-src 'unsafe-inline'", $policy);
        $this->assertStringNotContainsString("'unsafe-eval'", $policy);
        $this->assertSame('nosniff', $response->headers->get('X-Content-Type-Options'));
        $this->assertSame('DENY', $response->headers->get('X-Frame-Options'));
        $this->assertSame(
            'strict-origin-when-cross-origin',
            $response->headers->get('Referrer-Policy'),
        );
        $this->assertSame(
            'camera=(), microphone=(), geolocation=(self), payment=(self), usb=()',
            $response->headers->get('Permissions-Policy'),
        );
    }

    public function test_hsts_is_only_sent_for_secure_production_requests(): void
    {
        $this->withoutMiddleware(EnforceCanonicalHost::class);
        $this->app->detectEnvironment(fn (): string => 'production');

        $httpResponse = $this->get('/');
        $httpResponse->assertHeaderMissing('Strict-Transport-Security');

        $policy = (string) $httpResponse->headers->get('Content-Security-Policy');
        $this->assertStringContainsString('upgrade-insecure-requests', $policy);
        $this->assertStringNotContainsString('http://localhost:', $policy);
        $this->assertStringNotContainsString('http://[::1]:', $policy);

        $this->get('https://localhost/')
            ->assertHeader('Strict-Transport-Security', 'max-age=31536000');
    }

    public function test_exception_responses_receive_the_same_security_baseline(): void
    {
        $response = $this->get('/__security-missing-route');

        $response->assertNotFound();
        $this->assertStringContainsString(
            "frame-ancestors 'none'",
            (string) $response->headers->get('Content-Security-Policy'),
        );
        $response
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'DENY');
    }
}
