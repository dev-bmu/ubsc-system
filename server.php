<?php

/*
|--------------------------------------------------------------------------
| Laravel development server router
|--------------------------------------------------------------------------
|
| Apache/Nginx normally attach cache validators to static media. PHP's built-in
| server does not, which made every local hard refresh fetch the same images
| again. Laravel's `serve` command automatically uses this project router when
| it exists, so local behaviour now matches the production cache contract.
|
*/

$publicPath = getcwd();
$projectPath = dirname($publicPath);
$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '');
$candidate = $uri !== '/' ? realpath($publicPath.$uri) : false;
$publicRoot = realpath($publicPath);
$storageRoot = realpath($projectPath.'/storage/app/public');

$isInsideRoot = static function (string $path, string|false $root): bool {
    if ($root === false) {
        return false;
    }

    $normalizedRoot = rtrim($root, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR;

    return $path === $root || str_starts_with($path, $normalizedRoot);
};

$cacheableMimeTypes = [
    'avif' => 'image/avif',
    'gif' => 'image/gif',
    'ico' => 'image/x-icon',
    'jpeg' => 'image/jpeg',
    'jpg' => 'image/jpeg',
    'otf' => 'font/otf',
    'm4v' => 'video/x-m4v',
    'mov' => 'video/quicktime',
    'mp4' => 'video/mp4',
    'png' => 'image/png',
    'svg' => 'image/svg+xml',
    'ttf' => 'font/ttf',
    'webp' => 'image/webp',
    'woff' => 'font/woff',
    'woff2' => 'font/woff2',
    'webm' => 'video/webm',
];

if (
    is_string($candidate) &&
    is_file($candidate) &&
    ($isInsideRoot($candidate, $publicRoot) ||
        $isInsideRoot($candidate, $storageRoot))
) {
    $extension = strtolower(pathinfo($candidate, PATHINFO_EXTENSION));
    $mimeType = $cacheableMimeTypes[$extension] ?? null;

    if ($mimeType !== null) {
        $modifiedAt = filemtime($candidate) ?: time();
        $size = filesize($candidate) ?: 0;
        $etag = '"'.sha1($candidate.'|'.$modifiedAt.'|'.$size).'"';
        $isFont = in_array($extension, ['otf', 'ttf', 'woff', 'woff2'], true);
        $isStreamableVideo = str_starts_with($mimeType, 'video/');
        $isUploadedMedia = str_starts_with($uri, '/storage/');
        parse_str(parse_url($_SERVER['REQUEST_URI'], PHP_URL_QUERY) ?? '', $query);
        $assetVersion = $query['v'] ?? null;
        $isFingerprintVersioned = is_string($assetVersion)
            && preg_match('/\A[0-9a-f]{40}\z/i', $assetVersion) === 1;
        $maxAge = $isFont || $isFingerprintVersioned
            ? 31536000
            : ($isUploadedMedia ? 300 : 86400);
        $immutable = $isFont || $isFingerprintVersioned ? ', immutable' : '';

        header('Cache-Control: public, max-age='.$maxAge.$immutable.', stale-while-revalidate=86400');
        header('ETag: '.$etag);
        header('Last-Modified: '.gmdate('D, d M Y H:i:s', $modifiedAt).' GMT');
        header('Content-Type: '.$mimeType);
        header('X-Content-Type-Options: nosniff');

        if ($isStreamableVideo) {
            // Safari/iOS requests the first playable frame using byte ranges.
            // PHP's built-in server does not provide reliable range responses,
            // so the development router mirrors a normal web server here.
            header('Accept-Ranges: bytes');
        }

        $ifNoneMatch = trim($_SERVER['HTTP_IF_NONE_MATCH'] ?? '');
        $ifModifiedSince = $_SERVER['HTTP_IF_MODIFIED_SINCE'] ?? null;
        $notModified = $ifNoneMatch !== ''
            ? $ifNoneMatch === '*' ||
                in_array($etag, array_map('trim', explode(',', $ifNoneMatch)), true)
            : $ifModifiedSince !== null &&
                ($since = strtotime($ifModifiedSince)) !== false &&
                $since >= $modifiedAt;

        if ($notModified) {
            http_response_code(304);

            return true;
        }

        $rangeStart = 0;
        $rangeEnd = max(0, $size - 1);
        $rangeHeader = $isStreamableVideo
            ? trim((string) ($_SERVER['HTTP_RANGE'] ?? ''))
            : '';

        if ($rangeHeader !== '' && $size > 0) {
            $matches = [];

            if (preg_match('/\Abytes=(\d*)-(\d*)\z/', $rangeHeader, $matches) !== 1) {
                http_response_code(416);
                header('Content-Range: bytes */'.$size);
                header('Content-Length: 0');

                return true;
            }

            $requestedStart = $matches[1];
            $requestedEnd = $matches[2];

            if ($requestedStart === '' && $requestedEnd === '') {
                http_response_code(416);
                header('Content-Range: bytes */'.$size);
                header('Content-Length: 0');

                return true;
            }

            if ($requestedStart === '') {
                $suffixLength = (int) $requestedEnd;

                if ($suffixLength <= 0) {
                    http_response_code(416);
                    header('Content-Range: bytes */'.$size);
                    header('Content-Length: 0');

                    return true;
                }

                $rangeStart = max(0, $size - $suffixLength);
            } else {
                $rangeStart = (int) $requestedStart;
            }

            if ($requestedStart !== '' && $requestedEnd !== '') {
                $rangeEnd = min((int) $requestedEnd, $size - 1);
            }

            if ($rangeStart >= $size || $rangeEnd < $rangeStart) {
                http_response_code(416);
                header('Content-Range: bytes */'.$size);
                header('Content-Length: 0');

                return true;
            }

            http_response_code(206);
            header('Content-Range: bytes '.$rangeStart.'-'.$rangeEnd.'/'.$size);
        }

        $contentLength = $rangeEnd - $rangeStart + 1;
        header('Content-Length: '.$contentLength);

        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') {
            if ($rangeStart === 0 && $contentLength === $size) {
                readfile($candidate);
            } else {
                $stream = fopen($candidate, 'rb');

                if ($stream === false) {
                    http_response_code(500);

                    return true;
                }

                fseek($stream, $rangeStart);
                $remaining = $contentLength;

                while ($remaining > 0 && ! feof($stream)) {
                    $chunk = fread($stream, min(64 * 1024, $remaining));

                    if ($chunk === false || $chunk === '') {
                        break;
                    }

                    echo $chunk;
                    $remaining -= strlen($chunk);
                }

                fclose($stream);
            }
        }

        return true;
    }

    return false;
}

$formattedDateTime = date('D M j H:i:s Y');
$requestMethod = $_SERVER['REQUEST_METHOD'];
$remoteAddress = ($_SERVER['REMOTE_ADDR'] ?? 'unknown').':'.($_SERVER['REMOTE_PORT'] ?? '0');

file_put_contents(
    'php://stdout',
    "[$formattedDateTime] $remoteAddress [$requestMethod] URI: $uri\n",
);

require_once $publicPath.'/index.php';
