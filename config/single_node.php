<?php

$isProduction = strtolower((string) env('APP_ENV', 'production')) === 'production';
$isSingleNode = strtolower(trim((string) env('PRODUCTION_TOPOLOGY', ''))) === 'single_node';

return [
    /*
    | This contract makes one VPS honest and recoverable. It does not claim
    | high availability. Multi-node controls remain installed but dormant
    | until PRODUCTION_TOPOLOGY is changed explicitly to multi_node.
    */
    'enforce' => (bool) env(
        'SINGLE_NODE_CONTRACT_ENFORCE',
        $isProduction && $isSingleNode,
    ),

    'database' => [
        'allowed_drivers' => ['mysql', 'mariadb'],
        'maximum_connect_timeout_seconds' => min(10, max(1, (int) env(
            'DB_CONNECT_TIMEOUT_SECONDS',
            5,
        ))),
        'minimum_transaction_attempts' => 2,
    ],

    'redis' => [
        'auth_required' => (bool) env('REDIS_AUTH_REQUIRED', $isProduction),
        'persistence' => strtolower(trim((string) env(
            'REDIS_QUEUE_PERSISTENCE',
            $isSingleNode ? 'aof_everysec' : '',
        ))),
        'allowed_persistence' => ['aof_everysec'],
        'required_noeviction_workloads' => ['session', 'queue', 'coordination'],
    ],

    'storage' => [
        // The release's storage directory must be a symlink to this path.
        'persistent_root' => trim((string) env(
            'SINGLE_NODE_PERSISTENT_STORAGE_ROOT',
            '/srv/ubsc/shared/storage',
        )),
        'release_storage_linked' => (bool) env(
            'SINGLE_NODE_RELEASE_STORAGE_LINKED',
            false,
        ),
        'allowed_drivers' => ['local', 's3'],
        'required_durable_disks' => [
            'media',
            'identity_documents',
            'invoice_documents',
            'gallery_originals',
            'gallery_staging',
            'gallery_public',
        ],
    ],

    'deployment' => [
        // A root-owned adapter may reload PHP-FPM after the current symlink is
        // switched. The unprivileged deploy account may execute only this
        // exact adapter through a tightly scoped sudoers rule.
        'runtime_reload_hook' => trim((string) env(
            'SINGLE_NODE_RUNTIME_RELOAD_HOOK',
            '',
        )),
    ],

    'recovery' => [
        // The actual backup process runs outside PHP/Supervisor and writes a
        // verified heartbeat only after archive + checksum + off-site copy.
        'external_backup_runner' => (bool) env(
            'SINGLE_NODE_EXTERNAL_BACKUP_RUNNER',
            false,
        ),
        'binlog_archiving' => (bool) env('SINGLE_NODE_BINLOG_ARCHIVING', false),
    ],

    'standby' => [
        'high_availability',
        'database_replication',
        'load_balancer',
        'rolling_fleet_deployment',
        'multi_node_shared_storage',
        'capacity_autoscaling',
        'multi_failure_domain_drills',
    ],
];
