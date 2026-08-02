const PAYMENT_INTENT_PREFIX = "ubsc.payment-attempt.v1.";
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createUuid(): string {
    if (typeof globalThis.crypto?.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
    }

    const bytes = new Uint8Array(16);
    if (typeof globalThis.crypto?.getRandomValues === "function") {
        globalThis.crypto.getRandomValues(bytes);
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

function opaqueScope(value: string): string {
    let first = 2_166_136_261;
    let second = 2_246_822_519;

    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        first = Math.imul(first ^ code, 16_777_619);
        second = Math.imul(second ^ (code + index), 2_246_822_519);
    }

    return `${(first >>> 0).toString(16).padStart(8, "0")}${(
        second >>> 0
    )
        .toString(16)
        .padStart(8, "0")}`;
}

export function paymentAttemptIntentScope(parts: readonly unknown[]): string {
    return opaqueScope(JSON.stringify(parts));
}

export function getOrCreatePaymentAttemptKey(scope: string): string {
    const storageKey = `${PAYMENT_INTENT_PREFIX}${scope}`;

    if (typeof window !== "undefined") {
        try {
            const existing = window.localStorage.getItem(storageKey);
            if (existing && UUID_PATTERN.test(existing)) return existing;

            const created = createUuid();
            window.localStorage.setItem(storageKey, created);
            const winner = window.localStorage.getItem(storageKey);

            return winner && UUID_PATTERN.test(winner) ? winner : created;
        } catch {
            // The backend also deduplicates an identical live fingerprint.
        }
    }

    return createUuid();
}

export function clearPaymentAttemptKey(scope: string): void {
    if (typeof window === "undefined") return;

    try {
        window.localStorage.removeItem(`${PAYMENT_INTENT_PREFIX}${scope}`);
    } catch {
        // A final server state remains authoritative when storage is blocked.
    }
}
