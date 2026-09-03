<?php

namespace Tests\Unit;

use App\Support\NewsContentSanitizer;
use App\Support\SafePublicUrl;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class ContentSecuritySanitizerTest extends TestCase
{
    public function test_rich_text_sanitizer_removes_active_content_and_unsafe_links(): void
    {
        $clean = NewsContentSanitizer::clean(
            '<p onclick="alert(1)">Aman<script>alert(2)</script>'
            .'<img src=x onerror="alert(3)">'
            .'<a href="javascript:alert(4)" target="_self">tautan</a>'
            .'<a href="https://example.com/news">resmi</a></p>',
        );

        $this->assertStringContainsString('<p>Aman', $clean);
        $this->assertStringNotContainsString('onclick', $clean);
        $this->assertStringNotContainsString('<script', $clean);
        $this->assertStringNotContainsString('<img', $clean);
        $this->assertStringNotContainsString('javascript:', $clean);
        $this->assertStringContainsString('rel="noopener noreferrer nofollow"', $clean);
    }

    #[DataProvider('unsafeMapUrls')]
    public function test_google_map_url_policy_rejects_unsafe_or_untrusted_urls(
        string $url,
    ): void {
        $this->assertNull(SafePublicUrl::googleMaps($url));
    }

    public static function unsafeMapUrls(): array
    {
        return [
            'javascript' => ['javascript:alert(1)'],
            'data' => ['data:text/html,<script>alert(1)</script>'],
            'scheme relative' => ['//maps.google.com/example'],
            'credentials' => ['https://user:pass@google.com/maps'],
            'lookalike host' => ['https://google.com.attacker.test/maps'],
            'untrusted https host' => ['https://example.com/maps'],
            'encoded newline' => ['https://google.com/maps%0d%0aevil'],
        ];
    }

    public function test_google_map_url_policy_accepts_expected_hosts(): void
    {
        foreach ([
            'https://www.google.com/maps?q=UBSC',
            'https://maps.google.com/maps?q=UBSC',
            'https://maps.app.goo.gl/X7uRTbmnwqKAGfXr8',
        ] as $url) {
            $this->assertSame($url, SafePublicUrl::googleMaps($url));
        }
    }
}
