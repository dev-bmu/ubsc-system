<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreGalleryUploadSessionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('manage-facility-gallery') ?? false;
    }

    public function rules(): array
    {
        return [
            'file_name' => ['required', 'string', 'max:255', 'regex:/\.(jpe?g|png|webp|heic|heif|mp4|mov)$/i'],
            'file_size' => ['required', 'integer', 'min:1', 'max:262144000'],
            'file_mime' => ['nullable', 'string', 'max:100'],
            'last_modified' => ['nullable', 'integer', 'min:0'],
            'client_fingerprint' => ['required', 'string', 'max:500'],
            'batch_uuid' => ['nullable', 'uuid', 'exists:gallery_upload_batches,uuid'],
            'title' => ['required', 'string', 'max:255'],
            'arena_type' => ['required', 'string', 'max:160'],
            'alt_text' => ['required', 'string', 'max:500'],
            'caption' => ['nullable', 'string', 'max:5000'],
            'title_en' => ['nullable', 'required_with:arena_type_en,alt_text_en,caption_en', 'string', 'max:255'],
            'arena_type_en' => ['nullable', 'required_with:title_en,alt_text_en,caption_en', 'string', 'max:160'],
            'alt_text_en' => ['nullable', 'required_with:title_en,arena_type_en,caption_en', 'string', 'max:500'],
            'caption_en' => ['nullable', 'string', 'max:5000'],
            'search_aliases' => ['nullable', 'array', 'max:20'],
            'search_aliases.*' => ['string', 'max:80'],
            'location_id' => [
                'required',
                Rule::exists('gallery_locations', 'id')->where('is_active', true),
            ],
            'sections' => ['required', 'array', 'min:1', 'max:3'],
            'sections.*' => ['string', 'distinct', Rule::exists('gallery_sections', 'key')],
            'captured_at' => ['nullable', 'date', 'before_or_equal:today'],
            'credit' => ['nullable', 'string', 'max:255'],
            'focal_x' => ['nullable', 'numeric', 'between:0,1'],
            'focal_y' => ['nullable', 'numeric', 'between:0,1'],
            'poster_second' => ['nullable', 'numeric', 'between:0,90'],
            'rights_confirmed' => ['required', 'accepted'],
            'allow_duplicate' => ['nullable', 'boolean'],
        ];
    }
}
