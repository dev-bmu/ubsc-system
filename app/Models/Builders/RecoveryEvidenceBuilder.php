<?php

namespace App\Models\Builders;

use Illuminate\Database\Eloquent\Builder;
use LogicException;

final class RecoveryEvidenceBuilder extends Builder
{
    public function update(array $values): never
    {
        throw new LogicException('Recovery evidence is append-only.');
    }

    public function delete(): never
    {
        throw new LogicException('Recovery evidence cannot be deleted by the application.');
    }

    public function forceDelete(): never
    {
        throw new LogicException('Recovery evidence cannot be deleted by the application.');
    }
}
