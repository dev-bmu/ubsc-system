<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Gallery\GalleryUploadBatch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class GalleryBatchController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $this->authorize('manage-facility-gallery');
        $data = $request->validate([
            'file_count' => ['required', 'integer', 'min:1', 'max:20'],
            'common_metadata' => ['nullable', 'array'],
        ]);

        $batch = GalleryUploadBatch::create([
            'user_id' => $request->user()->id,
            'status' => 'active',
            'file_count' => $data['file_count'],
            'common_metadata' => $data['common_metadata'] ?? null,
            'expires_at' => now()->addHours(
                (int) config('facility-gallery.upload_session_hours', 24),
            ),
        ]);

        return response()->json([
            'uuid' => $batch->uuid,
            'status' => $batch->status,
            'expires_at' => $batch->expires_at?->toIso8601String(),
        ], 201);
    }

    public function finalize(Request $request, GalleryUploadBatch $galleryUploadBatch): JsonResponse
    {
        $this->authorize('manage-facility-gallery');

        if ($galleryUploadBatch->user_id !== $request->user()->id) {
            throw ValidationException::withMessages([
                'batch' => 'Batch upload ini dimiliki pengguna lain.',
            ]);
        }

        $itemCount = $galleryUploadBatch->items()->count();
        $failedCount = $galleryUploadBatch->items()->where('status', 'failed')->count();
        $terminalCount = $galleryUploadBatch->items()
            ->whereNotIn('status', ['processing'])
            ->count();
        $galleryUploadBatch->forceFill([
            'file_count' => $itemCount,
            'completed_count' => max(0, $terminalCount - $failedCount),
            'failed_count' => $failedCount,
            'status' => match (true) {
                $itemCount === 0 => 'cancelled',
                $terminalCount < $itemCount => 'processing',
                $failedCount > 0 => 'completed_with_errors',
                default => 'completed',
            },
        ])->save();

        return response()->json([
            'uuid' => $galleryUploadBatch->uuid,
            'status' => $galleryUploadBatch->status,
            'file_count' => $galleryUploadBatch->file_count,
        ]);
    }
}
