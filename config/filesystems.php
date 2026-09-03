<?php

$filesystemThrow = (bool) env('FILESYSTEM_THROW', false);
$filesystemReport = (bool) env('FILESYSTEM_REPORT', false);
$publicStorageDriver = strtolower(trim((string) env('PUBLIC_STORAGE_DRIVER', 'local')));
$identityDocumentsDriver = strtolower(trim((string) env('IDENTITY_DOCUMENTS_DRIVER', 'local')));
$s3HttpOptions = [
    'connect_timeout' => min(10, max(1, (float) env('S3_CONNECT_TIMEOUT_SECONDS', 3))),
    'timeout' => min(30, max(2, (float) env('S3_REQUEST_TIMEOUT_SECONDS', 10))),
];
$s3MaximumRetries = min(4, max(0, (int) env('S3_MAX_RETRIES', 2)));

return [

    /*
    |--------------------------------------------------------------------------
    | Default Filesystem Disk
    |--------------------------------------------------------------------------
    |
    | Here you may specify the default filesystem disk that should be used
    | by the framework. The "local" disk, as well as a variety of cloud
    | based disks are available to your application for file storage.
    |
    */

    'default' => env('FILESYSTEM_DISK', 'local'),

    // Stable disk names let application code remain unchanged while the
    // production environment moves durable state from local disk to object
    // storage shared by every application node.
    'identity_documents_disk' => 'identity-documents',

    /*
    |--------------------------------------------------------------------------
    | Filesystem Disks
    |--------------------------------------------------------------------------
    |
    | Below you may configure as many filesystem disks as necessary, and you
    | may even configure multiple disks for the same driver. Examples for
    | most supported storage drivers are configured here for reference.
    |
    | Supported drivers: "local", "ftp", "sftp", "s3"
    |
    */

    'disks' => [

        'local' => [
            'driver' => 'local',
            'root' => storage_path('app/private'),
            'serve' => true,
            'throw' => $filesystemThrow,
            'report' => $filesystemReport,
        ],

        'invoice-pdf' => [
            'driver' => 'local',
            'root' => storage_path('app/private/documents'),
            'visibility' => 'private',
            'serve' => false,
            'throw' => (bool) env('INVOICE_PDF_STORAGE_THROW', $filesystemThrow),
            'report' => (bool) env('INVOICE_PDF_STORAGE_REPORT', $filesystemReport),
        ],

        // Private, horizontally shared document storage for multi-node
        // production. No URL is exposed; downloads always pass authorization.
        'invoice-pdf-s3' => [
            'driver' => 's3',
            'key' => env('INVOICE_PDF_AWS_ACCESS_KEY_ID', env('AWS_ACCESS_KEY_ID')),
            'secret' => env('INVOICE_PDF_AWS_SECRET_ACCESS_KEY', env('AWS_SECRET_ACCESS_KEY')),
            'region' => env('INVOICE_PDF_AWS_DEFAULT_REGION', env('AWS_DEFAULT_REGION')),
            'bucket' => env('INVOICE_PDF_AWS_BUCKET'),
            'endpoint' => env('INVOICE_PDF_AWS_ENDPOINT'),
            'use_path_style_endpoint' => env('INVOICE_PDF_AWS_USE_PATH_STYLE_ENDPOINT', false),
            'http' => $s3HttpOptions,
            'retries' => $s3MaximumRetries,
            'visibility' => 'private',
            'throw' => (bool) env('INVOICE_PDF_STORAGE_THROW', $filesystemThrow),
            'report' => (bool) env('INVOICE_PDF_STORAGE_REPORT', $filesystemReport),
        ],

        'invoice-pdf-archive-s3' => [
            'driver' => 's3',
            'key' => env('INVOICE_PDF_ARCHIVE_AWS_ACCESS_KEY_ID', env('INVOICE_PDF_AWS_ACCESS_KEY_ID', env('AWS_ACCESS_KEY_ID'))),
            'secret' => env('INVOICE_PDF_ARCHIVE_AWS_SECRET_ACCESS_KEY', env('INVOICE_PDF_AWS_SECRET_ACCESS_KEY', env('AWS_SECRET_ACCESS_KEY'))),
            'region' => env('INVOICE_PDF_ARCHIVE_AWS_DEFAULT_REGION', env('INVOICE_PDF_AWS_DEFAULT_REGION', env('AWS_DEFAULT_REGION'))),
            'bucket' => env('INVOICE_PDF_ARCHIVE_AWS_BUCKET'),
            'endpoint' => env('INVOICE_PDF_ARCHIVE_AWS_ENDPOINT'),
            'use_path_style_endpoint' => env('INVOICE_PDF_ARCHIVE_AWS_USE_PATH_STYLE_ENDPOINT', false),
            'http' => $s3HttpOptions,
            'retries' => $s3MaximumRetries,
            'visibility' => 'private',
            'throw' => (bool) env('INVOICE_PDF_ARCHIVE_STORAGE_THROW', $filesystemThrow),
            'report' => (bool) env('INVOICE_PDF_ARCHIVE_STORAGE_REPORT', $filesystemReport),
        ],

        'public' => $publicStorageDriver === 's3'
            ? [
                'driver' => 's3',
                'key' => env('PUBLIC_STORAGE_AWS_ACCESS_KEY_ID', env('AWS_ACCESS_KEY_ID')),
                'secret' => env('PUBLIC_STORAGE_AWS_SECRET_ACCESS_KEY', env('AWS_SECRET_ACCESS_KEY')),
                'region' => env('PUBLIC_STORAGE_AWS_DEFAULT_REGION', env('AWS_DEFAULT_REGION')),
                'bucket' => env('PUBLIC_STORAGE_AWS_BUCKET', env('AWS_BUCKET')),
                'url' => env('PUBLIC_STORAGE_URL', env('AWS_URL')),
                'endpoint' => env('PUBLIC_STORAGE_AWS_ENDPOINT', env('AWS_ENDPOINT')),
                'use_path_style_endpoint' => env(
                    'PUBLIC_STORAGE_AWS_USE_PATH_STYLE_ENDPOINT',
                    env('AWS_USE_PATH_STYLE_ENDPOINT', false),
                ),
                'http' => $s3HttpOptions,
                'retries' => $s3MaximumRetries,
                'visibility' => 'public',
                'throw' => (bool) env('PUBLIC_STORAGE_THROW', $filesystemThrow),
                'report' => (bool) env('PUBLIC_STORAGE_REPORT', $filesystemReport),
            ]
            : [
                'driver' => 'local',
                'root' => storage_path('app/public'),
                // Same-origin URLs keep uploaded media valid when the application
                // is opened through localhost, a LAN address, or its real domain.
                // A CDN/full origin can still be supplied explicitly in production.
                'url' => rtrim(env('PUBLIC_STORAGE_URL', '/storage'), '/'),
                'visibility' => 'public',
                'throw' => (bool) env('PUBLIC_STORAGE_THROW', $filesystemThrow),
                'report' => (bool) env('PUBLIC_STORAGE_REPORT', $filesystemReport),
            ],

        'identity-documents' => $identityDocumentsDriver === 's3'
            ? [
                'driver' => 's3',
                'key' => env('IDENTITY_DOCUMENTS_AWS_ACCESS_KEY_ID', env('AWS_ACCESS_KEY_ID')),
                'secret' => env('IDENTITY_DOCUMENTS_AWS_SECRET_ACCESS_KEY', env('AWS_SECRET_ACCESS_KEY')),
                'region' => env('IDENTITY_DOCUMENTS_AWS_DEFAULT_REGION', env('AWS_DEFAULT_REGION')),
                'bucket' => env('IDENTITY_DOCUMENTS_AWS_BUCKET'),
                'endpoint' => env('IDENTITY_DOCUMENTS_AWS_ENDPOINT', env('AWS_ENDPOINT')),
                'use_path_style_endpoint' => env(
                    'IDENTITY_DOCUMENTS_AWS_USE_PATH_STYLE_ENDPOINT',
                    env('AWS_USE_PATH_STYLE_ENDPOINT', false),
                ),
                'http' => $s3HttpOptions,
                'retries' => $s3MaximumRetries,
                'visibility' => 'private',
                'throw' => (bool) env('IDENTITY_DOCUMENTS_THROW', $filesystemThrow),
                'report' => (bool) env('IDENTITY_DOCUMENTS_REPORT', $filesystemReport),
            ]
            : [
                'driver' => 'local',
                'root' => storage_path('app/identity-documents'),
                'visibility' => 'private',
                'throw' => (bool) env('IDENTITY_DOCUMENTS_THROW', $filesystemThrow),
                'report' => (bool) env('IDENTITY_DOCUMENTS_REPORT', $filesystemReport),
            ],

        's3' => [
            'driver' => 's3',
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'region' => env('AWS_DEFAULT_REGION'),
            'bucket' => env('AWS_BUCKET'),
            'url' => env('AWS_URL'),
            'endpoint' => env('AWS_ENDPOINT'),
            'use_path_style_endpoint' => env('AWS_USE_PATH_STYLE_ENDPOINT', false),
            'http' => $s3HttpOptions,
            'retries' => $s3MaximumRetries,
            'visibility' => 'private',
            'throw' => $filesystemThrow,
            'report' => $filesystemReport,
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Symbolic Links
    |--------------------------------------------------------------------------
    |
    | Here you may configure the symbolic links that will be created when the
    | `storage:link` Artisan command is executed. The array keys should be
    | the locations of the links and the values should be their targets.
    |
    */

    'links' => [
        public_path('storage') => storage_path('app/public'),
    ],

];
