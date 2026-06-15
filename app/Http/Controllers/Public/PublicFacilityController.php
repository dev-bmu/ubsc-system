<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Http\Resources\Public\FacilityCategoryResource;
use App\Http\Resources\Public\FacilityResource;
use App\Models\Facility;
use App\Models\FacilityCategory;
use Inertia\Inertia;
use Inertia\Response;

class PublicFacilityController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('FacilityPage', [
            'facilities' => FacilityResource::collection(
                Facility::active()->with('category', 'prices')->orderBy('sort_order')->get()
            )->resolve(),
            'categories' => FacilityCategoryResource::collection(
                FacilityCategory::orderBy('sort_order')->get()
            )->resolve(),
        ]);
    }
}
