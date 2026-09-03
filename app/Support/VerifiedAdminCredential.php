<?php

namespace App\Support;

/**
 * Opaque proof that a specific persisted admin password hash was verified.
 *
 * Carrying only the fingerprint prevents the password hash itself from being
 * propagated through the controller or accidentally exposed to telemetry.
 */
final readonly class VerifiedAdminCredential
{
    public function __construct(
        public int $userId,
        public string $fingerprint,
    ) {}
}
