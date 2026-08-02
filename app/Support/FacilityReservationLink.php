<?php

namespace App\Support;

use App\Models\Facility;

class FacilityReservationLink
{
    public const DEFAULT_MESSAGE = "Halo UB Sport Center 👋\n\nSaya ingin melakukan reservasi *{facility_name}* di lokasi *{location}*.\n\nMohon bantuannya untuk informasi jadwal yang tersedia, harga, dan langkah reservasi selanjutnya.\n\nTerima kasih.";

    /**
     * @return array{
     *     configured_method: string,
     *     method: string,
     *     href: string,
     *     target: '_self'|'_blank',
     *     automatic_fallback: bool
     * }
     */
    public static function resolve(Facility $facility): array
    {
        $configuredMethod = in_array(
            $facility->reservation_method,
            ['auto', 'website', 'whatsapp', 'external'],
            true,
        ) ? $facility->reservation_method : 'auto';
        $method = $configuredMethod === 'auto'
            ? (
                $facility->isVisibleInBookingDirectory()
                    ? 'website'
                    : 'whatsapp'
            )
            : $configuredMethod;

        if ($method === 'external' && ! self::isSafePublicUrl($facility->reservation_url)) {
            $method = 'whatsapp';
        }

        if ($method === 'website') {
            return [
                'configured_method' => $configuredMethod,
                'method' => 'website',
                'href' => '/booking?facility='.rawurlencode($facility->slug),
                'target' => '_self',
                'automatic_fallback' => false,
            ];
        }

        if ($method === 'external') {
            return [
                'configured_method' => $configuredMethod,
                'method' => 'external',
                'href' => trim((string) $facility->reservation_url),
                'target' => '_blank',
                'automatic_fallback' => false,
            ];
        }

        return [
            'configured_method' => $configuredMethod,
            'method' => 'whatsapp',
            'href' => self::whatsappUrl($facility),
            'target' => '_blank',
            'automatic_fallback' => $configuredMethod === 'auto',
        ];
    }

    private static function whatsappUrl(Facility $facility): string
    {
        $phone = preg_replace(
            '/\D+/',
            '',
            (string) ($facility->reservation_phone ?: config('business.whatsapp.number')),
        ) ?: '6285280809080';
        if (str_starts_with($phone, '0')) {
            $phone = '62'.substr($phone, 1);
        } elseif (str_starts_with($phone, '8')) {
            $phone = '62'.$phone;
        }
        $message = trim((string) ($facility->reservation_message ?: self::DEFAULT_MESSAGE));
        $message = strtr($message, [
            '{facility_name}' => $facility->name,
            '{location}' => $facility->location ?: 'UB Sport Center',
            '{class_code}' => $facility->class_code ?: '-',
        ]);

        return 'https://api.whatsapp.com/send/?'.http_build_query([
            'phone' => $phone,
            'text' => $message,
            'type' => 'phone_number',
            'app_absent' => 0,
        ], '', '&', PHP_QUERY_RFC3986);
    }

    private static function isSafePublicUrl(?string $url): bool
    {
        if (! is_string($url) || trim($url) === '') {
            return false;
        }

        $scheme = parse_url(trim($url), PHP_URL_SCHEME);

        return in_array(strtolower((string) $scheme), ['http', 'https'], true);
    }
}
