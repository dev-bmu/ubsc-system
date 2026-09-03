<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow,noarchive">
    @if ($automatic)
        <meta http-equiv="refresh" content="{{ $retryAfter }};url={{ $retryUrl }}">
    @endif
    <title>Menyiapkan invoice &middot; UB Sport Center</title>
    <style>
        @font-face {
            font-family: "BDO Grotesk";
            src: url("/fonts/BDOGrotesk-Regular.ttf") format("truetype");
            font-weight: 400;
        }
        @font-face {
            font-family: "BDO Grotesk";
            src: url("/fonts/BDOGrotesk-SemiBold.ttf") format("truetype");
            font-weight: 600;
        }
        * { box-sizing: border-box; }
        html, body { min-height: 100%; }
        body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 28px;
            background: #f0f0ed;
            color: #0a0a0a;
            font-family: "BDO Grotesk", Arial, sans-serif;
        }
        main {
            width: min(100%, 680px);
            border-top: 1px solid rgba(10, 10, 10, .42);
            border-bottom: 1px solid rgba(10, 10, 10, .42);
            padding: 24px 0 28px;
        }
        .meta {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            margin-bottom: clamp(64px, 15vw, 132px);
            font-size: 12px;
            letter-spacing: .06em;
        }
        h1 {
            max-width: 620px;
            margin: 0;
            font-size: clamp(42px, 8vw, 78px);
            font-weight: 600;
            line-height: .92;
            letter-spacing: -.055em;
        }
        p {
            max-width: 480px;
            margin: 24px 0 0;
            font-size: 16px;
            line-height: 1.45;
            color: rgba(10, 10, 10, .7);
        }
        .progress {
            position: relative;
            height: 2px;
            margin-top: 44px;
            overflow: hidden;
            background: rgba(10, 10, 10, .13);
        }
        .progress::after {
            content: "";
            position: absolute;
            inset: 0 auto 0 0;
            width: 42%;
            background: #155cff;
            animation: travel 1.35s cubic-bezier(.65, 0, .35, 1) infinite;
        }
        a {
            display: inline-flex;
            margin-top: 28px;
            color: inherit;
            font-size: 14px;
            text-underline-offset: 5px;
        }
        @keyframes travel {
            0% { transform: translateX(-105%); }
            100% { transform: translateX(345%); }
        }
        @media (prefers-reduced-motion: reduce) {
            .progress::after { animation: none; width: 64%; }
        }
    </style>
</head>
<body>
    <main>
        <div class="meta">
            <span>UB Sport Center</span>
            <span>Dokumen privat</span>
        </div>
        <h1>Menyiapkan {{ $subject }} Anda.</h1>
        <p>
            Dokumen sedang dibuat pada jalur terisolasi agar halaman utama tetap cepat.
            @if ($automatic)
                Halaman ini akan memperbarui dirinya secara otomatis.
            @else
                Proses membutuhkan waktu lebih lama dari biasanya. Anda dapat mencoba kembali tanpa membuat pembayaran baru.
            @endif
        </p>
        <div class="progress" aria-hidden="true"></div>
        <a href="{{ $retryUrl }}">Periksa kembali invoice</a>
    </main>
</body>
</html>
