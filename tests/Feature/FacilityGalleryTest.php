<?php

namespace Tests\Feature;

use App\Enums\GalleryItemStatus;
use App\Enums\GalleryMediaType;
use App\Jobs\ProcessGalleryMedia;
use App\Models\Facility;
use App\Models\Gallery\GalleryAnalyticsEvent;
use App\Models\Gallery\GalleryItem;
use App\Models\Gallery\GalleryLocation;
use App\Models\Gallery\GallerySection;
use App\Models\User;
use App\Services\Gallery\GalleryPublicationService;
use App\Services\Gallery\GalleryPublicService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class FacilityGalleryTest extends TestCase
{
    use RefreshDatabase;

    public function test_incomplete_active_section_uses_atomic_fallback_until_quota_is_complete(): void
    {
        $section = GallerySection::query()->where('key', 'indoor')->firstOrFail();
        $section->update(['is_active' => true]);

        foreach (range(1, $section->quota - 1) as $position) {
            $this->publishedItem($section, $position);
        }

        $payload = app(GalleryPublicService::class)->curatedSections();
        $this->assertFalse($payload['indoor']['active']);
        $this->assertSame([], $payload['indoor']['items']);

        $this->publishedItem($section, $section->quota);
        $payload = app(GalleryPublicService::class)->curatedSections();
        $this->assertTrue($payload['indoor']['active']);
        $this->assertCount($section->quota, $payload['indoor']['items']);
    }

    public function test_archive_exposes_only_published_media_from_active_sections(): void
    {
        $section = GallerySection::query()->where('key', 'indoor')->firstOrFail();
        $section->update(['is_active' => true]);
        $published = $this->publishedItem($section, 1);
        $this->galleryItem($section, GalleryItemStatus::Draft, 2);

        $this->get(route('gallery.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Gallery/Index')
                ->has('items.data', 1)
                ->where('items.data.0.uuid', $published->uuid)
                ->where('items.data.0.title', 'Arena 01'));
    }

    public function test_inactive_section_route_is_not_indexable(): void
    {
        $section = GallerySection::query()->where('key', 'exclusive')->firstOrFail();
        $this->get(route('gallery.section', $section->slug))->assertNotFound();

        $section->update(['is_active' => true]);
        $this->get(route('gallery.section', $section->slug))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Gallery/Index')
                ->where('active_section.key', 'exclusive'));
    }

    public function test_gallery_admin_requires_its_own_permission(): void
    {
        $role = Role::firstOrCreate(['name' => 'Staff Central', 'guard_name' => 'web']);
        $permission = Permission::firstOrCreate(['name' => 'view-facility-gallery', 'guard_name' => 'web']);
        $user = User::factory()->create();
        $user->assignRole($role);

        $this->actingAs($user)->get(route('admin.gallery.index'))->assertForbidden();

        $user->givePermissionTo($permission);
        $this->actingAs($user)->get(route('admin.gallery.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Admin/Gallery/Index'));
    }

    public function test_image_upload_creates_standalone_gallery_item_and_dispatches_processing(): void
    {
        Queue::fake();
        Storage::fake('local');
        Storage::fake('public');
        $role = Role::firstOrCreate(['name' => 'Staff Central', 'guard_name' => 'web']);
        $permission = Permission::firstOrCreate(['name' => 'manage-facility-gallery', 'guard_name' => 'web']);
        $user = User::factory()->create();
        $user->assignRole($role);
        $user->givePermissionTo($permission);
        $section = GallerySection::query()->where('key', 'indoor')->firstOrFail();
        $location = GalleryLocation::query()->where('slug', 'veteran')->firstOrFail();
        $facilityCount = Facility::query()->count();

        $response = $this->actingAs($user)->post(route('admin.gallery.items.store'), [
            'media' => UploadedFile::fake()->image('arena.jpg', 1600, 1200),
            'title' => 'Arena Uji',
            'arena_type' => 'Indoor Court',
            'alt_text' => 'Arena uji indoor UB Sport Center',
            'location_id' => $location->id,
            'sections' => [$section->key],
            'credit' => 'UB Sport Center',
            'rights_confirmed' => true,
        ]);

        $response->assertCreated()->assertJsonPath('status', 'processing');
        $item = GalleryItem::query()->firstOrFail();
        $this->assertSame('Arena Uji', $item->translation('id')?->title);
        $this->assertSame(['indoor'], $item->sections()->pluck('key')->all());
        $this->assertSame($facilityCount, Facility::query()->count());
        Queue::assertPushed(ProcessGalleryMedia::class, fn (ProcessGalleryMedia $job) => $job->galleryItemId === $item->id);
    }

    public function test_gallery_sitemaps_are_valid_xml_and_exclude_drafts(): void
    {
        $section = GallerySection::query()->where('key', 'outdoor')->firstOrFail();
        $section->update(['is_active' => true]);
        $published = $this->publishedItem($section, 1);
        $draft = $this->galleryItem($section, GalleryItemStatus::Draft, 2);

        $this->get(route('gallery.sitemap.index'))
            ->assertOk()
            ->assertHeader('Content-Type', 'application/xml; charset=UTF-8')
            ->assertSee('sitemap-gallery-images.xml', false);

        $response = $this->get(route('gallery.sitemap.images'))->assertOk();
        $xml = $response->streamedContent();
        $this->assertStringContainsString($published->translation('id')?->title, $xml);
        $this->assertStringNotContainsString($draft->translation('id')?->title, $xml);
    }

    public function test_unpublishing_featured_media_auto_fills_only_the_missing_slot(): void
    {
        $section = GallerySection::query()->where('key', 'indoor')->firstOrFail();
        $section->update(['is_active' => true]);
        $items = collect(range(1, $section->quota + 1))
            ->map(fn (int $position) => $this->publishedItem($section, $position));
        $actor = User::factory()->create();

        app(GalleryPublicationService::class)->unpublish($items->first(), $actor);

        $replacement = $items->last()->fresh(['sections']);
        $this->assertSame(1, $replacement->sections->first()->pivot->featured_position);
        $this->assertNull($items->first()->fresh(['sections'])->sections->first()->pivot->featured_position);
        $payload = app(GalleryPublicService::class)->curatedSections();
        $this->assertTrue($payload['indoor']['active']);
        $this->assertCount($section->quota, $payload['indoor']['items']);
    }

    public function test_bulk_action_is_idempotent_and_returns_per_item_results(): void
    {
        Storage::fake('local');
        $permission = Permission::firstOrCreate(['name' => 'manage-facility-gallery', 'guard_name' => 'web']);
        $role = Role::firstOrCreate(['name' => 'Staff Central', 'guard_name' => 'web']);
        $user = User::factory()->create();
        $user->assignRole($role);
        $user->givePermissionTo($permission);
        $section = GallerySection::query()->where('key', 'indoor')->firstOrFail();
        $item = $this->galleryItem($section, GalleryItemStatus::Draft, 1);
        $item->update(['rights_confirmed_by' => $user->id]);
        $item->addMedia(UploadedFile::fake()->image('ready.jpg', 1600, 1200))
            ->toMediaCollection('source');
        $key = fake()->uuid();
        $payload = [
            'idempotency_key' => $key,
            'operation' => 'submit',
            'uuids' => [$item->uuid],
        ];

        $this->actingAs($user)->postJson(route('admin.gallery.bulk.store'), $payload)
            ->assertOk()
            ->assertJsonPath('succeeded', 1)
            ->assertJsonPath('failed', 0);
        $this->actingAs($user)->postJson(route('admin.gallery.bulk.store'), $payload)
            ->assertOk()
            ->assertHeader('Idempotent-Replay', 'true')
            ->assertJsonPath('succeeded', 1);

        $this->assertSame(
            GalleryItemStatus::ReadyForReview,
            $item->fresh()->status,
        );
    }

    public function test_public_analytics_accepts_only_anonymous_product_events_and_filters_bots(): void
    {
        $section = GallerySection::query()->where('key', 'outdoor')->firstOrFail();
        $section->update(['is_active' => true]);
        $item = $this->publishedItem($section, 1);
        $payload = [
            'event_type' => 'gallery_search',
            'item_uuid' => $item->uuid,
            'section_key' => $section->key,
            'query' => '  Lapangan   PADEL  ',
            'payload' => ['result_count' => 2, 'source' => 'archive'],
        ];

        $this->withHeader('User-Agent', 'Mozilla/5.0 Test Browser')
            ->postJson(route('gallery.events'), $payload)
            ->assertNoContent();
        $this->assertDatabaseHas('gallery_analytics_events', [
            'event_type' => 'gallery_search',
            'item_uuid' => $item->uuid,
            'query_term' => 'lapangan padel',
        ]);

        $this->withHeader('User-Agent', 'Googlebot/2.1')
            ->postJson(route('gallery.events'), $payload)
            ->assertNoContent();
        $this->assertSame(1, GalleryAnalyticsEvent::query()->count());
    }

    public function test_shareable_media_endpoint_returns_requested_item_and_neighbors(): void
    {
        $section = GallerySection::query()->where('key', 'exclusive')->firstOrFail();
        $section->update(['is_active' => true]);
        $first = $this->publishedItem($section, 1);
        $target = $this->publishedItem($section, 2);
        $third = $this->publishedItem($section, 3);
        $first->update(['published_at' => now()->subMinutes(3)]);
        $target->update(['published_at' => now()->subMinutes(2)]);
        $third->update(['published_at' => now()->subMinute()]);

        $this->getJson(route('gallery.media', [
            'galleryItem' => $target->uuid,
            'section' => $section->key,
        ]))
            ->assertOk()
            ->assertJsonCount(3, 'items')
            ->assertJsonPath('items.1.uuid', $target->uuid)
            ->assertJsonPath('active_index', 1);
    }

    public function test_resumable_upload_skips_committed_chunks_and_ingests_once(): void
    {
        Queue::fake();
        Storage::fake('local');
        config()->set('facility-gallery.upload_chunk_bytes', 256 * 1024);
        $permission = Permission::firstOrCreate(['name' => 'manage-facility-gallery', 'guard_name' => 'web']);
        $role = Role::firstOrCreate(['name' => 'Staff Central', 'guard_name' => 'web']);
        $user = User::factory()->create();
        $user->assignRole($role);
        $user->givePermissionTo($permission);
        $section = GallerySection::query()->where('key', 'indoor')->firstOrFail();
        $location = GalleryLocation::query()->firstOrFail();
        $contents = str_repeat('gallery-test-byte', 20_000);
        $payload = [
            'file_name' => 'resumable-arena.jpg',
            'file_size' => strlen($contents),
            'file_mime' => 'image/jpeg',
            'last_modified' => 123456,
            'client_fingerprint' => 'resumable-arena.jpg|'.strlen($contents).'|123456',
            'title' => 'Arena Resumable',
            'arena_type' => 'Indoor Court',
            'alt_text' => 'Arena indoor UB Sport Center',
            'location_id' => $location->id,
            'sections' => [$section->key],
            'credit' => 'UB Sport Center',
            'rights_confirmed' => true,
        ];

        $session = $this->actingAs($user)
            ->postJson(route('admin.gallery.upload-sessions.store'), $payload)
            ->assertCreated()
            ->json();
        $chunkSize = $session['chunk_size'];
        $firstChunk = substr($contents, 0, $chunkSize);
        $this->actingAs($user)->put(route('admin.gallery.upload-sessions.chunks.store', [
            $session['uuid'], 0,
        ]), [
            'chunk' => UploadedFile::fake()->createWithContent('0.part', $firstChunk),
        ])->assertOk();

        $this->actingAs($user)
            ->postJson(route('admin.gallery.upload-sessions.store'), $payload)
            ->assertOk()
            ->assertJsonPath('uuid', $session['uuid'])
            ->assertJsonPath('received_chunks.0', 0);

        foreach (range(1, $session['total_chunks'] - 1) as $index) {
            $chunk = substr($contents, $index * $chunkSize, $chunkSize);
            $this->actingAs($user)->put(route('admin.gallery.upload-sessions.chunks.store', [
                $session['uuid'], $index,
            ]), [
                'chunk' => UploadedFile::fake()->createWithContent("{$index}.part", $chunk),
            ])->assertOk();
        }

        $this->actingAs($user)
            ->postJson(route('admin.gallery.upload-sessions.complete', $session['uuid']))
            ->assertOk()
            ->assertJsonPath('status', 'completed');
        $this->assertDatabaseCount('gallery_items', 1);
        $this->assertSame('Arena Resumable', GalleryItem::query()->first()->translation('id')?->title);
        Queue::assertPushed(ProcessGalleryMedia::class, 1);
    }

    private function publishedItem(GallerySection $section, int $position): GalleryItem
    {
        return $this->galleryItem($section, GalleryItemStatus::Published, $position);
    }

    private function galleryItem(
        GallerySection $section,
        GalleryItemStatus $status,
        int $position,
    ): GalleryItem {
        $location = GalleryLocation::query()->firstOrFail();
        $item = GalleryItem::create([
            'media_type' => GalleryMediaType::Image,
            'status' => $status,
            'location_id' => $location->id,
            'published_at' => $status === GalleryItemStatus::Published ? now()->subMinute() : null,
            'credit' => 'UB Sport Center',
            'source_sha256' => str_pad((string) $position, 64, '0', STR_PAD_LEFT),
            'source_mime' => 'image/jpeg',
            'source_bytes' => 1024,
            'source_width' => 1920,
            'source_height' => 1280,
            'derivatives' => [
                'image' => [
                    'width' => 1920,
                    'height' => 1280,
                    'fallback' => "facility-gallery/test/{$position}.jpg",
                    'fallback_format' => 'jpg',
                    'formats' => [
                        'jpg' => [
                            '1920' => [
                                'path' => "facility-gallery/test/{$position}.jpg",
                                'width' => 1920,
                                'height' => 1280,
                            ],
                        ],
                    ],
                ],
            ],
            'rights_confirmed_at' => now(),
        ]);
        $item->translations()->create([
            'locale' => 'id',
            'title' => 'Arena '.str_pad((string) $position, 2, '0', STR_PAD_LEFT),
            'arena_type' => 'Indoor Court',
            'alt_text' => 'Arena olahraga UB Sport Center',
        ]);
        $item->sections()->attach($section->id, [
            'featured_position' => $position,
            'sort_order' => $position,
        ]);

        return $item->fresh(['translations', 'sections', 'location', 'media']);
    }
}
