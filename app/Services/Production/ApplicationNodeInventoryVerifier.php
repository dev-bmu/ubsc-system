<?php

namespace App\Services\Production;

use App\Services\Capacity\CapacityPlatformObservationStore;
use Throwable;

final class ApplicationNodeInventoryVerifier
{
    public function __construct(
        private readonly CapacityPlatformObservationStore $observations,
    ) {}

    /** @return array{valid:bool,code:string,message:string} */
    public function verify(int $expectedNodes): array
    {
        $minimum = max(
            2,
            (int) config('production.application_instances', 1),
            (int) config('capacity_planning.web.minimum_instances', 2),
        );
        $maximum = (int) config('capacity_planning.web.maximum_instances', 0);

        if ($maximum < $minimum) {
            return $this->failure(
                'inventory.invalid_capacity_bounds',
                'The configured web-capacity floor and ceiling are inconsistent.',
            );
        }

        if ($expectedNodes < $minimum || $expectedNodes > $maximum) {
            return $this->failure(
                'inventory.expected_count_out_of_bounds',
                "The acceptance node count must be between the configured floor ({$minimum}) and ceiling ({$maximum}).",
            );
        }

        try {
            $inventory = $this->observations->latestWebInventory();
        } catch (Throwable) {
            return $this->failure(
                'inventory.provider_evidence_unavailable',
                'Fresh signed provider inventory is unavailable or cannot be verified.',
            );
        }

        if ($inventory === null) {
            return $this->failure(
                'inventory.provider_evidence_missing',
                'A fresh signed provider inventory for this release and infrastructure profile is required.',
            );
        }

        if ($inventory['current_instances'] !== $expectedNodes
            || $inventory['ready_instances'] !== $expectedNodes) {
            return $this->failure(
                'inventory.nodes_not_converged',
                'The expected, provisioned, and ready application-node counts have not converged.',
            );
        }

        return [
            'valid' => true,
            'code' => 'inventory.nodes_converged',
            'message' => "Fresh signed provider inventory confirms {$expectedNodes} provisioned and ready application nodes.",
        ];
    }

    /** @return array{valid:false,code:string,message:string} */
    private function failure(string $code, string $message): array
    {
        return [
            'valid' => false,
            'code' => $code,
            'message' => $message,
        ];
    }
}
