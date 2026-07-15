<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreGalleryUploadSessionRequest;
use App\Models\Gallery\GalleryUploadBatch;
use App\Models\Gallery\GalleryUploadSession;
use App\Services\Gallery\GalleryIngestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Throwable;

class GalleryUploadSessionController extends Controller
{
    public function store(
        StoreGalleryUploadSessionRequest $request,
        GalleryIngestService $ingest,
    ): JsonResponse {
        $data = $request->validated();
        $extension = strtolower(pathinfo($data['file_name'], PATHINFO_EXTENSION));
        $mediaType = $ingest->mediaTypeFrom((string) ($data['file_mime'] ?? ''), $extension);
        $ingest->assertSize((int) $data['file_size'], $mediaType);
        $batch = ! empty($data['batch_uuid'])
            ? GalleryUploadBatch::query()->where('uuid', $data['batch_uuid'])->firstOrFail()
            : null;

        if ($batch && (
            $batch->user_id !== $request->user()->id
            || $batch->status !== 'active'
            || $batch->expires_at?->isPast()
        )) {
            throw ValidationException::withMessages([
                'batch_uuid' => 'Sesi album tidak tersedia atau telah kedaluwarsa.',
            ]);
        }

        $fingerprint = hash('sha256', implode('|', [
            $data['client_fingerprint'],
            $data['file_name'],
            $data['file_size'],
            $data['last_modified'] ?? 0,
        ]));
        $metadata = Arr::except($data, [
            'file_name', 'file_size', 'file_mime', 'last_modified',
            'client_fingerprint', 'batch_uuid',
        ]);
        $session = GalleryUploadSession::query()
            ->where('user_id', $request->user()->id)
            ->where('client_fingerprint', $fingerprint)
            ->where('expires_at', '>', now())
            ->whereIn('status', ['active', 'failed', 'completed'])
            ->latest('id')
            ->first();

        if ($session?->status === 'completed' && $session->gallery_item_id) {
            return response()->json([
                'uuid' => $session->uuid,
                'status' => 'completed',
                'item_uuid' => $session->item?->uuid,
                'chunk_size' => $session->chunk_size,
                'total_chunks' => $session->total_chunks,
                'received_chunks' => range(0, max(0, $session->total_chunks - 1)),
            ]);
        }

        $chunkSize = $this->safeChunkSize();
        $totalChunks = (int) ceil(((int) $data['file_size']) / $chunkSize);

        if ($session) {
            $session->forceFill([
                'upload_batch_id' => $batch?->id,
                'metadata' => $metadata,
                'status' => 'active',
                'error_detail' => null,
                'expires_at' => now()->addHours((int) config('facility-gallery.upload_session_hours', 24)),
            ])->save();
        } else {
            $session = GalleryUploadSession::create([
                'user_id' => $request->user()->id,
                'upload_batch_id' => $batch?->id,
                'client_fingerprint' => $fingerprint,
                'original_name' => $data['file_name'],
                'source_mime' => $data['file_mime'] ?? null,
                'total_bytes' => $data['file_size'],
                'chunk_size' => $chunkSize,
                'total_chunks' => $totalChunks,
                'received_chunks' => [],
                'metadata' => $metadata,
                'status' => 'active',
                'expires_at' => now()->addHours((int) config('facility-gallery.upload_session_hours', 24)),
            ]);
        }

        return response()->json($this->sessionPayload($session), $session->wasRecentlyCreated ? 201 : 200);
    }

    public function chunk(
        Request $request,
        GalleryUploadSession $galleryUploadSession,
        int $index,
    ): JsonResponse {
        $this->authorizeSession($request, $galleryUploadSession);
        $maxKilobytes = (int) ceil(($galleryUploadSession->chunk_size + 1024) / 1024);
        $data = $request->validate([
            'chunk' => ['required', 'file', "max:{$maxKilobytes}"],
        ]);

        if ($galleryUploadSession->expires_at->isPast()
            || ! in_array($galleryUploadSession->status, ['active', 'failed'], true)) {
            throw ValidationException::withMessages(['chunk' => 'Sesi upload tidak lagi aktif.']);
        }
        if ($index < 0 || $index >= $galleryUploadSession->total_chunks) {
            throw ValidationException::withMessages(['chunk' => 'Nomor chunk berada di luar rentang.']);
        }

        /** @var UploadedFile $chunk */
        $chunk = $data['chunk'];
        $expectedBytes = $index === $galleryUploadSession->total_chunks - 1
            ? $galleryUploadSession->total_bytes - ($galleryUploadSession->chunk_size * $index)
            : $galleryUploadSession->chunk_size;

        if ($chunk->getSize() !== $expectedBytes) {
            throw ValidationException::withMessages([
                'chunk' => "Ukuran chunk tidak sesuai. Diharapkan {$expectedBytes} byte.",
            ]);
        }

        $hash = hash_file('sha256', $chunk->getRealPath());
        $disk = Storage::disk(config('facility-gallery.staging_disk', 'local'));
        $directory = $this->sessionDirectory($galleryUploadSession).'/chunks';
        $disk->putFileAs($directory, $chunk, "{$index}.part");

        DB::transaction(function () use ($galleryUploadSession, $index, $hash) {
            $locked = GalleryUploadSession::query()->lockForUpdate()->findOrFail($galleryUploadSession->id);
            $received = $locked->received_chunks ?? [];
            $received[(string) $index] = $hash;
            ksort($received, SORT_NUMERIC);
            $locked->forceFill([
                'received_chunks' => $received,
                'status' => 'active',
                'error_detail' => null,
                'expires_at' => now()->addHours((int) config('facility-gallery.upload_session_hours', 24)),
            ])->save();
        });

        $galleryUploadSession->refresh();

        return response()->json($this->sessionPayload($galleryUploadSession));
    }

    public function complete(
        Request $request,
        GalleryUploadSession $galleryUploadSession,
        GalleryIngestService $ingest,
    ): JsonResponse {
        $this->authorizeSession($request, $galleryUploadSession);

        $session = DB::transaction(function () use ($galleryUploadSession) {
            $locked = GalleryUploadSession::query()->lockForUpdate()->findOrFail($galleryUploadSession->id);

            if ($locked->status === 'completed') {
                return $locked;
            }
            if ($locked->status === 'assembling' && $locked->updated_at->isAfter(now()->subMinutes(10))) {
                throw ValidationException::withMessages(['upload' => 'File sedang dirakit oleh proses lain.']);
            }

            $received = array_map('intval', array_keys($locked->received_chunks ?? []));
            $missing = array_values(array_diff(range(0, $locked->total_chunks - 1), $received));
            if ($missing !== []) {
                throw ValidationException::withMessages([
                    'upload' => 'Upload belum lengkap. Chunk yang belum ada: '.implode(', ', array_slice($missing, 0, 10)).'.',
                ]);
            }

            $locked->forceFill(['status' => 'assembling', 'error_detail' => null])->save();

            return $locked;
        });

        if ($session->status === 'completed') {
            return response()->json([
                ...$this->sessionPayload($session),
                'item_uuid' => $session->item?->uuid,
            ]);
        }

        $temporaryPath = null;

        try {
            $temporaryPath = tempnam(sys_get_temp_dir(), 'ubsc-gallery-');
            if ($temporaryPath === false) {
                throw new \RuntimeException('File sementara tidak dapat dibuat.');
            }

            [$bytes, $hash] = $this->assemble($session, $temporaryPath);
            if ($bytes !== $session->total_bytes) {
                throw new \RuntimeException('Ukuran file rakitan tidak sama dengan file sumber.');
            }

            $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($temporaryPath)
                ?: $session->source_mime
                ?: 'application/octet-stream';
            $file = new UploadedFile(
                $temporaryPath,
                $session->original_name,
                $mime,
                UPLOAD_ERR_OK,
                true,
            );
            $result = $ingest->ingest(
                $file,
                $session->metadata,
                $request->user(),
                $session->batch,
                null,
                null,
                $hash,
                $mime,
            );
            $session->forceFill([
                'gallery_item_id' => $result['item']->id,
                'status' => 'completed',
                'source_sha256' => $hash,
                'received_chunks' => null,
                'staged_path' => null,
                'error_detail' => null,
            ])->save();
            Storage::disk(config('facility-gallery.staging_disk', 'local'))
                ->deleteDirectory($this->sessionDirectory($session));

            return response()->json([
                ...$this->sessionPayload($session),
                'item_uuid' => $result['item']->uuid,
                'duplicate_of' => $result['duplicate']?->uuid,
            ]);
        } catch (Throwable $exception) {
            $session->forceFill([
                'status' => 'failed',
                'error_detail' => mb_substr($exception->getMessage(), 0, 2000),
            ])->save();
            throw $exception;
        } finally {
            if (is_string($temporaryPath) && file_exists($temporaryPath)) {
                @unlink($temporaryPath);
            }
        }
    }

    public function destroy(Request $request, GalleryUploadSession $galleryUploadSession): JsonResponse
    {
        $this->authorizeSession($request, $galleryUploadSession);

        if ($galleryUploadSession->status !== 'completed') {
            $galleryUploadSession->forceFill([
                'status' => 'cancelled',
                'received_chunks' => null,
                'error_detail' => null,
            ])->save();
            Storage::disk(config('facility-gallery.staging_disk', 'local'))
                ->deleteDirectory($this->sessionDirectory($galleryUploadSession));
        }

        return response()->json(['status' => $galleryUploadSession->status]);
    }

    /**
     * @return array{0: int, 1: string}
     */
    private function assemble(GalleryUploadSession $session, string $target): array
    {
        $disk = Storage::disk(config('facility-gallery.staging_disk', 'local'));
        $output = fopen($target, 'wb');
        $hash = hash_init('sha256');
        $bytes = 0;
        $expectedHashes = $session->received_chunks ?? [];

        if (! $output) {
            throw new \RuntimeException('File sementara tidak dapat dibuat.');
        }

        try {
            foreach (range(0, $session->total_chunks - 1) as $index) {
                $path = $this->sessionDirectory($session)."/chunks/{$index}.part";
                $input = $disk->readStream($path);
                if (! is_resource($input)) {
                    throw new \RuntimeException("Chunk {$index} tidak dapat dibaca.");
                }
                $chunkHash = hash_init('sha256');

                try {
                    while (! feof($input)) {
                        $buffer = fread($input, 1024 * 1024);
                        if ($buffer === false) {
                            throw new \RuntimeException("Chunk {$index} rusak.");
                        }
                        if ($buffer === '') {
                            continue;
                        }
                        $written = fwrite($output, $buffer);
                        if ($written !== strlen($buffer)) {
                            throw new \RuntimeException('Penyimpanan sementara penuh.');
                        }
                        hash_update($hash, $buffer);
                        hash_update($chunkHash, $buffer);
                        $bytes += $written;
                    }
                } finally {
                    fclose($input);
                }

                $actualChunkHash = hash_final($chunkHash);
                $expectedChunkHash = $expectedHashes[(string) $index] ?? null;
                if (! is_string($expectedChunkHash) || ! hash_equals($expectedChunkHash, $actualChunkHash)) {
                    throw new \RuntimeException("Integritas chunk {$index} tidak valid. Silakan unggah ulang file.");
                }
            }
        } finally {
            fclose($output);
        }

        return [$bytes, hash_final($hash)];
    }

    private function authorizeSession(Request $request, GalleryUploadSession $session): void
    {
        $this->authorize('manage-facility-gallery');
        abort_unless($session->user_id === $request->user()->id, 404);
    }

    /**
     * @return array<string, mixed>
     */
    private function sessionPayload(GalleryUploadSession $session): array
    {
        return [
            'uuid' => $session->uuid,
            'status' => $session->status,
            'chunk_size' => $session->chunk_size,
            'total_chunks' => $session->total_chunks,
            'received_chunks' => collect(array_keys($session->received_chunks ?? []))
                ->map(fn ($index) => (int) $index)
                ->sort()
                ->values(),
            'expires_at' => $session->expires_at?->toIso8601String(),
        ];
    }

    private function sessionDirectory(GalleryUploadSession $session): string
    {
        return "facility-gallery-staging/{$session->uuid}";
    }

    private function safeChunkSize(): int
    {
        $configured = max(256 * 1024, (int) config('facility-gallery.upload_chunk_bytes', 5 * 1024 * 1024));
        $phpLimits = array_values(array_filter([
            $this->iniBytes((string) ini_get('upload_max_filesize')),
            $this->iniBytes((string) ini_get('post_max_size')),
        ], fn (int $limit) => $limit > 0));

        if ($phpLimits === []) {
            return $configured;
        }

        $phpLimit = min($phpLimits);
        $headroom = max(64 * 1024, min(256 * 1024, (int) floor($phpLimit * 0.05)));

        return max(64 * 1024, min($configured, $phpLimit - $headroom));
    }

    private function iniBytes(string $value): int
    {
        $value = trim($value);
        $number = (float) $value;

        return match (strtolower(substr($value, -1))) {
            'g' => (int) ($number * 1024 * 1024 * 1024),
            'm' => (int) ($number * 1024 * 1024),
            'k' => (int) ($number * 1024),
            default => (int) $number,
        };
    }
}
