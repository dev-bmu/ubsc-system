<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Gallery\GalleryItem;
use App\Services\Gallery\GalleryPublicationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class GalleryStatusController extends Controller
{
    public function submit(
        Request $request,
        GalleryItem $galleryItem,
        GalleryPublicationService $publication,
    ): RedirectResponse {
        $this->authorize('manage-facility-gallery');
        $publication->submitForReview($galleryItem, $request->user());

        return back()->with('success', 'Media dikirim untuk review.');
    }

    public function publish(
        Request $request,
        GalleryItem $galleryItem,
        GalleryPublicationService $publication,
    ): RedirectResponse {
        $this->authorize('publish-facility-gallery');
        $publication->publish($galleryItem, $request->user());

        return back()->with('success', 'Media berhasil diterbitkan.');
    }

    public function schedule(
        Request $request,
        GalleryItem $galleryItem,
        GalleryPublicationService $publication,
    ): RedirectResponse {
        $this->authorize('publish-facility-gallery');
        $data = $request->validate([
            'publish_at' => ['required', 'date_format:Y-m-d\TH:i'],
        ]);
        $publication->schedule($galleryItem, $data['publish_at'], $request->user());

        return back()->with('success', 'Jadwal publikasi disimpan.');
    }

    public function unpublish(
        Request $request,
        GalleryItem $galleryItem,
        GalleryPublicationService $publication,
    ): RedirectResponse {
        $this->authorize('publish-facility-gallery');
        $publication->unpublish($galleryItem, $request->user());

        return back()->with('success', 'Media disembunyikan dari publik.');
    }

    public function draft(
        Request $request,
        GalleryItem $galleryItem,
        GalleryPublicationService $publication,
    ): RedirectResponse {
        $this->authorize('manage-facility-gallery');
        $publication->moveToDraft($galleryItem, $request->user());

        return back()->with('success', 'Media dikembalikan ke draft.');
    }

    public function review(
        Request $request,
        GalleryItem $galleryItem,
        GalleryPublicationService $publication,
    ): RedirectResponse {
        $this->authorize('manage-facility-gallery');
        $publication->returnToReview($galleryItem, $request->user());

        return back()->with('success', 'Media dikembalikan ke antrean review.');
    }
}
