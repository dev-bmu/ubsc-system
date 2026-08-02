<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

final class AdminBrandAssetController extends Controller
{
    public function __invoke(): BinaryFileResponse
    {
        $path = resource_path('private/admin/UBSC PRO.png');

        abort_unless(is_file($path), 404);

        $response = response()->file($path, [
            'Content-Disposition' => 'inline; filename="ubsc-pro.png"',
            'Content-Type' => 'image/png',
            'X-Content-Type-Options' => 'nosniff',
            'X-Robots-Tag' => 'noindex, nofollow, noarchive',
        ]);

        $response->setPrivate();
        $response->setMaxAge(86400);

        return $response;
    }
}
