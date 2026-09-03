<?php

namespace App\Services\Production;

final class SupervisorConfigurationParser
{
    /**
     * Parse the strict INI subset used by Supervisor without evaluating
     * interpolation tokens such as %(process_num)s.
     *
     * @return array{sections:array<string, array<string, string>>,errors:list<string>}
     */
    public function parse(string $contents): array
    {
        $sections = [];
        $errors = [];
        $section = null;
        $lines = preg_split('/\R/', $contents);

        if (! is_array($lines)) {
            return ['sections' => [], 'errors' => ['artifact.lines']];
        }

        foreach ($lines as $offset => $rawLine) {
            $lineNumber = $offset + 1;
            $line = trim($rawLine);

            if ($line === '' || str_starts_with($line, ';') || str_starts_with($line, '#')) {
                continue;
            }

            if (preg_match('/^\[([^\]]+)]$/', $line, $matches) === 1) {
                $candidate = strtolower(trim($matches[1]));

                if ($candidate === '' || isset($sections[$candidate])) {
                    $errors[] = "artifact.section.{$lineNumber}";
                    $section = null;

                    continue;
                }

                $section = $candidate;
                $sections[$section] = [];

                continue;
            }

            if ($section === null || ! str_contains($line, '=')) {
                $errors[] = "artifact.syntax.{$lineNumber}";

                continue;
            }

            [$rawKey, $value] = explode('=', $line, 2);
            $key = strtolower(trim($rawKey));

            if ($key === '' || isset($sections[$section][$key])) {
                $errors[] = "artifact.key.{$lineNumber}";

                continue;
            }

            $sections[$section][$key] = trim($value);
        }

        return ['sections' => $sections, 'errors' => $errors];
    }
}
