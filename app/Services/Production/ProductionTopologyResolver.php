<?php

namespace App\Services\Production;

use App\Enums\ProductionTopology;
use Illuminate\Contracts\Config\Repository;

final class ProductionTopologyResolver
{
    public function __construct(private readonly Repository $config) {}

    public function current(): ?ProductionTopology
    {
        return ProductionTopology::resolve($this->config->get('production.topology'));
    }

    public function isSingleNode(): bool
    {
        return $this->current() === ProductionTopology::SingleNode;
    }

    public function isMultiNode(): bool
    {
        return $this->current() === ProductionTopology::MultiNode;
    }

    public function configuredValue(): string
    {
        return strtolower(trim((string) $this->config->get('production.topology', '')));
    }
}
