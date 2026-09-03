<?php

namespace App\Services;

use App\Models\User;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Throwable;

class AdminPresenceService
{
    public const ONLINE = 'online';

    public const IDLE = 'idle';

    public const OFFLINE = 'offline';

    private const CACHE_VERSION = 3;

    private const CACHE_PREFIX = 'ubsc:admin-presence:user:';

    private const MAX_SLOTS_PER_USER = 32;

    private const MAX_SEQUENCE = 2_147_483_647;

    private const UUID_V4_PATTERN = '/\A[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/i';

    /**
     * Record one browser tab's ephemeral heartbeat. Both the user and server
     * session instance come from the authenticated request. The client UUID
     * only separates tabs inside that already-bound server session.
     */
    public function heartbeat(
        User $user,
        string $sessionInstance,
        string $tabId,
        int $sequence,
        string $state,
        ?CarbonInterface $seenAt = null,
    ): void {
        if (! in_array($state, [self::ONLINE, self::IDLE], true)) {
            throw new \InvalidArgumentException('Unsupported admin presence state.');
        }

        if (preg_match(self::UUID_V4_PATTERN, $tabId) !== 1) {
            throw new \InvalidArgumentException('Invalid admin presence tab identifier.');
        }

        if ($sequence < 1 || $sequence > self::MAX_SEQUENCE) {
            throw new \InvalidArgumentException('Invalid admin presence sequence.');
        }

        $seenAt = $seenAt === null
            ? CarbonImmutable::now()
            : CarbonImmutable::instance($seenAt);
        $userId = (int) $user->getKey();
        $sessionKey = $this->sessionKey($sessionInstance);
        $slotKey = $this->slotKey($sessionInstance, $tabId);

        $accepted = Cache::lock($this->lockKey($userId), 5)->block(2, function () use (
            $userId,
            $sessionKey,
            $slotKey,
            $sequence,
            $state,
            $seenAt,
        ): bool {
            // A logout tombstone prevents a request authenticated before the
            // logout from recreating presence after that session was cleared.
            if (Cache::has($this->revokedSessionKey($userId, $sessionKey))) {
                return false;
            }

            $payload = $this->cachedPayload($userId);
            $slots = $this->retainedSlots(
                is_array($payload['slots'] ?? null) ? $payload['slots'] : [],
                $seenAt,
            );
            $previous = is_array($slots[$slotKey] ?? null)
                ? $slots[$slotKey]
                : [];
            $previousSequence = $this->validSequence($previous['sequence'] ?? null);

            // Duplicate or delayed requests must not regress state, last seen,
            // or even refresh the slot's TTL.
            if ($previousSequence !== null && $sequence <= $previousSequence) {
                return false;
            }

            $slots[$slotKey] = [
                'session_key' => $sessionKey,
                'state' => $state,
                'sequence' => $sequence,
                'heartbeat_at' => $seenAt->getTimestamp(),
                'last_online_at' => $state === self::ONLINE
                    ? $seenAt->getTimestamp()
                    : $this->validTimestamp($previous['last_online_at'] ?? null, $seenAt),
            ];

            uasort(
                $slots,
                static fn (array $left, array $right): int => ((int) ($right['heartbeat_at'] ?? 0)) <=> ((int) ($left['heartbeat_at'] ?? 0)),
            );
            $slots = array_slice(
                $slots,
                0,
                self::MAX_SLOTS_PER_USER,
                preserve_keys: true,
            );

            if (Cache::has($this->revokedSessionKey($userId, $sessionKey))) {
                return false;
            }

            Cache::put(
                $this->cacheKey($userId),
                [
                    'version' => self::CACHE_VERSION,
                    'slots' => $slots,
                ],
                $seenAt->addSeconds($this->slotRetentionSeconds()),
            );

            return true;
        });

        if ($accepted && $state === self::ONLINE) {
            $this->persistLastSeen($userId, $seenAt);
        }
    }

    /**
     * Remove every tab belonging to exactly one server session. Other devices
     * and other authenticated sessions for the same staff account survive.
     */
    public function clearSession(
        int $userId,
        string $sessionInstance,
        ?CarbonInterface $clearedAt = null,
    ): void {
        if ($userId < 1 || $sessionInstance === '') {
            return;
        }

        $clearedAt = $clearedAt === null
            ? CarbonImmutable::now()
            : CarbonImmutable::instance($clearedAt);
        $sessionKey = $this->sessionKey($sessionInstance);

        Cache::put(
            $this->revokedSessionKey($userId, $sessionKey),
            true,
            $clearedAt->addSeconds($this->revocationTtlSeconds()),
        );

        Cache::lock($this->lockKey($userId), 5)->block(2, function () use (
            $userId,
            $sessionKey,
            $clearedAt,
        ): void {
            $payload = $this->cachedPayload($userId);
            $slots = is_array($payload['slots'] ?? null)
                ? $payload['slots']
                : [];
            $remaining = [];

            foreach ($this->retainedSlots($slots, $clearedAt) as $slotKey => $slot) {
                $boundSession = $slot['session_key'] ?? null;

                if (is_string($boundSession) && hash_equals($sessionKey, $boundSession)) {
                    continue;
                }

                $remaining[$slotKey] = $slot;
            }

            if ($remaining === []) {
                Cache::forget($this->cacheKey($userId));

                return;
            }

            Cache::put(
                $this->cacheKey($userId),
                [
                    'version' => self::CACHE_VERSION,
                    'slots' => $remaining,
                ],
                $clearedAt->addSeconds($this->slotRetentionSeconds()),
            );
        });
    }

    public function sessionInstance(Request $request): string
    {
        $instance = $request->session()->get(AdminSessionSecurity::SESSION_INSTANCE);

        return is_string($instance) && $instance !== ''
            ? $instance
            : 'session:'.$request->session()->getId();
    }

    /**
     * @param  iterable<int, User>  $users
     * @return array<int, array{status: string, is_online: bool, last_seen_at: ?string}>
     */
    public function snapshotsFor(iterable $users): array
    {
        $usersById = [];

        foreach ($users as $user) {
            $usersById[(int) $user->getKey()] = $user;
        }

        if ($usersById === []) {
            return [];
        }

        $cacheKeys = [];

        foreach (array_keys($usersById) as $userId) {
            $cacheKeys[$userId] = $this->cacheKey($userId);
        }

        try {
            $cached = Cache::many(array_values($cacheKeys));
        } catch (Throwable $exception) {
            report($exception);
            $cached = [];
        }

        $now = CarbonImmutable::now();
        $revokedSessions = $this->revokedSessionsFor(
            $usersById,
            $cached,
            $cacheKeys,
            $now,
        );
        $snapshots = [];

        foreach ($usersById as $userId => $user) {
            $payload = $cached[$cacheKeys[$userId]] ?? null;
            $snapshots[$userId] = $this->snapshot(
                $user,
                is_array($payload) ? $payload : [],
                $now,
                $revokedSessions[$userId] ?? [],
            );
        }

        return $snapshots;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<string, true>  $revokedSessions
     * @return array{status: string, is_online: bool, last_seen_at: ?string}
     */
    private function snapshot(
        User $user,
        array $payload,
        CarbonImmutable $now,
        array $revokedSessions,
    ): array {
        $slots = ($payload['version'] ?? null) === self::CACHE_VERSION
            && is_array($payload['slots'] ?? null)
            ? $this->retainedSlots($payload['slots'], $now)
            : [];
        $hasOnlineSlot = false;
        $hasIdleSlot = false;
        $latestOnlineAt = $user->staff_last_seen_at?->getTimestamp();
        $onlineCutoff = $now->getTimestamp() - $this->onlineTtlSeconds();

        foreach ($slots as $slot) {
            if ($slot['heartbeat_at'] < $onlineCutoff
                || isset($revokedSessions[$slot['session_key']])) {
                continue;
            }

            if (($slot['state'] ?? null) === self::ONLINE) {
                $hasOnlineSlot = true;
            } elseif (($slot['state'] ?? null) === self::IDLE) {
                $hasIdleSlot = true;
            }
        }

        foreach ($slots as $slot) {
            if (! is_array($slot)) {
                continue;
            }

            $lastOnlineAt = $this->validTimestamp(
                $slot['last_online_at'] ?? null,
                $now,
            );

            if ($lastOnlineAt !== null
                && ($latestOnlineAt === null || $lastOnlineAt > $latestOnlineAt)) {
                $latestOnlineAt = $lastOnlineAt;
            }
        }

        $status = $hasOnlineSlot
            ? self::ONLINE
            : ($hasIdleSlot ? self::IDLE : self::OFFLINE);

        return [
            'status' => $status,
            'is_online' => $status === self::ONLINE,
            'last_seen_at' => $latestOnlineAt === null
                ? null
                : CarbonImmutable::createFromTimestampUTC($latestOnlineAt)->toISOString(),
        ];
    }

    /**
     * Batch-check session tombstones so a completed logout is reflected even
     * if physical slot cleanup lost a cache-lock race. On a cache read error,
     * presence fails closed to offline rather than exposing a stale status.
     *
     * @param  array<int, User>  $usersById
     * @param  array<string, mixed>  $cached
     * @param  array<int, string>  $cacheKeys
     * @return array<int, array<string, true>>
     */
    private function revokedSessionsFor(
        array $usersById,
        array $cached,
        array $cacheKeys,
        CarbonImmutable $now,
    ): array {
        $lookups = [];

        foreach (array_keys($usersById) as $userId) {
            $payload = $cached[$cacheKeys[$userId]] ?? null;

            if (! is_array($payload)
                || ($payload['version'] ?? null) !== self::CACHE_VERSION
                || ! is_array($payload['slots'] ?? null)) {
                continue;
            }

            foreach ($this->retainedSlots($payload['slots'], $now) as $slot) {
                $sessionKey = $slot['session_key'];
                $revocationKey = $this->revokedSessionKey($userId, $sessionKey);
                $lookups[$revocationKey] = [$userId, $sessionKey];
            }
        }

        if ($lookups === []) {
            return [];
        }

        try {
            $cachedRevocations = Cache::many(array_keys($lookups));
        } catch (Throwable $exception) {
            report($exception);

            $cachedRevocations = array_fill_keys(array_keys($lookups), true);
        }

        $revoked = [];

        foreach ($lookups as $revocationKey => [$userId, $sessionKey]) {
            if (($cachedRevocations[$revocationKey] ?? null) === true) {
                $revoked[$userId][$sessionKey] = true;
            }
        }

        return $revoked;
    }

    /**
     * @param  array<string, mixed>  $slots
     * @return array<string, array{session_key: string, state: string, sequence: int, heartbeat_at: int, last_online_at: ?int}>
     */
    private function retainedSlots(array $slots, CarbonImmutable $now): array
    {
        $cutoff = $now->getTimestamp() - $this->slotRetentionSeconds();
        $maximum = $now->getTimestamp() + 5;
        $fresh = [];

        foreach ($slots as $slotKey => $slot) {
            if (! is_string($slotKey)
                || ! is_array($slot)
                || ! is_string($slot['session_key'] ?? null)
                || preg_match('/\A[0-9a-f]{64}\z/', $slot['session_key']) !== 1
                || ! in_array($slot['state'] ?? null, [self::ONLINE, self::IDLE], true)) {
                continue;
            }

            $sequence = $this->validSequence($slot['sequence'] ?? null);
            $heartbeatAt = filter_var(
                $slot['heartbeat_at'] ?? null,
                FILTER_VALIDATE_INT,
            );

            if ($sequence === null
                || $heartbeatAt === false
                || $heartbeatAt < $cutoff
                || $heartbeatAt > $maximum) {
                continue;
            }

            $fresh[$slotKey] = [
                'session_key' => $slot['session_key'],
                'state' => $slot['state'],
                'sequence' => $sequence,
                'heartbeat_at' => $heartbeatAt,
                'last_online_at' => $this->validTimestamp(
                    $slot['last_online_at'] ?? null,
                    $now,
                ),
            ];
        }

        return $fresh;
    }

    /** @return array<string, mixed> */
    private function cachedPayload(int $userId): array
    {
        $payload = Cache::get($this->cacheKey($userId));

        if (! is_array($payload)
            || ($payload['version'] ?? null) !== self::CACHE_VERSION) {
            return [];
        }

        return $payload;
    }

    private function persistLastSeen(int $userId, CarbonImmutable $seenAt): void
    {
        $writeCutoff = $seenAt->subSeconds($this->lastSeenWriteSeconds());

        DB::table('users')
            ->where('id', $userId)
            ->where(function ($query) use ($writeCutoff): void {
                $query->whereNull('staff_last_seen_at')
                    ->orWhere('staff_last_seen_at', '<=', $writeCutoff);
            })
            ->update([
                'staff_last_seen_at' => $seenAt,
            ]);
    }

    private function validTimestamp(mixed $value, CarbonImmutable $now): ?int
    {
        $timestamp = filter_var($value, FILTER_VALIDATE_INT);

        return $timestamp !== false && $timestamp > 0 && $timestamp <= $now->getTimestamp() + 5
            ? $timestamp
            : null;
    }

    private function validSequence(mixed $value): ?int
    {
        $sequence = filter_var($value, FILTER_VALIDATE_INT);

        return $sequence !== false && $sequence >= 1 && $sequence <= self::MAX_SEQUENCE
            ? $sequence
            : null;
    }

    private function cacheKey(int $userId): string
    {
        return self::CACHE_PREFIX.$userId;
    }

    private function lockKey(int $userId): string
    {
        return $this->cacheKey($userId).':lock';
    }

    private function revokedSessionKey(int $userId, string $sessionKey): string
    {
        return $this->cacheKey($userId).':revoked-session:'.$sessionKey;
    }

    private function sessionKey(string $sessionInstance): string
    {
        return $this->hmac("session\0".$sessionInstance);
    }

    private function slotKey(string $sessionInstance, string $tabId): string
    {
        return $this->hmac("slot\0".$sessionInstance."\0".strtolower($tabId));
    }

    private function hmac(string $value): string
    {
        return hash_hmac(
            'sha256',
            $value,
            (string) config('app.key', 'ubsc-admin-presence'),
        );
    }

    private function onlineTtlSeconds(): int
    {
        return max(30, (int) config('security.admin_presence.online_ttl_seconds', 90));
    }

    private function lastSeenWriteSeconds(): int
    {
        return max(30, (int) config('security.admin_presence.last_seen_write_seconds', 60));
    }

    private function revocationTtlSeconds(): int
    {
        return $this->slotRetentionSeconds();
    }

    private function slotRetentionSeconds(): int
    {
        return max(
            $this->onlineTtlSeconds() * 2,
            max(1, (int) config('session.lifetime', 120)) * 60,
            max(1, (int) config('security.admin_session.absolute_minutes', 480)) * 60,
        );
    }
}
