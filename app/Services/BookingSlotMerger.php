<?php

namespace App\Services;

class BookingSlotMerger
{
    /**
     * @param array<int, array<string, mixed>> $slots
     * @return array<int, array<string, mixed>>
     */
    public function merge(array $slots): array
    {
        $groups = [];

        foreach ($slots as $slot) {
            $facilityId = (int) $slot['facility_id'];
            $unitId = $slot['facility_unit_id'] ?? null;
            $date = (string) ($slot['booking_date'] ?? $slot['date'] ?? '');
            $key = implode('|', [$facilityId, $unitId ?? 'parent', $date]);

            $normalized = [
                ...$slot,
                'facility_id' => $facilityId,
                'facility_unit_id' => $unitId !== null ? (int) $unitId : null,
                'booking_date' => $date,
                'start_time' => $this->normalizeTime((string) $slot['start_time']),
                'end_time' => $this->normalizeTime((string) $slot['end_time']),
                'subtotal_price' => (int) ($slot['subtotal_price'] ?? $slot['price_amount'] ?? 0),
            ];

            $groups[$key][] = $normalized;
        }

        $merged = [];

        foreach ($groups as $groupSlots) {
            usort($groupSlots, fn (array $a, array $b): int => strcmp($a['start_time'], $b['start_time']));

            $current = null;

            foreach ($groupSlots as $slot) {
                if ($current === null) {
                    $current = $this->newMergedSlot($slot);
                    continue;
                }

                if ($current['end_time'] === $slot['start_time']) {
                    $current['end_time'] = $slot['end_time'];
                    $current['subtotal_price'] += (int) $slot['subtotal_price'];
                    $current['source_slots'][] = $slot;
                    continue;
                }

                $merged[] = $current;
                $current = $this->newMergedSlot($slot);
            }

            if ($current !== null) {
                $merged[] = $current;
            }
        }

        usort($merged, function (array $a, array $b): int {
            return [$a['booking_date'], $a['facility_id'], $a['facility_unit_id'] ?? 0, $a['start_time']]
                <=> [$b['booking_date'], $b['facility_id'], $b['facility_unit_id'] ?? 0, $b['start_time']];
        });

        return array_values($merged);
    }

    /**
     * @param array<string, mixed> $slot
     * @return array<string, mixed>
     */
    private function newMergedSlot(array $slot): array
    {
        return [
            ...$slot,
            'source_slots' => [$slot],
        ];
    }

    private function normalizeTime(string $time): string
    {
        return substr($time, 0, 5);
    }
}
