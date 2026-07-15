<?php

namespace App\Services\Gallery;

use App\Models\Gallery\GalleryItem;

class GalleryReadinessService
{
    /**
     * @return array<string, string>
     */
    public function errors(GalleryItem $item): array
    {
        $item->loadMissing(['translations', 'sections', 'location', 'media']);
        $translation = $item->translation('id');
        $errors = [];

        if (! $translation || trim($translation->title) === '') {
            $errors['title'] = 'Judul bahasa Indonesia wajib diisi.';
        }

        if (! $translation || trim($translation->arena_type) === '') {
            $errors['arena_type'] = 'Jenis arena wajib diisi.';
        }

        if (! $translation || trim($translation->alt_text) === '') {
            $errors['alt_text'] = 'Alt text wajib ditinjau dan diisi.';
        }

        if (! $item->location || ! $item->location->is_active) {
            $errors['location_id'] = 'Lokasi aktif wajib dipilih.';
        }

        if ($item->sections->isEmpty()) {
            $errors['sections'] = 'Pilih minimal satu section.';
        }

        if (! $item->rights_confirmed_at || ! $item->rights_confirmed_by) {
            $errors['rights_confirmed'] = 'Hak penggunaan media wajib dikonfirmasi.';
        }

        if (! $item->getFirstMedia('source')) {
            $errors['media'] = 'File sumber belum tersedia.';
        }

        if (! $item->isProcessed()) {
            $errors['processing'] = 'Media belum selesai diproses.';
        }

        return $errors;
    }

    public function isReady(GalleryItem $item): bool
    {
        return $this->errors($item) === [];
    }
}
