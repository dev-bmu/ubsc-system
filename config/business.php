<?php

return [
    'name' => 'UB Sport Center',
    'short_name' => 'UBSC',
    'owner' => 'Universitas Brawijaya',
    'operator' => 'PT Brawijaya Multi Usaha',
    'description' => 'UB Sport Center merupakan pusat olahraga milik Universitas Brawijaya yang dikelola oleh PT Brawijaya Multi Usaha.',

    'email' => 'contact@ubsportcenter.co.id',
    'whatsapp' => [
        'number' => '+6285280809080',
        'display' => '0852 8080 9080',
        'url' => 'https://wa.me/6285280809080',
    ],

    'head_office' => [
        'name' => 'Kantor UB Sport Center',
        'address' => 'Jl. Terusan Cibogo No.1, Penanggungan, Kec. Klojen, Kota Malang, Jawa Timur 65113',
        'street_address' => 'Jl. Terusan Cibogo No.1, Penanggungan, Kec. Klojen',
        'address_locality' => 'Kota Malang',
        'address_region' => 'Jawa Timur',
        'postal_code' => '65113',
        'address_country' => 'ID',
        'map_url' => 'https://www.google.com/maps/place/UB+Sport+Center/@-7.9561269,112.6189626,18z/data=!4m12!1m5!3m4!2zN8KwNTcnMTguMyJTIDExMsKwMzcnMDYuNCJF!8m2!3d-7.9550876!4d112.6184389!3m5!1s0x2e7882788af472d9:0x12f8cee690772ec5!8m2!3d-7.955132!4d112.618489!16s%2Fg%2F11ckv5zn2f',
    ],

    'social' => [
        'instagram' => 'https://www.instagram.com/ubsportcenter/',
        'threads' => 'https://www.threads.com/@ubsportcenter',
        'tiktok' => 'https://www.tiktok.com/@ubsportcenter',
        'x' => 'https://x.com/ubsportcenter',
        'facebook' => 'https://www.facebook.com/sportcenterub/',
    ],

    /*
    |--------------------------------------------------------------------------
    | Public branches
    |--------------------------------------------------------------------------
    |
    | These values mirror the factual branch data displayed by the public
    | branch controller. Keep them centralized so page metadata and structured
    | data do not drift from the information visitors see.
    |
    */
    'branches' => [
        'ubsc-veteran' => [
            'slug' => 'ubsc-veteran',
            'name' => 'UB Sport Center Veteran',
            'category' => 'Indoor, Outdoor, & Hybrid',
            'description' => 'UB Sport Center Veteran merupakan pusat fasilitas olahraga utama dengan akses strategis, arena indoor, kelas kebugaran, dan layanan reservasi untuk kebutuhan latihan harian maupun kegiatan komunitas.',
            'address' => 'Jl. Veteran, Ketawanggede, Lowokwaru, Kota Malang',
            'street_address' => 'Jl. Veteran, Ketawanggede, Lowokwaru',
            'address_locality' => 'Kota Malang',
            'address_region' => 'Jawa Timur',
            'address_country' => 'ID',
            'telephone' => '0341 5799155',
            'operating_hours' => '06.00 - 22.00',
            'opening_hours_schema' => 'Mo-Su 06:00-22:00',
            'map_url' => 'https://maps.app.goo.gl/X7uRTbmnwqKAGfXr8',
            'image' => '/assets/images/ub-sport-center-kantor-pusat-malang.avif',
        ],
        'ubsc-dieng' => [
            'slug' => 'ubsc-dieng',
            'name' => 'UB Sport Center Dieng',
            'category' => 'Indoor, Outdoor, & Hybrid',
            'description' => 'UB Sport Center Dieng menghadirkan area olahraga terbuka untuk sepak bola dan aktivitas lapangan, dengan lingkungan yang luas untuk latihan, pertandingan, dan kegiatan luar ruang.',
            'address' => 'Kawasan Dieng, Kota Malang',
            'street_address' => 'Kawasan Dieng',
            'address_locality' => 'Kota Malang',
            'address_region' => 'Jawa Timur',
            'address_country' => 'ID',
            'telephone' => '0341 5799155',
            'operating_hours' => '06.00 - 22.00',
            'opening_hours_schema' => 'Mo-Su 06:00-22:00',
            'map_url' => 'https://maps.app.goo.gl/TJvNjR6Sx2UN6SCbA',
            'image' => '/assets/images/fasilitas-arena-terbuka-dieng-ub-sport-center-malang.avif',
        ],
    ],
];
