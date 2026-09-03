<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PublicStorageUrlTest extends TestCase
{
    public function test_public_media_urls_follow_the_current_application_origin(): void
    {
        $this->assertSame(
            '/storage/facilities/example.avif',
            Storage::disk('public')->url('facilities/example.avif'),
        );
    }
}
