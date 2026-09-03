<?php

namespace App\Services\Production;

use App\Enums\ProductionTopology;
use App\Exceptions\ProductionContractViolation;

final class ProductionRuntimeContract
{
    public function __construct(
        private readonly ProductionTopologyResolver $topology,
        private readonly ProductionContract $multiNode,
        private readonly SingleNodeProductionContract $singleNode,
    ) {}

    public function shouldEnforce(): bool
    {
        return match ($this->topology->current()) {
            ProductionTopology::SingleNode => $this->singleNode->shouldEnforce(),
            ProductionTopology::MultiNode => $this->multiNode->shouldEnforce(),
            default => false,
        };
    }

    /** @return array<string, mixed> */
    public function report(): array
    {
        $topology = $this->topology->current();

        if ($topology === ProductionTopology::SingleNode) {
            return $this->singleNode->report();
        }

        if ($topology === ProductionTopology::MultiNode) {
            return [
                'topology' => $topology->value,
                'availability' => 'multiple_failure_domains',
                ...$this->multiNode->report(),
                'active_capabilities' => ['strict_multi_node_contract'],
                'standby_capabilities' => [],
            ];
        }

        return [
            'topology' => $this->topology->configuredValue(),
            'availability' => 'unresolved',
            'valid' => false,
            'strict_valid' => false,
            'failures' => 1,
            'warnings' => 0,
            'checks' => [[
                'code' => 'topology.supported',
                'status' => 'fail',
                'message' => 'PRODUCTION_TOPOLOGY must explicitly be [single_node] or [multi_node].',
            ]],
            'active_capabilities' => [],
            'standby_capabilities' => [],
        ];
    }

    public function assertSatisfied(): void
    {
        $report = $this->report();
        if ($report['valid']) {
            return;
        }

        throw ProductionContractViolation::fromCodes(array_values(array_map(
            static fn (array $check): string => $check['code'],
            array_filter(
                $report['checks'],
                static fn (array $check): bool => $check['status'] === 'fail',
            ),
        )));
    }
}
