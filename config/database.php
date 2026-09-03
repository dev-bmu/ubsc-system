<?php

use Illuminate\Support\Str;

$mysqlConnectionOptions = static function (): array {
    $options = [
        (PHP_VERSION_ID >= 80500 ? \Pdo\Mysql::ATTR_SSL_CA : \PDO::MYSQL_ATTR_SSL_CA) => env('MYSQL_ATTR_SSL_CA'),
        \PDO::ATTR_TIMEOUT => min(30, max(1, (int) env('DB_CONNECT_TIMEOUT_SECONDS', 5))),
    ];

    $verifyServerCertificateAttribute = null;
    if (PHP_VERSION_ID >= 80500 && defined('Pdo\\Mysql::ATTR_SSL_VERIFY_SERVER_CERT')) {
        $verifyServerCertificateAttribute = constant('Pdo\\Mysql::ATTR_SSL_VERIFY_SERVER_CERT');
    } elseif (defined('PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT')) {
        $verifyServerCertificateAttribute = constant('PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT');
    }

    if ($verifyServerCertificateAttribute !== null) {
        $options[$verifyServerCertificateAttribute] = (bool) env('DB_TLS_VERIFY_PEER', false);
    }

    return array_filter(
        $options,
        static fn (mixed $value): bool => $value !== null && $value !== '',
    );
};

$redisTlsContext = null;
if ((bool) env('REDIS_TLS_REQUIRED', false)) {
    $redisSsl = [
        'verify_peer' => (bool) env('REDIS_TLS_VERIFY_PEER', true),
        'verify_peer_name' => (bool) env('REDIS_TLS_VERIFY_PEER', true),
        'allow_self_signed' => false,
    ];
    $redisCa = trim((string) env('REDIS_TLS_CA'));
    if ($redisCa !== '') {
        $redisSsl['cafile'] = $redisCa;
    }
    $redisTlsContext = ['ssl' => $redisSsl];
}

$redisReadTimeout = min(30, max(0.1, (float) env(
    'REDIS_READ_TIMEOUT_SECONDS',
    2,
)));
$redisQueueBlockFor = max(1, (int) env('REDIS_QUEUE_BLOCK_FOR', 5));
$redisQueueReadTimeout = min(30, max(0.1, (float) env(
    'REDIS_QUEUE_READ_TIMEOUT_SECONDS',
    max($redisReadTimeout, $redisQueueBlockFor + 1),
)));

return [

    /*
    |--------------------------------------------------------------------------
    | Default Database Connection Name
    |--------------------------------------------------------------------------
    |
    | Here you may specify which of the database connections below you wish
    | to use as your default connection for database operations. This is
    | the connection which will be utilized unless another connection
    | is explicitly specified when you execute a query / statement.
    |
    */

    'default' => env('DB_CONNECTION', 'sqlite'),

    /*
    |--------------------------------------------------------------------------
    | Database Connections
    |--------------------------------------------------------------------------
    |
    | Below are all of the database connections defined for your application.
    | An example configuration is provided for each database system which
    | is supported by Laravel. You're free to add / remove connections.
    |
    */

    'connections' => [

        'sqlite' => [
            'driver' => 'sqlite',
            'url' => env('DB_URL'),
            'database' => env('DB_DATABASE', database_path('database.sqlite')),
            'prefix' => '',
            'foreign_key_constraints' => env('DB_FOREIGN_KEYS', true),
            'busy_timeout' => null,
            'journal_mode' => null,
            'synchronous' => null,
            'transaction_mode' => 'DEFERRED',
        ],

        'mysql' => [
            'driver' => 'mysql',
            'url' => env('DB_URL'),
            'host' => env('DB_HOST', '127.0.0.1'),
            'port' => env('DB_PORT', '3306'),
            'database' => env('DB_DATABASE', 'laravel'),
            'username' => env('DB_USERNAME', 'root'),
            'password' => env('DB_PASSWORD', ''),
            'unix_socket' => env('DB_SOCKET', ''),
            'charset' => env('DB_CHARSET', 'utf8mb4'),
            'collation' => env('DB_COLLATION', 'utf8mb4_unicode_ci'),
            'prefix' => '',
            'prefix_indexes' => true,
            'strict' => true,
            'engine' => null,
            'options' => extension_loaded('pdo_mysql') ? $mysqlConnectionOptions() : [],
        ],

        'mariadb' => [
            'driver' => 'mariadb',
            'url' => env('DB_URL'),
            'host' => env('DB_HOST', '127.0.0.1'),
            'port' => env('DB_PORT', '3306'),
            'database' => env('DB_DATABASE', 'laravel'),
            'username' => env('DB_USERNAME', 'root'),
            'password' => env('DB_PASSWORD', ''),
            'unix_socket' => env('DB_SOCKET', ''),
            'charset' => env('DB_CHARSET', 'utf8mb4'),
            'collation' => env('DB_COLLATION', 'utf8mb4_unicode_ci'),
            'prefix' => '',
            'prefix_indexes' => true,
            'strict' => true,
            'engine' => null,
            'options' => extension_loaded('pdo_mysql') ? $mysqlConnectionOptions() : [],
        ],

        // Explicit eventual-read connection. It is never selected by Laravel
        // automatically and must use a provider-side SELECT-only credential.
        // Booking, membership, payment, authentication, admin, and any
        // read-after-write flow remain on the default writer connection.
        'mariadb_replica' => [
            'driver' => 'mariadb',
            'url' => env('DB_REPLICA_URL'),
            'host' => env('DB_REPLICA_HOST', '127.0.0.1'),
            'port' => env('DB_REPLICA_PORT', env('DB_PORT', '3306')),
            'database' => env('DB_REPLICA_DATABASE', env('DB_DATABASE', 'laravel')),
            'username' => env('DB_REPLICA_USERNAME', ''),
            'password' => env('DB_REPLICA_PASSWORD', ''),
            'unix_socket' => env('DB_REPLICA_SOCKET', ''),
            'charset' => env('DB_CHARSET', 'utf8mb4'),
            'collation' => env('DB_COLLATION', 'utf8mb4_unicode_ci'),
            'prefix' => '',
            'prefix_indexes' => true,
            'strict' => true,
            'engine' => null,
            'read_only' => true,
            'options' => extension_loaded('pdo_mysql') ? $mysqlConnectionOptions() : [],
        ],

        'pgsql' => [
            'driver' => 'pgsql',
            'url' => env('DB_URL'),
            'host' => env('DB_HOST', '127.0.0.1'),
            'port' => env('DB_PORT', '5432'),
            'database' => env('DB_DATABASE', 'laravel'),
            'username' => env('DB_USERNAME', 'root'),
            'password' => env('DB_PASSWORD', ''),
            'charset' => env('DB_CHARSET', 'utf8'),
            'prefix' => '',
            'prefix_indexes' => true,
            'search_path' => 'public',
            'sslmode' => env('DB_SSLMODE', 'prefer'),
        ],

        'sqlsrv' => [
            'driver' => 'sqlsrv',
            'url' => env('DB_URL'),
            'host' => env('DB_HOST', 'localhost'),
            'port' => env('DB_PORT', '1433'),
            'database' => env('DB_DATABASE', 'laravel'),
            'username' => env('DB_USERNAME', 'root'),
            'password' => env('DB_PASSWORD', ''),
            'charset' => env('DB_CHARSET', 'utf8'),
            'prefix' => '',
            'prefix_indexes' => true,
            'encrypt' => env('DB_ENCRYPT', 'yes'),
            'trust_server_certificate' => env('DB_TRUST_SERVER_CERTIFICATE', 'false'),
            'login_timeout' => min(30, max(1, (int) env('DB_CONNECT_TIMEOUT_SECONDS', 5))),
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Migration Repository Table
    |--------------------------------------------------------------------------
    |
    | This table keeps track of all the migrations that have already run for
    | your application. Using this information, we can determine which of
    | the migrations on disk haven't actually been run on the database.
    |
    */

    'migrations' => [
        'table' => 'migrations',
        'update_date_on_publish' => true,
    ],

    /*
    |--------------------------------------------------------------------------
    | Redis Databases
    |--------------------------------------------------------------------------
    |
    | Redis is an open source, fast, and advanced key-value store that also
    | provides a richer body of commands than a typical key-value system
    | such as Memcached. You may define your connection settings here.
    |
    */

    'redis' => [

        'client' => env('REDIS_CLIENT', 'phpredis'),

        'options' => [
            'cluster' => env('REDIS_CLUSTER', 'redis'),
            'prefix' => env('REDIS_PREFIX', Str::slug((string) env('APP_NAME', 'laravel')).'-database-'),
            'persistent' => env('REDIS_PERSISTENT', false),
        ],

        'default' => [
            'url' => env('REDIS_URL'),
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'username' => env('REDIS_USERNAME'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', '6379'),
            'database' => env('REDIS_DB', '0'),
            'timeout' => (float) env('REDIS_CONNECT_TIMEOUT_SECONDS', 2),
            'read_timeout' => $redisReadTimeout,
            'max_retries' => env('REDIS_MAX_RETRIES', 3),
            'backoff_algorithm' => env('REDIS_BACKOFF_ALGORITHM', 'decorrelated_jitter'),
            'backoff_base' => env('REDIS_BACKOFF_BASE', 100),
            'backoff_cap' => env('REDIS_BACKOFF_CAP', 1000),
            'context' => $redisTlsContext,
        ],

        // Authentication state is isolated from cache eviction and queue
        // pressure. In production this may point to a dedicated managed
        // endpoint; locally it safely falls back to a separate logical DB.
        'session' => [
            'url' => env('REDIS_SESSION_URL', env('REDIS_URL')),
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'username' => env('REDIS_USERNAME'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', '6379'),
            'database' => env('REDIS_SESSION_DB', '3'),
            'timeout' => (float) env('REDIS_CONNECT_TIMEOUT_SECONDS', 2),
            'read_timeout' => $redisReadTimeout,
            'max_retries' => env('REDIS_MAX_RETRIES', 3),
            'backoff_algorithm' => env('REDIS_BACKOFF_ALGORITHM', 'decorrelated_jitter'),
            'backoff_base' => env('REDIS_BACKOFF_BASE', 100),
            'backoff_cap' => env('REDIS_BACKOFF_CAP', 1000),
            'context' => $redisTlsContext,
        ],

        'cache' => [
            'url' => env('REDIS_CACHE_URL', env('REDIS_URL')),
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'username' => env('REDIS_USERNAME'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', '6379'),
            'database' => env('REDIS_CACHE_DB', '1'),
            'timeout' => (float) env('REDIS_CONNECT_TIMEOUT_SECONDS', 2),
            'read_timeout' => $redisReadTimeout,
            'max_retries' => env('REDIS_MAX_RETRIES', 3),
            'backoff_algorithm' => env('REDIS_BACKOFF_ALGORITHM', 'decorrelated_jitter'),
            'backoff_base' => env('REDIS_BACKOFF_BASE', 100),
            'backoff_cap' => env('REDIS_BACKOFF_CAP', 1000),
            'context' => $redisTlsContext,
        ],

        // Short-lived, high-cardinality request-limit state is physically
        // isolated in production so an attack cannot evict application cache
        // entries or consume session/queue/coordination capacity.
        'traffic' => [
            'url' => env('REDIS_TRAFFIC_URL', env('REDIS_URL')),
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'username' => env('REDIS_USERNAME'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', '6379'),
            'database' => env('REDIS_TRAFFIC_DB', '5'),
            'timeout' => (float) env('REDIS_CONNECT_TIMEOUT_SECONDS', 2),
            'read_timeout' => $redisReadTimeout,
            'max_retries' => env('REDIS_MAX_RETRIES', 3),
            'backoff_algorithm' => env('REDIS_BACKOFF_ALGORITHM', 'decorrelated_jitter'),
            'backoff_base' => env('REDIS_BACKOFF_BASE', 100),
            'backoff_cap' => env('REDIS_BACKOFF_CAP', 1000),
            'context' => $redisTlsContext,
        ],

        // Distributed coordination must be immune to ordinary cache
        // eviction. Production uses a dedicated managed, replicated,
        // noeviction endpoint; local Redis uses logical database 4.
        'coordination' => [
            'url' => env('REDIS_COORDINATION_URL', env('REDIS_URL')),
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'username' => env('REDIS_USERNAME'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', '6379'),
            'database' => env('REDIS_COORDINATION_DB', '4'),
            'timeout' => (float) env('REDIS_CONNECT_TIMEOUT_SECONDS', 2),
            'read_timeout' => $redisReadTimeout,
            'max_retries' => env('REDIS_MAX_RETRIES', 3),
            'backoff_algorithm' => env('REDIS_BACKOFF_ALGORITHM', 'decorrelated_jitter'),
            'backoff_base' => env('REDIS_BACKOFF_BASE', 100),
            'backoff_cap' => env('REDIS_BACKOFF_CAP', 1000),
            'context' => $redisTlsContext,
        ],

        // Queue traffic is isolated from cache eviction and flush operations.
        // A managed Redis service may still expose one highly available
        // endpoint while assigning this connection a dedicated logical DB.
        'queue' => [
            'url' => env('REDIS_QUEUE_URL', env('REDIS_URL')),
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'username' => env('REDIS_USERNAME'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', '6379'),
            'database' => env('REDIS_QUEUE_DB', '2'),
            'timeout' => (float) env('REDIS_CONNECT_TIMEOUT_SECONDS', 2),
            // BLPOP may wait for REDIS_QUEUE_BLOCK_FOR seconds. Keep the
            // socket timeout strictly above that blocking interval.
            'read_timeout' => $redisQueueReadTimeout,
            'max_retries' => env('REDIS_MAX_RETRIES', 3),
            'backoff_algorithm' => env('REDIS_BACKOFF_ALGORITHM', 'decorrelated_jitter'),
            'backoff_base' => env('REDIS_BACKOFF_BASE', 100),
            'backoff_cap' => env('REDIS_BACKOFF_CAP', 1000),
            'context' => $redisTlsContext,
        ],

    ],

];
