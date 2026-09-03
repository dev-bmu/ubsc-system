<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class StoreAdminBookingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('manage-bookings') ?? false;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'customer_name' => ['required', 'string', 'max:255'],
            'customer_phone' => [
                'nullable',
                'string',
                'max:30',
                'regex:/^628[0-9]{7,13}$/',
            ],
            'facility_id' => ['required', 'integer', 'exists:facilities,id'],
            'facility_unit_id' => ['nullable', 'integer', 'exists:facility_units,id'],
            'booking_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'start_time' => ['required', 'date_format:H:i'],
            'end_time' => ['required', 'date_format:H:i'],
            'pax' => ['nullable', 'integer', 'min:1', 'max:9999'],
            'is_free' => ['sometimes', 'boolean'],
            'notes' => ['nullable', 'string', 'max:500'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'customer_phone.regex' => 'Nomor WhatsApp harus menggunakan format nomor Indonesia yang valid.',
            'booking_date.date_format' => 'Tanggal booking tidak valid.',
            'booking_date.after_or_equal' => 'Tanggal booking tidak boleh berada di masa lalu.',
        ];
    }

    protected function prepareForValidation(): void
    {
        $phone = preg_replace(
            '/[\s().+\-]+/',
            '',
            (string) $this->input('customer_phone'),
        ) ?? '';

        if (str_starts_with($phone, '0')) {
            $phone = '62'.substr($phone, 1);
        } elseif (str_starts_with($phone, '8')) {
            $phone = '62'.$phone;
        }

        $notes = trim((string) $this->input('notes'));

        $this->merge([
            'customer_name' => trim((string) $this->input('customer_name')),
            'customer_phone' => $phone !== '' ? $phone : null,
            'notes' => $notes !== '' ? $notes : null,
        ]);
    }
}
