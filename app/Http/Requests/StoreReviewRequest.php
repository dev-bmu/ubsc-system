<?php

namespace App\Http\Requests;

use Closure;
use Illuminate\Foundation\Http\FormRequest;

class StoreReviewRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        $text = preg_replace("/\r\n?|\x{2028}|\x{2029}/u", "\n", (string) $this->input('text', ''));

        $this->merge([
            'text' => trim((string) $text),
        ]);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'rating' => [
                'bail',
                'required',
                'numeric',
                'min:0.5',
                'max:5',
                'multiple_of:0.5',
            ],
            'text' => [
                'bail',
                'required',
                'string',
                'min:10',
                'max:1000',
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (preg_match('/<\/?[a-z][^>]*>/i', (string) $value) === 1) {
                        $fail('Ulasan harus berupa teks biasa tanpa kode HTML.');
                    }
                },
            ],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'rating.required' => 'Pilih rating terlebih dahulu.',
            'rating.multiple_of' => 'Rating harus menggunakan kelipatan 0,5.',
            'text.required' => 'Tuliskan pengalaman Anda terlebih dahulu.',
            'text.min' => 'Ulasan minimal 10 karakter.',
            'text.max' => 'Ulasan maksimal 1000 karakter.',
        ];
    }
}
