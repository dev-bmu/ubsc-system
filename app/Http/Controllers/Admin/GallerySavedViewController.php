<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Gallery\GallerySavedView;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class GallerySavedViewController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $this->authorize('view-facility-gallery');
        $data = $request->validate([
            'name' => [
                'required',
                'string',
                'max:80',
                Rule::unique('gallery_saved_views', 'name')
                    ->where('user_id', $request->user()->id),
            ],
            'filters' => ['required', 'array'],
        ]);

        GallerySavedView::create([
            'user_id' => $request->user()->id,
            'name' => $data['name'],
            'filters' => $data['filters'],
        ]);

        return back()->with('success', 'Tampilan filter disimpan.');
    }

    public function destroy(Request $request, GallerySavedView $gallerySavedView): RedirectResponse
    {
        $this->authorize('view-facility-gallery');
        abort_unless($gallerySavedView->user_id === $request->user()->id, 403);
        $gallerySavedView->delete();

        return back()->with('success', 'Tampilan filter dihapus.');
    }
}
