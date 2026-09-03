<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** @var array<string, array<string, list<string>>> */
    private const INDEXES = [
        'capacity_load_evidence' => [
            'capacity_evidence_current_v2_idx' => [
                'scope', 'environment', 'infrastructure_profile', 'release', 'generated_at', 'id',
            ],
            'capacity_evidence_prune_v2_idx' => ['imported_at', 'id'],
        ],
        'capacity_platform_observations' => [
            'capacity_observation_current_v2_idx' => [
                'provider', 'environment', 'infrastructure_profile', 'release', 'observed_at', 'id',
            ],
        ],
        'capacity_scaling_states' => [
            'capacity_state_prune_v2_idx' => ['updated_at', 'target_key'],
        ],
        'capacity_scaling_plans' => [
            'capacity_plan_current_v2_idx' => [
                'environment', 'infrastructure_profile', 'release', 'generated_at', 'id',
            ],
        ],
    ];

    public function up(): void
    {
        foreach (self::INDEXES as $table => $indexes) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            foreach ($indexes as $name => $columns) {
                if ($this->hasIndex($table, $name)) {
                    continue;
                }

                Schema::table($table, static function (Blueprint $blueprint) use ($columns, $name): void {
                    $blueprint->index($columns, $name);
                });
            }
        }
    }

    public function down(): void
    {
        $hasOperationalHistory = collect(array_keys(self::INDEXES))->contains(
            static fn (string $table): bool => Schema::hasTable($table)
                && DB::table($table)->exists(),
        );
        if ($hasOperationalHistory) {
            throw new RuntimeException(
                'Capacity index rollback refused while operational capacity history exists.',
            );
        }

        foreach (array_reverse(self::INDEXES, true) as $table => $indexes) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            foreach (array_reverse(array_keys($indexes)) as $name) {
                if (! $this->hasIndex($table, $name)) {
                    continue;
                }

                Schema::table($table, static function (Blueprint $blueprint) use ($name): void {
                    $blueprint->dropIndex($name);
                });
            }
        }
    }

    private function hasIndex(string $table, string $name): bool
    {
        return collect(Schema::getIndexes($table))->contains(
            static fn (array $index): bool => ($index['name'] ?? null) === $name,
        );
    }
};
