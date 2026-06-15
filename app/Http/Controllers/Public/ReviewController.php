<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Review;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ReviewController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'rating' => ['required', 'numeric', 'min:0.5', 'max:5'],
            'text'   => ['required', 'string', 'min:10', 'max:1000'],
        ]);

        $hasCompleted = Booking::where('user_id', Auth::id())
            ->where('status', 'completed')
            ->exists();

        abort_unless(
            $hasCompleted,
            403,
            'Anda harus memiliki setidaknya satu riwayat pemesanan yang selesai untuk memberikan ulasan.'
        );

        Review::updateOrCreate(
            ['user_id' => Auth::id()],
            [
                'reviewer_name' => null,  // always resolved from user relationship
                'rating'        => $data['rating'],
                'text'          => $data['text'],
                'is_approved'   => false, // always reset to pending on every save
            ]
        );

        return back()->with('success', 'Ulasan berhasil disimpan. Menunggu persetujuan admin.');
    }
}
