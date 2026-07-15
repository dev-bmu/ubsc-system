<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Jobs\PurgeGalleryMedia;
use App\Models\Gallery\GalleryItem;
use App\Models\Gallery\GalleryOperationRequest;
use App\Services\Gallery\GalleryAuditService;
use App\Services\Gallery\GalleryCacheService;
use App\Services\Gallery\GalleryFeaturedAutofillService;
use App\Services\Gallery\GalleryPlacementService;
use App\Services\Gallery\GalleryPublicationService;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Throwable;

class GalleryBulkController extends Controller
{
    public function store(
        Request $request,
        GalleryPublicationService $publication,
        GalleryPlacementService $placements,
        GalleryAuditService $audit,
        GalleryFeaturedAutofillService $autofill,
        GalleryCacheService $cache,
    ): JsonResponse {
        $data = $request->validate([
            'idempotency_key' => ['required', 'uuid'],
            'operation' => ['required', Rule::in([
                'submit', 'publish', 'schedule', 'unpublish', 'review', 'draft', 'assign', 'delete',
            ])],
            'uuids' => ['required', 'array', 'min:1', 'max:100'],
            'uuids.*' => ['required', 'uuid', 'distinct'],
            'sections' => ['required_if:operation,assign', 'array', 'min:1', 'max:3'],
            'sections.*' => ['string', 'distinct', 'exists:gallery_sections,key'],
            'publish_at' => ['required_if:operation,schedule', 'date_format:Y-m-d\TH:i'],
            'confirmation' => ['required_if:operation,delete', 'string', 'max:40'],
        ]);
        $this->authorizeOperation($data['operation']);
        $uuids = collect($data['uuids'])->unique()->values();

        if ($data['operation'] === 'delete'
            && ($data['confirmation'] ?? '') !== "HAPUS {$uuids->count()} ITEM") {
            throw ValidationException::withMessages([
                'confirmation' => "Ketik HAPUS {$uuids->count()} ITEM untuk mengonfirmasi penghapusan permanen.",
            ]);
        }

        $fingerprintData = Arr::only($data, ['operation', 'uuids', 'sections', 'publish_at', 'confirmation']);
        $fingerprintData['uuids'] = $uuids->sort()->values()->all();
        if (isset($fingerprintData['sections'])) {
            sort($fingerprintData['sections']);
        }
        $requestHash = hash('sha256', json_encode($fingerprintData, JSON_THROW_ON_ERROR));
        $operationRequest = GalleryOperationRequest::query()
            ->where('user_id', $request->user()->id)
            ->where('idempotency_key', $data['idempotency_key'])
            ->first();

        if ($operationRequest) {
            if (! hash_equals($operationRequest->request_hash, $requestHash)) {
                return response()->json([
                    'message' => 'Idempotency key telah dipakai untuk permintaan berbeda.',
                ], 409);
            }

            if ($operationRequest->status === 'completed') {
                return response()->json($operationRequest->response ?? [])
                    ->header('Idempotent-Replay', 'true');
            }

            if ($operationRequest->updated_at->isAfter(now()->subMinutes(5))) {
                return response()->json([
                    'message' => 'Operasi dengan idempotency key ini masih diproses.',
                ], 409);
            }

            $operationRequest->touch();
        } else {
            try {
                $operationRequest = GalleryOperationRequest::create([
                    'user_id' => $request->user()->id,
                    'idempotency_key' => $data['idempotency_key'],
                    'operation' => $data['operation'],
                    'request_hash' => $requestHash,
                    'status' => 'processing',
                    'expires_at' => now()->addDay(),
                ]);
            } catch (QueryException $exception) {
                $operationRequest = GalleryOperationRequest::query()
                    ->where('user_id', $request->user()->id)
                    ->where('idempotency_key', $data['idempotency_key'])
                    ->first();

                if (! $operationRequest) {
                    throw $exception;
                }

                return response()->json([
                    'message' => 'Operasi identik sedang diproses. Coba kembali sesaat lagi.',
                ], 409);
            }
        }

        $items = GalleryItem::query()
            ->with(['sections', 'translations', 'location', 'media'])
            ->whereIn('uuid', $uuids)
            ->get()
            ->keyBy('uuid');
        $results = [];

        foreach ($uuids as $uuid) {
            $item = $items->get($uuid);

            if (! $item) {
                $results[] = ['uuid' => $uuid, 'ok' => false, 'message' => 'Item tidak ditemukan.'];

                continue;
            }

            try {
                $this->applyOperation(
                    $data,
                    $item,
                    $request,
                    $publication,
                    $placements,
                    $audit,
                    $autofill,
                );
                $results[] = ['uuid' => $uuid, 'ok' => true, 'message' => 'Selesai'];
            } catch (Throwable $exception) {
                report($exception);
                $results[] = [
                    'uuid' => $uuid,
                    'ok' => false,
                    'message' => $exception instanceof ValidationException
                        ? collect($exception->errors())->flatten()->first()
                        : $exception->getMessage(),
                ];
            }
        }

        $cache->invalidate();
        $response = [
            'operation' => $data['operation'],
            'succeeded' => collect($results)->where('ok', true)->count(),
            'failed' => collect($results)->where('ok', false)->count(),
            'results' => $results,
        ];
        $operationRequest->forceFill([
            'status' => 'completed',
            'response' => $response,
        ])->save();

        return response()->json($response);
    }

    private function authorizeOperation(string $operation): void
    {
        $permission = match ($operation) {
            'publish', 'schedule', 'unpublish' => 'publish-facility-gallery',
            'delete' => 'delete-facility-gallery',
            default => 'manage-facility-gallery',
        };

        $this->authorize($permission);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function applyOperation(
        array $data,
        GalleryItem $item,
        Request $request,
        GalleryPublicationService $publication,
        GalleryPlacementService $placements,
        GalleryAuditService $audit,
        GalleryFeaturedAutofillService $autofill,
    ): void {
        $actor = $request->user();

        match ($data['operation']) {
            'submit' => $publication->submitForReview($item, $actor),
            'publish' => $publication->publish($item, $actor),
            'schedule' => $publication->schedule($item, $data['publish_at'], $actor),
            'unpublish' => $publication->unpublish($item, $actor),
            'review' => $publication->returnToReview($item, $actor),
            'draft' => $publication->moveToDraft($item, $actor),
            'assign' => $placements->sync(
                $item,
                $item->sections->pluck('key')->merge($data['sections'])->unique()->values()->all(),
                $actor,
            ),
            'delete' => $this->delete($item, $actor, $audit, $autofill),
        };
    }

    private function delete(
        GalleryItem $item,
        $actor,
        GalleryAuditService $audit,
        GalleryFeaturedAutofillService $autofill,
    ): void {
        $sectionIds = $item->sections->pluck('id');
        $uuid = $item->uuid;
        $snapshot = [
            ...$item->only(['uuid', 'media_type', 'status', 'source_sha256']),
            'title' => $item->translation('id')?->title,
        ];

        DB::transaction(function () use ($item, $actor, $audit, $snapshot) {
            $audit->record($item, 'hard_deleted', $snapshot, null, $actor);
            $item->delete();
        });

        PurgeGalleryMedia::dispatch($uuid);
        $autofill->refillMany($sectionIds, $actor);
    }
}
