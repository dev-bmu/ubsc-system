<?php

$isProduction = strtolower((string) env('APP_ENV', 'production')) === 'production';

return [
    /*
    | The contract is evaluated from Laravel's resolved configuration, so a
    | stale config cache cannot silently bypass it. Production fails closed;
    | local development and isolated tests remain unaffected.
    */
    'enforce' => (bool) env('PRODUCTION_CONTRACT_ENFORCE', $isProduction),
    'topology' => strtolower(trim((string) env(
        'PRODUCTION_TOPOLOGY',
        $isProduction ? '' : 'local',
    ))),
    'application_instances' => max(1, (int) env('PRODUCTION_APP_INSTANCES', 1)),

    'shared_state' => [
        'session_drivers' => ['redis', 'database'],
        'cache_drivers' => ['redis', 'database', 'dynamodb'],
        'queue_drivers' => ['redis', 'database', 'sqs'],
        'durable_disk_drivers' => ['s3'],
    ],

    /*
    | These are config paths, not credentials. The production doctor resolves
    | the named disks and verifies their shared-storage contract. Runtime
    | probes then confirm that dependencies can actually be reached.
    */
    'durable_disks' => [
        'media' => ['path' => 'media-library.disk_name', 'visibility' => 'public'],
        'identity_documents' => ['path' => 'filesystems.identity_documents_disk', 'visibility' => 'private'],
        'invoice_documents' => ['path' => 'invoice_pdf.disk', 'visibility' => 'private'],
        'gallery_originals' => ['path' => 'facility-gallery.originals_disk', 'visibility' => 'private'],
        'gallery_staging' => ['path' => 'facility-gallery.staging_disk', 'visibility' => 'private'],
        'gallery_public' => ['path' => 'facility-gallery.public_disk', 'visibility' => 'public'],
    ],

    'recommended' => [
        'session_driver' => 'redis',
        'cache_driver' => 'redis',
        'queue_driver' => 'redis',
    ],
];
