<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateNewsHeroRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('publish-news') ?? false;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'news_ids' => ['present', 'array', 'max:6'],
            'news_ids.*' => [
                'required',
                'integer',
                'distinct',
                Rule::exists('news', 'id'),
            ],
            'expected_news_ids' => ['present', 'array', 'max:6'],
            'expected_news_ids.*' => ['required', 'integer', 'distinct'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'news_ids.present' => 'Susunan hero wajib dikirim, meskipun ingin memakai mode otomatis.',
            'news_ids.array' => 'Susunan hero tidak valid.',
            'news_ids.max' => 'Hero News maksimal berisi 6 berita atau artikel pilihan.',
            'news_ids.*.integer' => 'Salah satu konten hero tidak valid.',
            'news_ids.*.distinct' => 'Satu konten tidak boleh menempati lebih dari satu slot hero.',
            'news_ids.*.exists' => 'Salah satu konten hero sudah tidak tersedia.',
            'expected_news_ids.present' => 'Versi awal susunan hero tidak tersedia. Muat ulang halaman lalu coba kembali.',
            'expected_news_ids.array' => 'Versi awal susunan hero tidak valid.',
            'expected_news_ids.max' => 'Versi awal susunan hero tidak valid.',
            'expected_news_ids.*.integer' => 'Versi awal susunan hero tidak valid.',
            'expected_news_ids.*.distinct' => 'Versi awal susunan hero tidak valid.',
        ];
    }
}
