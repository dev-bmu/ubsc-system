<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Review;
use App\Support\PublicReviewFeed;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ReviewController extends Controller
{
    public function index(
        Request $request,
        PublicReviewFeed $reviewFeed,
    ): JsonResponse|Response {
        $payload = $reviewFeed->payload();
        $etag = '"'.hash(
            'sha256',
            json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        ).'"';

        $headers = [
            'Cache-Control' => 'private, no-cache, must-revalidate',
            'ETag' => $etag,
            'Vary' => 'Accept-Encoding',
        ];

        if ($request->header('If-None-Match') === $etag) {
            return response('', 304, $headers);
        }

        return response()->json($payload, 200, $headers);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'rating' => [
                'required',
                'numeric',
                'min:0.5',
                'max:5',
                'multiple_of:0.5',
            ],
            'text' => ['required', 'string', 'min:10', 'max:1000'],
        ]);

        $hasCompleted = Booking::where('user_id', Auth::id())
            ->where('status', 'completed')
            ->exists();

        abort_unless(
            $hasCompleted,
            403,
            'Anda harus memiliki setidaknya satu riwayat pemesanan yang selesai untuk memberikan ulasan.'
        );

        DB::transaction(function () use ($data): void {
            DB::table('users')
                ->where('id', Auth::id())
                ->lockForUpdate()
                ->first();

            Review::updateOrCreate(
                ['user_id' => Auth::id()],
                [
                    'reviewer_name' => null,
                    'rating' => $data['rating'],
                    'text' => $data['text'],
                    'is_approved' => false,
                ],
            );
        });

        return back()->with('success', 'Ulasan berhasil disimpan. Menunggu persetujuan admin.');
    }
}
