export interface BookingCheckoutIntentCartItem {
    facility_id: number;
    facility_unit_id: number | null;
    booking_date: string;
    start_time: string;
    end_time: string;
}

export interface BookingCheckoutIntent {
    scope: string;
    idempotencyKey: string;
}

interface StoredBookingCheckoutIntent {
    version: 1;
    idempotency_key: string;
}

interface IntentLockRecord {
    owner: string;
    expires_at: number;
}

interface IntentSyncMessage {
    version: 1;
    scope: string;
}

interface LockManagerLike {
    request<T>(
        name: string,
        callback: () => T | PromiseLike<T>,
    ): Promise<T>;
}

const INTENT_STORAGE_PREFIX = "ubsc.booking.checkout-intent.v1.";
const INTENT_LOCK_PREFIX = "ubsc.booking.checkout-intent-lock.v1.";
const INTENT_CHANNEL_NAME = "ubsc.booking.checkout-intent.v1";
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPE_PATTERN = /^v1-[0-9a-f]{32}$/;
const LOCK_LEASE_MS = 5_000;
const LOCK_ATTEMPTS = 24;

const inMemoryIntents = new Map<string, StoredBookingCheckoutIntent>();
let syncInitialized = false;
let intentChannel: BroadcastChannel | null = null;

function normalizeBookingTime(value: string): string {
    const normalized = value.trim();
    const match = /^(\d{2}):(\d{2})(?::00)?$/.exec(normalized);

    return match ? `${match[1]}:${match[2]}` : normalized;
}

/**
 * Only server-authoritative slot identity belongs in the canonical cart.
 * Display names, labels, and client-side prices are deliberately excluded.
 */
export function canonicalBookingCheckoutCart(
    items: readonly BookingCheckoutIntentCartItem[],
): string {
    const canonicalItems = items
        .map((item) => [
            item.facility_id,
            item.facility_unit_id ?? null,
            item.booking_date.trim(),
            normalizeBookingTime(item.start_time),
            normalizeBookingTime(item.end_time),
        ])
        .sort((left, right) => {
            const leftKey = JSON.stringify(left);
            const rightKey = JSON.stringify(right);

            return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
        });

    return JSON.stringify(canonicalItems);
}

/**
 * Produces an opaque, deterministic 128-bit fingerprint. The raw user id and
 * cart never enter localStorage or cross-tab messages.
 */
function opaqueFingerprint(value: string): string {
    let h1 = 1_779_033_703;
    let h2 = 3_144_137_427;
    let h3 = 1_013_904_242;
    let h4 = 2_773_480_762;

    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        h1 = h2 ^ Math.imul(h1 ^ code, 597_399_067);
        h2 = h3 ^ Math.imul(h2 ^ code, 2_869_860_233);
        h3 = h4 ^ Math.imul(h3 ^ code, 951_274_213);
        h4 = h1 ^ Math.imul(h4 ^ code, 2_716_044_179);
    }

    h1 = Math.imul(h3 ^ (h1 >>> 18), 597_399_067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2_869_860_233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951_274_213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2_716_044_179);
    h1 ^= h2 ^ h3 ^ h4;
    h2 ^= h1;
    h3 ^= h1;
    h4 ^= h1;

    return [h1, h2, h3, h4]
        .map((hash) => (hash >>> 0).toString(16).padStart(8, "0"))
        .join("");
}

export function bookingCheckoutIntentScope(
    authenticatedUserId: number | string,
    items: readonly BookingCheckoutIntentCartItem[],
): string {
    const userScope = String(authenticatedUserId).trim();
    if (!userScope || items.length === 0) {
        throw new Error("A user and at least one booking slot are required.");
    }

    return `v1-${opaqueFingerprint(
        `${userScope}\u001f${canonicalBookingCheckoutCart(items)}`,
    )}`;
}

function createUuid(): string {
    const cryptoApi = globalThis.crypto;

    if (typeof cryptoApi?.randomUUID === "function") {
        return cryptoApi.randomUUID();
    }

    const bytes = new Uint8Array(16);
    if (typeof cryptoApi?.getRandomValues === "function") {
        cryptoApi.getRandomValues(bytes);
    } else {
        for (let index = 0; index < bytes.length; index += 1) {
            bytes[index] = Math.floor(Math.random() * 256);
        }
    }

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const value = Array.from(bytes, (byte) =>
        byte.toString(16).padStart(2, "0"),
    ).join("");

    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function isStoredIntent(value: unknown): value is StoredBookingCheckoutIntent {
    if (!value || typeof value !== "object") return false;

    const candidate = value as Partial<StoredBookingCheckoutIntent>;
    return (
        candidate.version === 1 &&
        typeof candidate.idempotency_key === "string" &&
        UUID_PATTERN.test(candidate.idempotency_key)
    );
}

function parseStoredIntent(value: string | null): StoredBookingCheckoutIntent | null {
    if (!value) return null;

    try {
        const parsed: unknown = JSON.parse(value);
        return isStoredIntent(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function intentStorageKey(scope: string): string {
    return `${INTENT_STORAGE_PREFIX}${scope}`;
}

function readStoredIntent(scope: string): StoredBookingCheckoutIntent | null {
    if (typeof window === "undefined") {
        return inMemoryIntents.get(scope) ?? null;
    }

    try {
        const storageKey = intentStorageKey(scope);
        const serialized = window.localStorage.getItem(storageKey);
        const stored = parseStoredIntent(serialized);

        if (!stored) {
            inMemoryIntents.delete(scope);
            if (serialized !== null) window.localStorage.removeItem(storageKey);
            return null;
        }

        inMemoryIntents.set(scope, stored);
        return stored;
    } catch {
        return inMemoryIntents.get(scope) ?? null;
    }
}

function publishIntentChange(scope: string): void {
    const message: IntentSyncMessage = { version: 1, scope };

    try {
        intentChannel?.postMessage(message);
    } catch {
        // localStorage remains the source of truth when messaging is blocked.
    }
}

function writeStoredIntent(
    scope: string,
    stored: StoredBookingCheckoutIntent,
): void {
    inMemoryIntents.set(scope, stored);

    if (typeof window !== "undefined") {
        try {
            window.localStorage.setItem(
                intentStorageKey(scope),
                JSON.stringify(stored),
            );
        } catch {
            // Keep a stable in-tab retry key if storage is unavailable.
        }
    }

    publishIntentChange(scope);
}

function initializeCrossTabSync(): void {
    if (syncInitialized || typeof window === "undefined") return;
    syncInitialized = true;

    window.addEventListener("storage", (event) => {
        if (!event.key?.startsWith(INTENT_STORAGE_PREFIX)) return;

        const scope = event.key.slice(INTENT_STORAGE_PREFIX.length);
        if (!SCOPE_PATTERN.test(scope)) return;
        readStoredIntent(scope);
    });

    if (typeof window.BroadcastChannel !== "function") return;

    try {
        intentChannel = new window.BroadcastChannel(INTENT_CHANNEL_NAME);
        intentChannel.addEventListener("message", (event: MessageEvent<unknown>) => {
            const message = event.data as Partial<IntentSyncMessage> | null;
            if (
                !message ||
                message.version !== 1 ||
                typeof message.scope !== "string" ||
                !SCOPE_PATTERN.test(message.scope)
            ) {
                return;
            }

            // Never trust record contents from a message; re-read validated storage.
            readStoredIntent(message.scope);
        });
    } catch {
        intentChannel = null;
    }
}

function parseLock(value: string | null): IntentLockRecord | null {
    if (!value) return null;

    try {
        const parsed = JSON.parse(value) as Partial<IntentLockRecord>;
        if (
            typeof parsed.owner !== "string" ||
            !UUID_PATTERN.test(parsed.owner) ||
            typeof parsed.expires_at !== "number" ||
            !Number.isFinite(parsed.expires_at)
        ) {
            return null;
        }

        return { owner: parsed.owner, expires_at: parsed.expires_at };
    } catch {
        return null;
    }
}

function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function withStorageLease<T>(
    scope: string,
    task: () => T | PromiseLike<T>,
): Promise<T> {
    if (typeof window === "undefined") return task();

    const storageKey = `${INTENT_LOCK_PREFIX}${scope}`;
    const owner = createUuid();

    for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
        try {
            const now = Date.now();
            const current = parseLock(window.localStorage.getItem(storageKey));

            if (!current || current.expires_at <= now) {
                window.localStorage.setItem(
                    storageKey,
                    JSON.stringify({
                        owner,
                        expires_at: now + LOCK_LEASE_MS,
                    } satisfies IntentLockRecord),
                );

                // Let simultaneous contenders settle before claiming the lease.
                await wait(12);
                const confirmed = parseLock(
                    window.localStorage.getItem(storageKey),
                );

                if (confirmed?.owner === owner) {
                    try {
                        return await task();
                    } finally {
                        const latest = parseLock(
                            window.localStorage.getItem(storageKey),
                        );
                        if (latest?.owner === owner) {
                            window.localStorage.removeItem(storageKey);
                        }
                    }
                }
            }
        } catch {
            return task();
        }

        await wait(12 + Math.floor(Math.random() * 12));
    }

    // A stale/blocked lock must not make checkout permanently unavailable.
    return task();
}

async function withIntentLock<T>(
    scope: string,
    task: () => T | PromiseLike<T>,
): Promise<T> {
    initializeCrossTabSync();

    if (typeof navigator !== "undefined") {
        const lockManager = (navigator as Navigator & { locks?: LockManagerLike })
            .locks;

        if (lockManager) {
            try {
                return await lockManager.request(
                    `${INTENT_STORAGE_PREFIX}${scope}`,
                    task,
                );
            } catch {
                // Fall through to the localStorage lease for older implementations.
            }
        }
    }

    return withStorageLease(scope, task);
}

export function readBookingCheckoutIntent(
    scope: string,
): BookingCheckoutIntent | null {
    if (!SCOPE_PATTERN.test(scope)) return null;
    initializeCrossTabSync();

    const stored = readStoredIntent(scope);
    return stored
        ? { scope, idempotencyKey: stored.idempotency_key }
        : null;
}

export async function getOrCreateBookingCheckoutIntent(
    authenticatedUserId: number | string,
    items: readonly BookingCheckoutIntentCartItem[],
): Promise<BookingCheckoutIntent> {
    const scope = bookingCheckoutIntentScope(authenticatedUserId, items);

    return withIntentLock(scope, () => {
        const existing = readStoredIntent(scope);
        if (existing) {
            return { scope, idempotencyKey: existing.idempotency_key };
        }

        const created: StoredBookingCheckoutIntent = {
            version: 1,
            idempotency_key: createUuid(),
        };
        writeStoredIntent(scope, created);

        // A competing fallback writer may have won; always return persisted truth.
        const winner = readStoredIntent(scope) ?? created;
        return { scope, idempotencyKey: winner.idempotency_key };
    });
}

export function clearBookingCheckoutIntent(
    intent: Pick<BookingCheckoutIntent, "scope"> &
        Partial<Pick<BookingCheckoutIntent, "idempotencyKey">>,
): void {
    if (!SCOPE_PATTERN.test(intent.scope)) return;
    initializeCrossTabSync();

    const current = readStoredIntent(intent.scope);
    if (
        intent.idempotencyKey &&
        current?.idempotency_key !== intent.idempotencyKey
    ) {
        return;
    }

    inMemoryIntents.delete(intent.scope);
    if (typeof window !== "undefined") {
        try {
            window.localStorage.removeItem(intentStorageKey(intent.scope));
        } catch {
            // The in-memory copy has still been cleared for this tab.
        }
    }

    publishIntentChange(intent.scope);
}
