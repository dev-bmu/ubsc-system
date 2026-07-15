<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;

class PublicBranchController extends Controller
{
    public function show(string $slug): Response
    {
        $branches = $this->branches();
        $branch = $branches->firstWhere('slug', $slug);

        abort_unless($branch, 404);

        return Inertia::render('Branches/Show', [
            'branchItem' => $branch,
            'otherBranches' => $branches
                ->where('slug', '!==', $slug)
                ->values()
                ->all(),
        ]);
    }

    private function branches(): Collection
    {
        return collect([
            [
                'id' => 1,
                'slug' => 'ubsc-veteran',
                'title' => 'UB Sport Center Veteran',
                'category' => 'Indoor, Outdoor, & Hybrid',
                'category_badge' => 'Pusat Kebugaran Utama',
                'description' => 'UB Sport Center Veteran merupakan pusat fasilitas olahraga utama dengan akses strategis, arena indoor, kelas kebugaran, dan layanan reservasi untuk kebutuhan latihan harian maupun kegiatan komunitas.',
                'gmaps_embed_url' => 'https://www.google.com/maps?q=UB%20Sport%20Center%20Veteran%20Malang&output=embed',
                'address' => 'Jl. Veteran, Ketawanggede, Lowokwaru, Kota Malang',
                'contact' => '0341 5799155',
                'operating_hours' => '06.00 - 22.00',
                'images_array' => [
                    '/assets/images/ub-sport-center-kantor-pusat-malang.avif',
                ],
                'cover_image' => '/assets/images/ub-sport-center-kantor-pusat-malang.avif',
                'map_url' => 'https://maps.app.goo.gl/X7uRTbmnwqKAGfXr8',
                'social_links' => $this->socialLinks(),
            ],
            [
                'id' => 2,
                'slug' => 'ubsc-dieng',
                'title' => 'UB Sport Center Dieng',
                'category' => 'Indoor, Outdoor, & Hybrid',
                'category_badge' => 'Cabang Arena Terbuka',
                'description' => 'UB Sport Center Dieng menghadirkan area olahraga terbuka untuk sepak bola dan aktivitas lapangan, dengan lingkungan yang luas untuk latihan, pertandingan, dan kegiatan luar ruang.',
                'gmaps_embed_url' => 'https://www.google.com/maps?q=UB%20Sport%20Center%20Dieng%20Malang&output=embed',
                'address' => 'Kawasan Dieng, Kota Malang',
                'contact' => '0341 5799155',
                'operating_hours' => '06.00 - 22.00',
                'images_array' => [
                    '/assets/images/fasilitas-arena-terbuka-dieng-ub-sport-center-malang.avif',
                ],
                'cover_image' => '/assets/images/fasilitas-arena-terbuka-dieng-ub-sport-center-malang.avif',
                'map_url' => 'https://maps.app.goo.gl/TJvNjR6Sx2UN6SCbA',
                'social_links' => $this->socialLinks(),
            ],
        ]);
    }

    private function socialLinks(): array
    {
        return [
            ['label' => 'Instagram', 'href' => 'https://www.instagram.com/ubsportcenter/'],
            ['label' => 'Twitter/X', 'href' => 'https://x.com/ubsportcenter'],
            ['label' => 'Tiktok', 'href' => 'https://www.tiktok.com/@ubsportcenter'],
            ['label' => 'Facebook', 'href' => 'https://www.facebook.com/sportcenterub/'],
        ];
    }
}
