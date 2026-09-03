<?php

namespace App\Services;

use App\Exceptions\InvoicePdfGenerationException;
use App\Models\Booking;
use App\Models\BookingOrder;
use BaconQrCode\Renderer\GDLibRenderer;
use BaconQrCode\Writer;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\URL;
use Throwable;

class BookingInvoiceService
{
    /**
     * @return array<string, mixed>
     */
    public function document(
        BookingOrder $order,
        bool $includeRenderAssets = true,
    ): array {
        $this->loadBoundedSource($order);
        $transaction = $order->transaction;
        $receipt = $transaction?->receipt_number
            ?? 'DRAFT-'.str_pad((string) $order->id, 6, '0', STR_PAD_LEFT);
        $snapshot = is_array($transaction?->service_snapshot)
            ? $transaction->service_snapshot
            : [];
        $regularSubtotal = (int) $order->subtotal_amount
            + (int) $order->discount_amount;
        $transactionAmount = (int) ($transaction?->amount ?? 0);
        $documentCode = strtoupper(substr(hash_hmac(
            'sha256',
            implode('|', [
                $receipt,
                (string) $order->id,
                (string) $order->total_amount,
                (string) $transaction?->paid_at?->timestamp,
            ]),
            (string) config('app.key'),
        ), 0, 16));
        $verificationUrl = URL::signedRoute(
            'checkout.booking.invoice.verify',
            [
                'bookingOrder' => $order->getRouteKey(),
                'code' => $documentCode,
            ],
        );

        return [
            'receipt' => $receipt,
            'order_id' => $order->id,
            'status' => (string) ($transaction?->payment_status ?? 'UNPAID'),
            'status_label' => $transaction?->payment_status === 'PAID'
                ? 'Lunas'
                : 'Belum lunas',
            'issued_at' => $this->dateTime(
                $transaction?->created_at ?? $order->created_at,
            ),
            'paid_at' => $this->dateTime($transaction?->paid_at),
            'payment_deadline' => $this->dateTime($order->expires_at),
            'printed_at' => $this->dateTime(now()),
            'payment_method' => $this->paymentMethod(
                $transaction?->payment_method,
            ),
            'gateway_reference' => $transaction?->xendit_invoice_id,
            'customer' => [
                'name' => $order->customer_name ?: 'Pengguna UB Sport Center',
                'whatsapp' => $order->whatsapp_number ?: 'Tidak tercatat',
                'category' => $order->identity_category === 'warga_ub'
                    ? 'Warga UB'
                    : 'Umum',
                'identity' => $this->maskedIdentity($order->identity_number),
            ],
            'items' => $this->items($order, $snapshot)->all(),
            'notes' => $order->notes
                ?: 'Tunjukkan invoice ini kepada petugas UB Sport Center saat kedatangan.',
            'pricing' => [
                'regular_subtotal' => $regularSubtotal,
                'discount' => (int) $order->discount_amount,
                'subtotal' => (int) $order->subtotal_amount,
                'transaction_fee' => (int) $order->transaction_fee,
                'total' => (int) $order->total_amount,
                'paid' => $transactionAmount,
                'balance_due' => max(
                    0,
                    (int) $order->total_amount - $transactionAmount,
                ),
                'matches' => $transactionAmount === (int) $order->total_amount,
            ],
            'merchant' => [
                'name' => 'UB Sport Center',
                'address' => 'Jl. Terusan Cibogo No.1, Penanggungan, Kec. Klojen, Kota Malang, Jawa Timur 65113',
                'email' => 'contact@ubsportcenter.co.id',
                'whatsapp' => '+62 852-8080-9080',
            ],
            'document_code' => $documentCode,
            'verification_url' => $verificationUrl,
            'qr_data_uri' => $includeRenderAssets
                ? $this->qrDataUri($verificationUrl)
                : null,
            'logo_data_uri' => $includeRenderAssets
                ? $this->localFileUri(public_path('assets/brand/ubsc-logo-optimized.webp'))
                : null,
            'fonts' => [
                'regular' => $includeRenderAssets ? $this->localFileUri(
                    public_path('fonts/BDOGrotesk-Regular.ttf'),
                ) : null,
                'medium' => $includeRenderAssets ? $this->localFileUri(
                    public_path('fonts/BDOGrotesk-Medium.ttf'),
                ) : null,
                'semibold' => $includeRenderAssets ? $this->localFileUri(
                    public_path('fonts/BDOGrotesk-SemiBold.ttf'),
                ) : null,
                'bold' => $includeRenderAssets ? $this->localFileUri(
                    public_path('fonts/BDOGrotesk-Bold.ttf'),
                ) : null,
            ],
        ];
    }

    private function loadBoundedSource(BookingOrder $order): void
    {
        $maximum = max(8, (int) config('invoice_pdf.bounds.max_document_items', 32));

        $order->loadMissing([
            'bookings' => static fn ($query) => $query
                ->orderBy('id')
                ->limit($maximum + 1),
            'bookings.facility.category',
            'bookings.facilityUnit',
            'transaction',
        ]);
        $snapshotItems = data_get($order->transaction?->service_snapshot, 'items', []);
        $snapshotCount = is_array($snapshotItems) ? count($snapshotItems) : 0;

        if ($order->bookings->count() > $maximum || $snapshotCount > $maximum) {
            throw new InvoicePdfGenerationException(
                'Invoice item count exceeds the renderer safety bound.',
                'item_bound_exceeded',
            );
        }
    }

    /**
     * @param  array<string, mixed>  $snapshot
     * @return Collection<int, array<string, mixed>>
     */
    private function items(BookingOrder $order, array $snapshot): Collection
    {
        $snapshotItems = collect($snapshot['items'] ?? [])
            ->filter(fn (mixed $item): bool => is_array($item))
            ->values();
        $usedSnapshotIndexes = [];

        $items = $order->bookings
            ->map(function (Booking $booking) use (
                $snapshotItems,
                &$usedSnapshotIndexes,
            ): array {
                $snapshotIndex = $snapshotItems->search(
                    fn (array $item): bool => isset($item['booking_id'])
                        && (int) $item['booking_id'] === $booking->id,
                );

                if ($snapshotIndex === false) {
                    $snapshotIndex = $snapshotItems->search(
                        fn (array $item, int $index): bool => ! in_array(
                            $index,
                            $usedSnapshotIndexes,
                            true,
                        )
                            && (int) ($item['facility_id'] ?? 0)
                                === (int) $booking->facility_id
                            && (string) ($item['booking_date'] ?? '')
                                === $booking->booking_date?->toDateString()
                            && substr(
                                (string) ($item['start_time'] ?? ''),
                                0,
                                5,
                            ) === substr((string) $booking->start_time, 0, 5),
                    );
                }

                $itemSnapshot = $snapshotIndex === false
                    ? []
                    : (array) $snapshotItems->get($snapshotIndex);

                if ($snapshotIndex !== false) {
                    $usedSnapshotIndexes[] = $snapshotIndex;
                }

                return $this->bookingItem($booking, $itemSnapshot);
            });

        $snapshotItems->each(function (
            array $item,
            int $index,
        ) use (&$items, $usedSnapshotIndexes): void {
            if (! in_array($index, $usedSnapshotIndexes, true)) {
                $items->push($this->snapshotItem($item));
            }
        });

        return $items
            ->sortBy([
                ['starts_at', 'asc'],
                ['id', 'asc'],
            ])
            ->values();
    }

    /**
     * @param  array<string, mixed>  $snapshot
     * @return array<string, mixed>
     */
    private function bookingItem(Booking $booking, array $snapshot): array
    {
        $date = (string) (
            $snapshot['booking_date']
            ?? $booking->booking_date?->toDateString()
            ?? ''
        );
        $start = substr(
            (string) ($snapshot['start_time'] ?? $booking->start_time),
            0,
            5,
        );
        $end = substr(
            (string) ($snapshot['end_time'] ?? $booking->end_time),
            0,
            5,
        );

        return [
            'id' => $booking->id,
            'facility_name' => $snapshot['facility_name']
                ?? $booking->facility?->name
                ?? 'Fasilitas tersimpan',
            'unit_name' => $snapshot['facility_unit_name']
                ?? $booking->facilityUnit?->name
                ?? 'Unit utama',
            'category_name' => $snapshot['category_name']
                ?? $booking->facility?->category?->name,
            'location' => $snapshot['location']
                ?? $booking->facility?->location,
            'booking_date' => $date,
            'date_label' => $this->date($date),
            'start_time' => $start,
            'end_time' => $end,
            'starts_at' => $snapshot['starts_at']
                ?? ($date && $start ? "{$date}T{$start}:00" : null),
            'duration_minutes' => (int) (
                $snapshot['duration_minutes']
                ?? $this->duration($start, $end)
            ),
            'subtotal' => (int) (
                $snapshot['subtotal']
                ?? $booking->subtotal_price
            ),
            'status' => $this->bookingStatus((string) $booking->status),
        ];
    }

    /**
     * @param  array<string, mixed>  $snapshot
     * @return array<string, mixed>
     */
    private function snapshotItem(array $snapshot): array
    {
        $date = (string) ($snapshot['booking_date'] ?? '');
        $start = substr((string) ($snapshot['start_time'] ?? ''), 0, 5);
        $end = substr((string) ($snapshot['end_time'] ?? ''), 0, 5);

        return [
            'id' => $snapshot['booking_id'] ?? null,
            'facility_name' => $snapshot['facility_name']
                ?? 'Reservasi tersimpan',
            'unit_name' => $snapshot['facility_unit_name'] ?? 'Unit utama',
            'category_name' => $snapshot['category_name'] ?? null,
            'location' => $snapshot['location'] ?? null,
            'booking_date' => $date,
            'date_label' => $this->date($date),
            'start_time' => $start,
            'end_time' => $end,
            'starts_at' => $snapshot['starts_at']
                ?? ($date && $start ? "{$date}T{$start}:00" : null),
            'duration_minutes' => (int) (
                $snapshot['duration_minutes']
                ?? $this->duration($start, $end)
            ),
            'subtotal' => (int) ($snapshot['subtotal'] ?? 0),
            'status' => 'Arsip transaksi',
        ];
    }

    private function paymentMethod(?string $method): string
    {
        return match ($method) {
            'bca_va' => 'BCA Virtual Account',
            'qris' => 'QRIS',
            'card' => 'Kartu debit / kredit',
            default => 'Tidak tercatat',
        };
    }

    private function bookingStatus(string $status): string
    {
        return match ($status) {
            'confirmed' => 'Terkonfirmasi',
            'pending' => 'Menunggu konfirmasi',
            'cancelled' => 'Dibatalkan',
            'completed' => 'Selesai digunakan',
            default => ucfirst(str_replace('_', ' ', $status)),
        };
    }

    private function maskedIdentity(?string $identity): ?string
    {
        if (! $identity) {
            return null;
        }

        $suffix = substr($identity, -4);

        return str_repeat('*', max(4, strlen($identity) - 4)).$suffix;
    }

    private function date(string $value): string
    {
        if ($value === '') {
            return 'Tidak tercatat';
        }

        return Carbon::parse($value)
            ->locale('id')
            ->translatedFormat('d F Y');
    }

    private function dateTime(mixed $value): ?string
    {
        if (! $value) {
            return null;
        }

        return Carbon::parse($value)
            ->timezone(config('app.timezone'))
            ->locale('id')
            ->translatedFormat('d F Y, H:i').' WIB';
    }

    private function duration(string $start, string $end): int
    {
        if (! preg_match('/^\d{2}:\d{2}$/', $start)
            || ! preg_match('/^\d{2}:\d{2}$/', $end)) {
            return 0;
        }

        [$startHour, $startMinute] = array_map('intval', explode(':', $start));
        [$endHour, $endMinute] = array_map('intval', explode(':', $end));

        return max(
            0,
            (($endHour * 60) + $endMinute)
                - (($startHour * 60) + $startMinute),
        );
    }

    private function localFileUri(string $path): ?string
    {
        $realPath = realpath($path);

        if ($realPath === false || ! is_file($realPath) || ! is_readable($realPath)) {
            return null;
        }

        $normalized = str_replace('\\', '/', $realPath);

        return 'file://'.$normalized;
    }

    private function qrDataUri(string $payload): ?string
    {
        try {
            $renderer = new GDLibRenderer(720, 4, 'png', 9);
            $png = (new Writer($renderer))->writeString($payload);

            return 'data:image/png;base64,'.base64_encode($png);
        } catch (Throwable) {
            return null;
        }
    }
}
