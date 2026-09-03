<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdateNewsHeroRequest;
use App\Services\NewsHeroService;
use Illuminate\Http\RedirectResponse;

class NewsHeroController extends Controller
{
    public function update(
        UpdateNewsHeroRequest $request,
        NewsHeroService $hero,
    ): RedirectResponse {
        $newsIds = $request->validated('news_ids');
        $hero->replace(
            $newsIds,
            $request->validated('expected_news_ids'),
        );

        return back()->with(
            'success',
            count($newsIds) === 0
                ? 'Hero News kembali ke mode otomatis berdasarkan konten terbaru.'
                : 'Susunan highlight hero News berhasil diperbarui.',
        );
    }
}
