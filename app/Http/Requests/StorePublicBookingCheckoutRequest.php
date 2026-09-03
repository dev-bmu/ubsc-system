<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StorePublicBookingCheckoutRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'idempotency_key' => ['required', 'uuid'],
            'items' => [
                'required',
                'array',
                'min:1',
                'max:'.max(1, (int) config('services.payment.booking_max_items', 8)),
            ],
            'items.*.facility_id' => ['required', 'integer', 'exists:facilities,id'],
            'items.*.facility_unit_id' => ['nullable', 'integer', 'exists:facility_units,id'],
            'items.*.booking_date' => ['required', 'date_format:Y-m-d'],
            'items.*.start_time' => ['required', 'date_format:H:i'],
            'items.*.end_time' => ['required', 'date_format:H:i'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'idempotency_key.required' => 'Identitas reservasi tidak tersedia. Muat ulang halaman dan coba kembali.',
            'idempotency_key.uuid' => 'Identitas reservasi tidak valid. Muat ulang halaman dan coba kembali.',
            'items.required' => 'Pilih setidaknya satu jadwal reservasi.',
            'items.min' => 'Pilih setidaknya satu jadwal reservasi.',
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'idempotency_key' => $this->input('idempotency_key')
                ?: $this->header('Idempotency-Key'),
        ]);
    }
}
