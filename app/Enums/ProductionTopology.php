<?php

namespace App\Enums;

enum ProductionTopology: string
{
    case SingleNode = 'single_node';
    case MultiNode = 'multi_node';

    public static function resolve(mixed $value): ?self
    {
        if (! is_string($value)) {
            return null;
        }

        return self::tryFrom(strtolower(trim($value)));
    }
}
