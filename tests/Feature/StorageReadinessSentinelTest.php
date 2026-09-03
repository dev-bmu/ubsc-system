<?php

namespace Tests\Feature;

use App\Services\Monitoring\ReadinessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

final class StorageReadinessSentinelTest extends TestCase
{
    use RefreshDatabase;

    public function test_check_mode_never_creates_a_missing_sentinel(): void
    {
        Storage::fake('sentinel-test');
        $this->configure('health/readiness-v1.txt');

        $this->artisan('production:storage-sentinel', ['--check' => true])
            ->assertFailed();

        Storage::disk('sentinel-test')->assertMissing('health/readiness-v1.txt');
    }

    public function test_provisioning_writes_and_verifies_the_exact_bounded_marker(): void
    {
        Storage::fake('sentinel-test');
        $this->configure('health/readiness-v1.txt');

        $this->artisan('production:storage-sentinel')->assertSuccessful();

        self::assertSame(
            "ubsc-storage-readiness-v1\n",
            Storage::disk('sentinel-test')->get('health/readiness-v1.txt'),
        );
        $this->artisan('production:storage-sentinel', ['--check' => true])
            ->assertSuccessful();
    }

    public function test_tampered_marker_and_every_traversal_form_fail_closed(): void
    {
        Storage::fake('sentinel-test');
        $this->configure('health/readiness-v1.txt');
        Storage::disk('sentinel-test')->put('health/readiness-v1.txt', 'tampered');

        $this->artisan('production:storage-sentinel', ['--check' => true])
            ->assertFailed();

        foreach (['../sentinel', 'health/..', 'health\\..\\sentinel', './sentinel'] as $path) {
            $this->configure($path);
            $this->artisan('production:storage-sentinel')->assertExitCode(2);
        }
    }

    public function test_deep_readiness_rejects_a_tampered_marker_not_only_a_missing_file(): void
    {
        Storage::fake('sentinel-test');
        $this->configure('health/readiness-v1.txt');
        Storage::disk('sentinel-test')->put('health/readiness-v1.txt', 'tampered');
        config()->set('monitoring.readiness.required_checks', ['database']);
        config()->set('monitoring.readiness.advisory_checks', []);
        config()->set('monitoring.readiness.deep_checks', ['storage']);
        config()->set('resilience.safe_retry.attempts', 1);

        $report = app(ReadinessService::class)->report(true);
        $storage = collect($report['checks'])->firstWhere('key', 'storage');

        self::assertTrue($report['ready']);
        self::assertTrue($report['degraded']);
        self::assertSame('outage', $storage['status']);
    }

    private function configure(string $path): void
    {
        config()->set('monitoring.readiness.storage_disk', 'sentinel-test');
        config()->set('monitoring.readiness.storage_sentinel', $path);
    }
}
