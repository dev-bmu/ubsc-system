<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Http\Resources\Public\NewsCategoryResource;
use App\Http\Resources\Public\NewsResource;
use App\Models\News;
use App\Models\NewsCategory;
use Inertia\Inertia;
use Inertia\Response;

class PublicNewsController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('NewsPage', [
            'news'       => NewsResource::collection(
                News::published()->with('category')->latest('published_at')->get()
            )->resolve(),
            'categories' => NewsCategoryResource::collection(
                NewsCategory::all()
            )->resolve(),
        ]);
    }
}
