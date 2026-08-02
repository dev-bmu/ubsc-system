<?php

/*
|--------------------------------------------------------------------------
| Indonesian public-holiday calendar
|--------------------------------------------------------------------------
|
| Keep this dataset local and versioned so the booking calendar never relies
| on an unaudited third-party service at runtime. National holidays and
| collective leave are presentation metadata only; BookingSchedule remains
| the authority that decides whether UB Sport Center accepts reservations.
|
*/

return [
    2026 => [
        'source' => [
            'id' => 'skb-3-menteri-2026',
            'status' => 'official',
            'title' => 'Hari Libur Nasional dan Cuti Bersama Tahun 2026',
            'reference' => 'SKB Menteri Agama Nomor 1497 Tahun 2025, Menteri Ketenagakerjaan Nomor 2 Tahun 2025, dan Menteri PANRB Nomor 5 Tahun 2025',
            'url' => 'https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2026',
            'published_at' => '2025-09-19',
        ],
        'days' => [
            '2026-01-01' => ['label' => 'Tahun Baru 2026 Masehi', 'type' => 'national_holiday'],
            '2026-01-16' => ['label' => 'Isra Mikraj Nabi Muhammad saw.', 'type' => 'national_holiday'],
            '2026-02-16' => ['label' => 'Cuti Bersama Tahun Baru Imlek 2577 Kongzili', 'type' => 'collective_leave'],
            '2026-02-17' => ['label' => 'Tahun Baru Imlek 2577 Kongzili', 'type' => 'national_holiday'],
            '2026-03-18' => ['label' => 'Cuti Bersama Hari Suci Nyepi', 'type' => 'collective_leave'],
            '2026-03-19' => ['label' => 'Hari Suci Nyepi (Tahun Baru Saka 1948)', 'type' => 'national_holiday'],
            '2026-03-20' => ['label' => 'Cuti Bersama Idulfitri 1447 Hijriah', 'type' => 'collective_leave'],
            '2026-03-21' => ['label' => 'Idulfitri 1447 Hijriah', 'type' => 'national_holiday'],
            '2026-03-22' => ['label' => 'Idulfitri 1447 Hijriah', 'type' => 'national_holiday'],
            '2026-03-23' => ['label' => 'Cuti Bersama Idulfitri 1447 Hijriah', 'type' => 'collective_leave'],
            '2026-03-24' => ['label' => 'Cuti Bersama Idulfitri 1447 Hijriah', 'type' => 'collective_leave'],
            '2026-04-03' => ['label' => 'Wafat Yesus Kristus', 'type' => 'national_holiday'],
            '2026-04-05' => ['label' => 'Kebangkitan Yesus Kristus (Paskah)', 'type' => 'national_holiday'],
            '2026-05-01' => ['label' => 'Hari Buruh Internasional', 'type' => 'national_holiday'],
            '2026-05-14' => ['label' => 'Kenaikan Yesus Kristus', 'type' => 'national_holiday'],
            '2026-05-15' => ['label' => 'Cuti Bersama Kenaikan Yesus Kristus', 'type' => 'collective_leave'],
            '2026-05-27' => ['label' => 'Iduladha 1447 Hijriah', 'type' => 'national_holiday'],
            '2026-05-28' => ['label' => 'Cuti Bersama Iduladha 1447 Hijriah', 'type' => 'collective_leave'],
            '2026-05-31' => ['label' => 'Hari Raya Waisak 2570 BE', 'type' => 'national_holiday'],
            '2026-06-01' => ['label' => 'Hari Lahir Pancasila', 'type' => 'national_holiday'],
            '2026-06-16' => ['label' => '1 Muharam Tahun Baru Islam 1448 Hijriah', 'type' => 'national_holiday'],
            '2026-08-17' => ['label' => 'Proklamasi Kemerdekaan', 'type' => 'national_holiday'],
            '2026-08-25' => ['label' => 'Maulid Nabi Muhammad saw.', 'type' => 'national_holiday'],
            '2026-12-24' => ['label' => 'Cuti Bersama Kelahiran Yesus Kristus', 'type' => 'collective_leave'],
            '2026-12-25' => ['label' => 'Kelahiran Yesus Kristus', 'type' => 'national_holiday'],
        ],
    ],
];
