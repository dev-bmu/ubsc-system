<?php

namespace App\Services\Invoices;

use App\Exceptions\InvoicePdfGenerationException;
use App\Models\InvoicePdfArtifact;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\StreamedResponse;

class InvoicePdfResponseFactory
{
    public function make(
        InvoicePdfArtifact $artifact,
        string $filename,
        bool $download,
    ): StreamedResponse {
        $stream = Storage::disk($artifact->disk)->readStream($artifact->path);

        if (! is_resource($stream)) {
            throw new InvoicePdfGenerationException(
                'Invoice artifact could not be opened.',
                'artifact_read_failed',
            );
        }

        $disposition = HeaderUtils::makeDisposition(
            $download ? HeaderUtils::DISPOSITION_ATTACHMENT : HeaderUtils::DISPOSITION_INLINE,
            $filename,
            Str::ascii($filename),
        );

        return response()->stream(
            static function () use ($stream): void {
                try {
                    while (! feof($stream)) {
                        $chunk = fread($stream, 65_536);

                        if ($chunk === false) {
                            break;
                        }

                        echo $chunk;
                    }
                } finally {
                    fclose($stream);
                }
            },
            200,
            [
                'Content-Type' => 'application/pdf',
                'Content-Length' => (string) $artifact->size_bytes,
                'Content-Disposition' => $disposition,
                'Cache-Control' => 'private, no-store, max-age=0, must-revalidate',
                'Pragma' => 'no-cache',
                'Expires' => '0',
                'X-Content-Type-Options' => 'nosniff',
            ],
        );
    }
}
