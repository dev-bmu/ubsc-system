<?php

namespace App\Services;

use App\Models\Membership;
use App\Models\MembershipPlan;
use BaconQrCode\Renderer\GDLibRenderer;
use BaconQrCode\Writer;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\URL;
use Throwable;

class MembershipInvoiceService
{
    /**
     * @return array<string, mixed>
     */
    public function document(
        Membership $membership,
        bool $includeRenderAssets = true,
    ): array {
        $membership->loadMissing(['plan', 'transaction', 'user']);
        $transaction = $membership->transaction;
        $snapshot = is_array($transaction?->service_snapshot)
            ? $transaction->service_snapshot
            : [];
        $registration = is_array($snapshot['registration'] ?? null)
            ? $snapshot['registration']
            : [];
        $receipt = $transaction?->receipt_number
            ?? 'DRAFT-'.str_pad((string) $membership->id, 6, '0', STR_PAD_LEFT);
        $amount = (int) ($snapshot['price'] ?? $transaction?->amount ?? 0);
        $compareAtPrice = max(
            $amount,
            (int) ($snapshot['compare_at_price'] ?? $amount),
        );
        $tier = (string) (
            $snapshot['plan_tier']
            ?? $membership->plan?->tier
            ?? MembershipPlan::TIER_HEMAT
        );
        $durationMonths = max(1, (int) (
            $snapshot['duration_months']
            ?? $membership->plan?->duration_months
            ?? 1
        ));
        $startDate = (string) (
            $snapshot['start_date']
            ?? $membership->start_date?->toDateString()
            ?? ''
        );
        $endDate = (string) (
            $snapshot['end_date']
            ?? $membership->end_date?->toDateString()
            ?? ''
        );
        $documentCode = strtoupper(substr(hash_hmac(
            'sha256',
            implode('|', [
                'membership',
                $receipt,
                (string) $membership->id,
                (string) $amount,
                (string) $transaction?->paid_at?->timestamp,
            ]),
            (string) config('app.key'),
        ), 0, 16));
        $verificationUrl = URL::signedRoute(
            'checkout.membership.invoice.verify',
            [
                'membership' => $membership->getRouteKey(),
                'code' => $documentCode,
            ],
        );

        return [
            'receipt' => $receipt,
            'order_id' => $membership->id,
            'document_subject' => 'Membership gym',
            'status' => (string) ($transaction?->payment_status ?? 'UNPAID'),
            'status_label' => $transaction?->payment_status === 'PAID'
                ? 'Lunas'
                : 'Belum lunas',
            'issued_at' => $this->dateTime(
                $transaction?->created_at ?? $membership->created_at,
            ),
            'paid_at' => $this->dateTime($transaction?->paid_at),
            'payment_deadline' => $this->dateTime(
                $membership->registration_expires_at,
            ),
            'printed_at' => $this->dateTime(now()),
            'payment_method' => $this->paymentMethod(
                $transaction?->payment_method,
            ),
            'gateway_reference' => $transaction?->xendit_invoice_id,
            'customer' => [
                'name' => $membership->customer_name
                    ?: ($registration['full_name'] ?? 'Pengguna UB Sport Center'),
                'whatsapp' => $membership->registration_phone
                    ?: ($registration['whatsapp'] ?? 'Tidak tercatat'),
                'email' => $membership->registration_email
                    ?: ($registration['email'] ?? $membership->user?->email),
                'category' => $membership->registration_category === 'warga_ub'
                    ? 'Warga UB'
                    : 'Umum',
                'identity' => null,
            ],
            'items' => [[
                'id' => $membership->id,
                'facility_name' => $snapshot['plan_name']
                    ?? $membership->plan?->name
                    ?? 'Membership Gym',
                'unit_name' => MembershipPlan::TIER_LABELS[$tier]
                    ?? ucfirst($tier),
                'category_name' => MembershipPlan::durationLabelFor(
                    $durationMonths,
                ),
                'location' => 'UB Sport Center',
                'booking_date' => $startDate,
                'date_label' => $this->date($startDate),
                'start_time' => '',
                'end_time' => '',
                'starts_at' => $startDate,
                'duration_minutes' => 0,
                'subtotal' => $amount,
                'status' => 'Pembayaran lunas',
                'details' => [
                    'Paket '.(
                        MembershipPlan::TIER_LABELS[$tier]
                        ?? ucfirst($tier)
                    ).' - '.MembershipPlan::durationLabelFor($durationMonths),
                    'Periode '.$this->date($startDate).' - '.$this->date($endDate),
                    'Keanggotaan UB Sport Center',
                ],
            ]],
            'notes' => 'Simpan invoice ini sebagai bukti pembayaran membership UB Sport Center.',
            'pricing' => [
                'regular_subtotal' => $compareAtPrice,
                'discount' => max(0, $compareAtPrice - $amount),
                'subtotal' => $amount,
                'transaction_fee' => 0,
                'total' => $amount,
                'paid' => (int) ($transaction?->amount ?? 0),
                'balance_due' => max(
                    0,
                    $amount - (int) ($transaction?->amount ?? 0),
                ),
                'matches' => (int) ($transaction?->amount ?? 0) === $amount,
            ],
            'merchant' => [
                'name' => 'UB Sport Center',
                'address' => 'Jl. Terusan Cibogo No.1, Penanggungan, Kec. Klojen, Kota Malang, Jawa Timur 65113',
                'email' => 'contact@ubsportcenter.co.id',
                'whatsapp' => '+62 852-8080-9080',
            ],
            'terms' => [
                'Invoice membership sah setelah pembayaran tercatat lunas.',
                'Masa aktif mengikuti periode yang tercantum dan tidak dapat dipindahtangankan.',
                'Akses fasilitas mengikuti paket, jadwal operasional, serta kebijakan UB Sport Center.',
                'Jangan bagikan QR atau nomor transaksi. Invoice ini bukan merupakan faktur pajak.',
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

    private function paymentMethod(?string $method): string
    {
        return match ($method) {
            'bca_va' => 'BCA Virtual Account',
            'qris' => 'QRIS',
            'card' => 'Kartu debit / kredit',
            'admin_confirmation' => 'Konfirmasi admin',
            default => 'Tidak tercatat',
        };
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
