<?php

namespace App\Support;

final class ResilienceTargetPolicy
{
    /** @param array<int|string, mixed> $productionNames */
    public static function isProductionLike(
        string $environment,
        array $productionNames,
    ): bool {
        $environment = strtolower(trim($environment));
        $names = array_values(array_unique(array_filter(array_map(
            static fn (mixed $name): string => strtolower(trim((string) $name)),
            $productionNames,
        ))));

        if ($environment === '' || in_array($environment, $names, true)) {
            return $environment !== '';
        }

        // Prefix matching closes common delimiter-free aliases such as
        // prod2, prodblue, productionwest, and livegreen. `preprod` remains a
        // distinct non-production token and is therefore not matched here.
        return preg_match('/\A(?:prd|prod(?:uction)?|live)/i', $environment) === 1
            || preg_match(
                '/(?:^|[_.:\/\-])(?:prd|prod(?:uction)?|live)(?:\d+)?(?:$|[_.:\/\-])/i',
                $environment,
            ) === 1;
    }
}
