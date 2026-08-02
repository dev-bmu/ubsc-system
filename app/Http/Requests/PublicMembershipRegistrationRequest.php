<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PublicMembershipRegistrationRequest extends FormRequest
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
            'full_name' => ['required', 'string', 'min:2', 'max:255'],
            'email' => [
                'required',
                'email:rfc',
                'max:255',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    if (mb_strtolower(trim((string) $value))
                        !== mb_strtolower((string) $this->user()?->email)) {
                        $fail('Email pendaftaran harus sama dengan email akun yang sedang digunakan.');
                    }
                },
            ],
            'gender' => ['required', Rule::in(['L', 'P'])],
            'whatsapp' => [
                'required',
                'string',
                'max:30',
                'regex:/^(?:\+62|62|0)8[0-9]{7,13}$/',
            ],
            'category' => [
                'required',
                Rule::in(['warga_ub', 'umum']),
                function (string $attribute, mixed $value, \Closure $fail): void {
                    if ($value !== 'warga_ub') {
                        return;
                    }

                    $user = $this->user();
                    if ($user?->identity_category !== 'warga_kampus'
                        || $user?->identity_status !== 'verified') {
                        $fail('Kategori Warga UB hanya tersedia untuk identitas kampus yang telah terverifikasi.');
                    }
                },
            ],
            'membership_plan_id' => [
                'required',
                'integer',
                Rule::exists('membership_plans', 'id')->where(
                    fn ($query) => $query
                        ->where('is_active', true)
                        ->where('price', '>', 0),
                ),
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
            'membership_plan_id.exists' => 'Paket membership tidak tersedia atau sudah dinonaktifkan.',
            'whatsapp.regex' => 'Nomor WhatsApp harus menggunakan format nomor Indonesia yang valid.',
            'idempotency_key.uuid' => 'Identitas permintaan tidak valid. Muat ulang formulir lalu coba lagi.',
        ];
    }

    protected function prepareForValidation(): void
    {
        $phone = preg_replace('/[\s().-]+/', '', (string) $this->input('whatsapp'));

        $this->merge([
            'full_name' => trim((string) $this->input('full_name')),
            'email' => mb_strtolower(trim((string) $this->input('email'))),
            'whatsapp' => $phone,
            'gender' => mb_strtoupper(trim((string) $this->input('gender'))),
            'category' => str_replace(
                '-',
                '_',
                mb_strtolower(trim((string) $this->input('category'))),
            ),
        ]);
    }
}
