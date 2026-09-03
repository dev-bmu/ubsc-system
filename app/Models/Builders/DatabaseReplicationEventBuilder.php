<?php

namespace App\Models\Builders;

use Illuminate\Database\Eloquent\Builder;
use LogicException;

final class DatabaseReplicationEventBuilder extends Builder
{
    public function update(array $values): never
    {
        throw new LogicException('Database replication events are append-only.');
    }

    public function delete(): never
    {
        throw new LogicException('Database replication events cannot be deleted.');
    }

    public function forceDelete(): never
    {
        throw new LogicException('Database replication events cannot be deleted.');
    }
}
