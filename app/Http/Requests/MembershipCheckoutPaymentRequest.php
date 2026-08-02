<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class MembershipCheckoutPaymentRequest extends FormRequest
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
            'customer_name' => [
                'required',
                'string',
                'min:2',
                'max:255',
            ],
            'whatsapp_number' => [
                'required',
                'string',
                'max:30',
                'regex:/^(?:\+62|62|0)8[0-9]{7,13}$/',
            ],
            'payment_method' => [
                'required',
                Rule::in(['bca_va', 'qris', 'card']),
            ],
            'idempotency_key' => ['required', 'uuid'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'customer_name.required' => 'Nama lengkap wajib diisi.',
            'whatsapp_number.required' => 'Nomor WhatsApp wajib diisi.',
            'whatsapp_number.regex' => 'Nomor WhatsApp harus menggunakan format nomor Indonesia yang valid.',
            'payment_method.required' => 'Pilih metode pembayaran.',
            'payment_method.in' => 'Metode pembayaran tidak tersedia.',
            'idempotency_key.required' => 'Identitas percobaan pembayaran tidak tersedia. Muat ulang halaman dan coba kembali.',
            'idempotency_key.uuid' => 'Identitas percobaan pembayaran tidak valid. Muat ulang halaman dan coba kembali.',
        ];
    }

    protected function prepareForValidation(): void
    {
        $phone = preg_replace(
            '/[\s().-]+/',
            '',
            (string) $this->input('whatsapp_number'),
        );

        $this->merge([
            'customer_name' => trim((string) $this->input('customer_name')),
            'whatsapp_number' => $phone,
            'idempotency_key' => $this->input('idempotency_key')
                ?: $this->header('Idempotency-Key'),
        ]);
    }
}
