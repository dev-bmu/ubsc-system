<?php

return [
    'timezone' => env('GALLERY_TIMEZONE', 'Asia/Jakarta'),
    'canonical_origin' => rtrim(
        env(
            'SEO_CANONICAL_ORIGIN',
            env('GALLERY_CANONICAL_ORIGIN', 'https://ubsportcenter.co.id'),
        ),
        '/',
    ),

    'originals_disk' => env('GALLERY_ORIGINALS_DISK', 'local'),
    'staging_disk' => env('GALLERY_STAGING_DISK', 'local'),
    'public_disk' => env('GALLERY_PUBLIC_DISK', 'public'),
    'public_path' => trim(env('GALLERY_PUBLIC_PATH', 'facility-gallery'), '/'),

    'sections' => [
        'indoor' => [
            'name' => 'Arena Indoor',
            'slug' => 'indoor',
            'quota' => 7,
            'layout' => 'grid',
        ],
        'exclusive' => [
            'name' => 'Lokasi Eksklusif',
            'slug' => 'eksklusif',
            'quota' => 6,
            'layout' => 'carousel',
        ],
        'outdoor' => [
            'name' => 'Arena Outdoor',
            'slug' => 'outdoor',
            'quota' => 8,
            'layout' => 'carousel',
        ],
    ],

    'initial_locations' => ['Veteran', 'Dieng', 'Exclusive'],

    'image' => [
        'max_bytes' => 20 * 1024 * 1024,
        'max_pixels' => 24_000_000,
        'min_long_edge' => 1600,
        'widths' => [320, 480, 768, 1024, 1440, 1920],
        'formats' => ['avif', 'webp', 'jpg'],
    ],

    'video' => [
        'max_bytes' => 250 * 1024 * 1024,
        'max_duration_seconds' => 90,
        'max_width' => 3840,
        'max_height' => 2160,
        'renditions' => [480, 720, 1080],
        'ffmpeg_path' => env('GALLERY_FFMPEG_PATH', env('FFMPEG_PATH', 'ffmpeg')),
        'ffprobe_path' => env('GALLERY_FFPROBE_PATH', env('FFPROBE_PATH', 'ffprobe')),
        'timeout_seconds' => (int) env('GALLERY_FFMPEG_TIMEOUT', 900),
    ],

    'pagination' => [
        'per_page' => 24,
        'max_per_page' => 48,
    ],

    'cache_seconds' => (int) env('GALLERY_CACHE_SECONDS', 300),

    'analytics_retention_days' => 90,
    'upload_session_hours' => 24,
    'upload_chunk_bytes' => (int) env('GALLERY_UPLOAD_CHUNK_BYTES', 5 * 1024 * 1024),
];
