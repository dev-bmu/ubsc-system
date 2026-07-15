<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\File;

class UpdateGalleryItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('manage-facility-gallery') ?? false;
    }

    public function rules(): array
    {
        return [
            'lock_version' => ['required', 'integer', 'min:1'],
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
            'sections.*' => ['string', Rule::exists('gallery_sections', 'key')],
            'captured_at' => ['nullable', 'date', 'before_or_equal:today'],
            'credit' => ['required', 'string', 'max:255'],
            'focal_x' => ['required', 'numeric', 'between:0,1'],
            'focal_y' => ['required', 'numeric', 'between:0,1'],
            'poster_second' => ['nullable', 'numeric', 'between:0,90'],
            'poster' => [
                'nullable',
                File::types(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'])->max('20mb'),
            ],
            'subtitle' => ['nullable', File::types(['vtt', 'txt'])->max('1mb')],
            'rights_confirmed' => ['required', 'boolean'],
        ];
    }
}
