<?php

namespace App\Services\Gallery;

use App\Exceptions\GalleryCapabilityException;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class GalleryImageProcessor
{
    public function processMedia(Media $media, string $uuid, string $namespace = 'image'): array
    {
        $extension = strtolower($media->extension ?: 'bin');
        $temporaryPath = $this->temporaryPath($extension);
        $source = Storage::disk($media->disk)->readStream($media->getPathRelativeToRoot());

        if (! is_resource($source)) {
            throw new RuntimeException('File sumber media tidak dapat dibaca.');
        }

        $target = fopen($temporaryPath, 'wb');
        stream_copy_to_stream($source, $target);
        fclose($source);
        fclose($target);

        try {
            return $this->processPath($temporaryPath, $uuid, $namespace);
        } finally {
            @unlink($temporaryPath);
        }
    }

    public function processPath(string $sourcePath, string $uuid, string $namespace = 'image'): array
    {
        $normalizedPath = $this->normalizeHeicIfNeeded($sourcePath);
        $removeNormalized = $normalizedPath !== $sourcePath;

        try {
            [$image, $width, $height, $mime] = $this->loadImage($normalizedPath);
            $this->validateDimensions($width, $height);
            $image = $this->applyOrientation($image, $sourcePath, $mime);
            $width = imagesx($image);
            $height = imagesy($image);

            $disk = config('facility-gallery.public_disk', 'public');
            $basePath = trim(config('facility-gallery.public_path', 'facility-gallery'), '/')
                ."/{$uuid}/{$namespace}";
            Storage::disk($disk)->deleteDirectory($basePath);

            $formats = $this->supportedFormats();
            $derivatives = [];
            $widths = collect(config('facility-gallery.image.widths', []))
                ->map(fn ($value) => (int) $value)
                ->filter(fn (int $targetWidth) => $targetWidth <= $width)
                ->push($width)
                ->unique()
                ->sort()
                ->values();

            foreach ($widths as $targetWidth) {
                $targetHeight = max(1, (int) round($height * ($targetWidth / $width)));
                $resized = imagescale($image, $targetWidth, $targetHeight, IMG_BICUBIC_FIXED);

                if (! $resized) {
                    throw new RuntimeException("Gagal mengubah ukuran gambar menjadi {$targetWidth}px.");
                }

                imagealphablending($resized, true);
                imagesavealpha($resized, true);

                foreach ($formats as $format) {
                    $relativePath = "{$basePath}/{$targetWidth}.{$format}";
                    $this->storeEncoded($resized, $format, $disk, $relativePath);
                    $derivatives[$format][(string) $targetWidth] = [
                        'path' => $relativePath,
                        'width' => $targetWidth,
                        'height' => $targetHeight,
                    ];
                }

                imagedestroy($resized);
            }

            imagedestroy($image);
            $fallbackFormat = isset($derivatives['jpg']) ? 'jpg' : array_key_last($derivatives);
            $fallbackWidth = (string) collect(array_keys($derivatives[$fallbackFormat] ?? []))
                ->map(fn ($value) => (int) $value)
                ->sort()
                ->last();

            return [
                'width' => $width,
                'height' => $height,
                'formats' => $derivatives,
                'fallback' => $derivatives[$fallbackFormat][$fallbackWidth]['path'] ?? null,
                'fallback_format' => $fallbackFormat,
            ];
        } finally {
            if ($removeNormalized) {
                @unlink($normalizedPath);
            }
        }
    }

    /**
     * @return array{0: \GdImage, 1: int, 2: int, 3: string}
     */
    private function loadImage(string $path): array
    {
        $info = @getimagesize($path);

        if (! is_array($info) || empty($info[0]) || empty($info[1])) {
            throw new RuntimeException('File bukan gambar yang dapat didekode.');
        }

        $mime = $info['mime'] ?? mime_content_type($path) ?: '';
        $image = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($path),
            'image/png' => @imagecreatefrompng($path),
            'image/webp' => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($path) : false,
            'image/avif' => function_exists('imagecreatefromavif') ? @imagecreatefromavif($path) : false,
            default => @imagecreatefromstring((string) file_get_contents($path)),
        };

        if (! $image instanceof \GdImage) {
            throw new RuntimeException("Gambar dengan MIME {$mime} tidak dapat diproses.");
        }

        return [$image, (int) $info[0], (int) $info[1], $mime];
    }

    private function validateDimensions(int $width, int $height): void
    {
        $pixels = $width * $height;
        $maxPixels = (int) config('facility-gallery.image.max_pixels', 24_000_000);
        $minLongEdge = (int) config('facility-gallery.image.min_long_edge', 1600);

        if ($pixels > $maxPixels) {
            throw new RuntimeException('Resolusi gambar melebihi batas 24 megapiksel.');
        }

        if (max($width, $height) < $minLongEdge) {
            throw new RuntimeException("Sisi terpanjang gambar minimal {$minLongEdge}px.");
        }
    }

    private function applyOrientation(\GdImage $image, string $sourcePath, string $mime): \GdImage
    {
        if ($mime !== 'image/jpeg' || ! function_exists('exif_read_data')) {
            return $image;
        }

        $exif = @exif_read_data($sourcePath);
        $orientation = (int) ($exif['Orientation'] ?? 1);

        return match ($orientation) {
            2 => $this->flip($image, IMG_FLIP_HORIZONTAL),
            3 => $this->rotate($image, 180),
            4 => $this->flip($image, IMG_FLIP_VERTICAL),
            5 => $this->flip($this->rotate($image, -90), IMG_FLIP_HORIZONTAL),
            6 => $this->rotate($image, -90),
            7 => $this->flip($this->rotate($image, 90), IMG_FLIP_HORIZONTAL),
            8 => $this->rotate($image, 90),
            default => $image,
        };
    }

    private function rotate(\GdImage $image, int $angle): \GdImage
    {
        $rotated = imagerotate($image, $angle, 0);

        if (! $rotated instanceof \GdImage) {
            return $image;
        }

        imagedestroy($image);

        return $rotated;
    }

    private function flip(\GdImage $image, int $mode): \GdImage
    {
        imageflip($image, $mode);

        return $image;
    }

    private function normalizeHeicIfNeeded(string $sourcePath): string
    {
        $mime = mime_content_type($sourcePath) ?: '';
        $extension = strtolower(pathinfo($sourcePath, PATHINFO_EXTENSION));
        $isHeic = in_array($mime, ['image/heic', 'image/heif'], true)
            || in_array($extension, ['heic', 'heif'], true);

        if (! $isHeic) {
            return $sourcePath;
        }

        if (! class_exists(\Imagick::class)) {
            throw new GalleryCapabilityException(
                'heic_decoder_unavailable',
                'Server belum memiliki Imagick/libheif untuk memproses HEIC.',
            );
        }

        $target = $this->temporaryPath('jpg');
        $imagick = new \Imagick($sourcePath);
        $imagick->setIteratorIndex(0);
        $imagick->setImageColorspace(\Imagick::COLORSPACE_SRGB);
        $imagick->setImageFormat('jpeg');
        $imagick->setImageCompressionQuality(92);
        $imagick->stripImage();
        $imagick->writeImage($target);
        $imagick->clear();

        return $target;
    }

    /**
     * @return array<int, string>
     */
    private function supportedFormats(): array
    {
        return collect(config('facility-gallery.image.formats', ['webp', 'jpg']))
            ->filter(fn (string $format) => match ($format) {
                'avif' => function_exists('imageavif'),
                'webp' => function_exists('imagewebp'),
                'jpg' => function_exists('imagejpeg'),
                default => false,
            })
            ->values()
            ->all();
    }

    private function storeEncoded(
        \GdImage $image,
        string $format,
        string $disk,
        string $relativePath,
    ): void {
        $temporaryPath = $this->temporaryPath($format);

        try {
            if ($format === 'jpg') {
                $jpeg = $this->flattenForJpeg($image);

                try {
                    $success = imagejpeg($jpeg, $temporaryPath, 84);
                } finally {
                    imagedestroy($jpeg);
                }
            } else {
                $success = match ($format) {
                    'avif' => imageavif($image, $temporaryPath, 58),
                    'webp' => imagewebp($image, $temporaryPath, 82),
                    default => false,
                };
            }

            if (! $success) {
                throw new RuntimeException("Gagal menulis turunan gambar {$format}.");
            }

            $stream = fopen($temporaryPath, 'rb');
            Storage::disk($disk)->put($relativePath, $stream, [
                'visibility' => 'public',
                'CacheControl' => 'public, max-age=31536000, immutable',
            ]);
            fclose($stream);
        } finally {
            @unlink($temporaryPath);
        }
    }

    private function flattenForJpeg(\GdImage $source): \GdImage
    {
        $canvas = imagecreatetruecolor(imagesx($source), imagesy($source));
        $white = imagecolorallocate($canvas, 255, 255, 255);
        imagefill($canvas, 0, 0, $white);
        imagecopy($canvas, $source, 0, 0, 0, 0, imagesx($source), imagesy($source));
        imageinterlace($canvas, true);

        return $canvas;
    }

    private function temporaryPath(string $extension): string
    {
        $base = tempnam(sys_get_temp_dir(), 'ubsc-gallery-');
        $path = "{$base}.{$extension}";
        @rename($base, $path);

        return $path;
    }
}
