<?php

namespace App\Services\Gallery;

use App\Exceptions\GalleryCapabilityException;
use App\Models\Gallery\GalleryItem;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Symfony\Component\Process\Process;

class GalleryVideoProcessor
{
    public function __construct(private readonly GalleryImageProcessor $images) {}

    public function process(GalleryItem $item, Media $source): array
    {
        $ffmpeg = (string) config('facility-gallery.video.ffmpeg_path', 'ffmpeg');
        $ffprobe = (string) config('facility-gallery.video.ffprobe_path', 'ffprobe');
        $this->assertBinary($ffmpeg, 'ffmpeg_unavailable');
        $this->assertBinary($ffprobe, 'ffprobe_unavailable');

        $temporaryDirectory = storage_path("app/gallery-processing/{$item->uuid}");
        File::deleteDirectory($temporaryDirectory);
        File::ensureDirectoryExists($temporaryDirectory);
        $inputPath = "{$temporaryDirectory}/source.{$source->extension}";
        $this->copyMediaToPath($source, $inputPath);

        try {
            $metadata = $this->probe($ffprobe, $inputPath);
            $this->validateMetadata($metadata);
            $renditions = $this->renditionSizes($metadata['width'], $metadata['height']);
            $outputDirectory = "{$temporaryDirectory}/output";
            File::ensureDirectoryExists($outputDirectory);
            $generated = [];

            foreach ($renditions as $rendition) {
                $variantDirectory = "{$outputDirectory}/{$rendition['height']}p";
                File::ensureDirectoryExists($variantDirectory);
                $playlist = "{$variantDirectory}/index.m3u8";
                $segmentPattern = "{$variantDirectory}/segment_%04d.ts";
                $bitrate = $this->bitrateForHeight($rendition['height']);

                $this->run([
                    $ffmpeg,
                    '-y',
                    '-i', $inputPath,
                    '-map', '0:v:0',
                    '-map', '0:a:0?',
                    '-vf', "scale={$rendition['width']}:{$rendition['height']}:flags=lanczos",
                    '-c:v', 'libx264',
                    '-preset', 'medium',
                    '-profile:v', 'main',
                    '-pix_fmt', 'yuv420p',
                    '-b:v', $bitrate['video'],
                    '-maxrate', $bitrate['max'],
                    '-bufsize', $bitrate['buffer'],
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-ac', '2',
                    '-hls_time', '4',
                    '-hls_playlist_type', 'vod',
                    '-hls_flags', 'independent_segments',
                    '-hls_segment_filename', $segmentPattern,
                    $playlist,
                ]);

                $generated[] = [
                    ...$rendition,
                    'bandwidth' => $bitrate['bandwidth'],
                    'directory' => "{$rendition['height']}p",
                ];
            }

            $fallback = collect($generated)
                ->filter(fn (array $variant) => $variant['height'] <= 720)
                ->last() ?? end($generated);
            $fallbackPath = "{$outputDirectory}/fallback.mp4";

            $this->run([
                $ffmpeg,
                '-y',
                '-i', $inputPath,
                '-map', '0:v:0',
                '-map', '0:a:0?',
                '-vf', "scale={$fallback['width']}:{$fallback['height']}:flags=lanczos",
                '-c:v', 'libx264',
                '-preset', 'medium',
                '-crf', '22',
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-movflags', '+faststart',
                $fallbackPath,
            ]);

            $masterPath = "{$outputDirectory}/master.m3u8";
            file_put_contents($masterPath, $this->masterPlaylist($generated));

            $posterPath = "{$temporaryDirectory}/poster.jpg";
            $posterSecond = min(
                max((float) ($item->poster_second ?? 1), 0),
                max(0, ($metadata['duration_ms'] / 1000) - 0.1),
            );
            $this->run([
                $ffmpeg,
                '-y',
                '-ss', number_format($posterSecond, 3, '.', ''),
                '-i', $inputPath,
                '-frames:v', '1',
                '-vf', 'scale=min(1600\,iw):-2',
                '-q:v', '2',
                $posterPath,
            ]);

            $manualPoster = $item->getFirstMedia('poster-source');
            $poster = $manualPoster
                ? $this->images->processMedia($manualPoster, $item->uuid, 'poster')
                : $this->images->processPath($posterPath, $item->uuid, 'poster');

            $publicDisk = config('facility-gallery.public_disk', 'public');
            $basePath = trim(config('facility-gallery.public_path', 'facility-gallery'), '/')
                ."/{$item->uuid}/video";
            Storage::disk($publicDisk)->deleteDirectory($basePath);
            $this->copyDirectoryToDisk($outputDirectory, $publicDisk, $basePath);

            return [
                'width' => $metadata['width'],
                'height' => $metadata['height'],
                'duration_ms' => $metadata['duration_ms'],
                'hls' => "{$basePath}/master.m3u8",
                'fallback' => "{$basePath}/fallback.mp4",
                'renditions' => collect($generated)->map(fn (array $variant) => [
                    'width' => $variant['width'],
                    'height' => $variant['height'],
                    'playlist' => "{$basePath}/{$variant['directory']}/index.m3u8",
                ])->values()->all(),
                'poster' => $poster,
            ];
        } finally {
            File::deleteDirectory($temporaryDirectory);
        }
    }

    private function assertBinary(string $binary, string $code): void
    {
        try {
            $process = new Process([$binary, '-version']);
            $process->setTimeout(8);
            $process->run();

            if (! $process->isSuccessful()) {
                throw new RuntimeException($process->getErrorOutput());
            }
        } catch (\Throwable) {
            throw new GalleryCapabilityException(
                $code,
                "{$binary} belum tersedia pada server pemrosesan media.",
            );
        }
    }

    private function copyMediaToPath(Media $media, string $targetPath): void
    {
        $source = Storage::disk($media->disk)->readStream($media->getPathRelativeToRoot());
        $target = fopen($targetPath, 'wb');

        if (! is_resource($source) || ! is_resource($target)) {
            throw new RuntimeException('File video sumber tidak dapat dibaca.');
        }

        stream_copy_to_stream($source, $target);
        fclose($source);
        fclose($target);
    }

    private function probe(string $ffprobe, string $inputPath): array
    {
        $process = $this->run([
            $ffprobe,
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height:format=duration',
            '-of', 'json',
            $inputPath,
        ]);
        $decoded = json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);
        $stream = $decoded['streams'][0] ?? null;
        $duration = (float) ($decoded['format']['duration'] ?? 0);

        if (! is_array($stream)) {
            throw new RuntimeException('Video tidak memiliki stream gambar yang valid.');
        }

        return [
            'width' => (int) ($stream['width'] ?? 0),
            'height' => (int) ($stream['height'] ?? 0),
            'duration_ms' => (int) round($duration * 1000),
        ];
    }

    private function validateMetadata(array $metadata): void
    {
        $maxDuration = (int) config('facility-gallery.video.max_duration_seconds', 90) * 1000;
        $maxWidth = (int) config('facility-gallery.video.max_width', 3840);
        $maxHeight = (int) config('facility-gallery.video.max_height', 2160);

        if ($metadata['duration_ms'] <= 0 || $metadata['duration_ms'] > $maxDuration) {
            throw new RuntimeException('Durasi video harus antara 0 dan 90 detik.');
        }

        if ($metadata['width'] <= 0 || $metadata['height'] <= 0) {
            throw new RuntimeException('Dimensi video tidak valid.');
        }

        if ($metadata['width'] > $maxWidth || $metadata['height'] > $maxHeight) {
            throw new RuntimeException('Resolusi video melebihi batas input 4K.');
        }
    }

    /**
     * @return array<int, array{width: int, height: int}>
     */
    private function renditionSizes(int $sourceWidth, int $sourceHeight): array
    {
        $targets = collect(config('facility-gallery.video.renditions', [480, 720, 1080]))
            ->map(fn ($height) => (int) $height)
            ->filter(fn (int $height) => $height <= $sourceHeight)
            ->values();

        if ($targets->isEmpty()) {
            $targets->push($sourceHeight - ($sourceHeight % 2));
        }

        return $targets->map(function (int $height) use ($sourceWidth, $sourceHeight) {
            $width = (int) round($sourceWidth * ($height / $sourceHeight));
            $width -= $width % 2;

            return ['width' => max(2, $width), 'height' => max(2, $height)];
        })->all();
    }

    private function bitrateForHeight(int $height): array
    {
        return match (true) {
            $height >= 1080 => [
                'video' => '5000k',
                'max' => '5350k',
                'buffer' => '7500k',
                'bandwidth' => 5600000,
            ],
            $height >= 720 => [
                'video' => '2800k',
                'max' => '2996k',
                'buffer' => '4200k',
                'bandwidth' => 3300000,
            ],
            default => [
                'video' => '1200k',
                'max' => '1284k',
                'buffer' => '1800k',
                'bandwidth' => 1550000,
            ],
        };
    }

    private function masterPlaylist(array $renditions): string
    {
        $lines = ['#EXTM3U', '#EXT-X-VERSION:3'];

        foreach ($renditions as $variant) {
            $lines[] = "#EXT-X-STREAM-INF:BANDWIDTH={$variant['bandwidth']},RESOLUTION={$variant['width']}x{$variant['height']}";
            $lines[] = "{$variant['directory']}/index.m3u8";
        }

        return implode(PHP_EOL, $lines).PHP_EOL;
    }

    private function copyDirectoryToDisk(string $source, string $disk, string $basePath): void
    {
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($source, \FilesystemIterator::SKIP_DOTS),
        );

        foreach ($iterator as $file) {
            if (! $file->isFile()) {
                continue;
            }

            $relative = str_replace('\\', '/', substr($file->getPathname(), strlen($source) + 1));
            $stream = fopen($file->getPathname(), 'rb');
            Storage::disk($disk)->put("{$basePath}/{$relative}", $stream, [
                'visibility' => 'public',
                'CacheControl' => 'public, max-age=31536000, immutable',
            ]);
            fclose($stream);
        }
    }

    private function run(array $command): Process
    {
        $process = new Process($command);
        $process->setTimeout((int) config('facility-gallery.video.timeout_seconds', 900));
        $process->run();

        if (! $process->isSuccessful()) {
            throw new RuntimeException(trim($process->getErrorOutput()) ?: 'Proses video gagal.');
        }

        return $process;
    }
}
