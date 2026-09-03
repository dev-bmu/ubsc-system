<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreReviewRequest;
use App\Services\ReviewWorkflowService;
use App\Support\PublicReviewFeed;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

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

    public function store(
        StoreReviewRequest $request,
        ReviewWorkflowService $workflow,
    ): RedirectResponse {
        $workflow->submit($request->user(), $request->validated());

        return back()->with(
            'success',
            'Ulasan tersimpan dan masuk antrean validasi. Anda tetap dapat melihat statusnya di halaman ini.',
        );
    }
}
