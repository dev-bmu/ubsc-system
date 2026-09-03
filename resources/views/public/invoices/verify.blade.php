<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow,noarchive">
    <title>Verifikasi {{ $invoice['receipt'] }} &middot; UB Sport Center</title>
    <style>
        @font-face {
            font-family: "BDO Grotesk";
            src: url("/fonts/BDOGrotesk-Regular.ttf") format("truetype");
            font-weight: 400;
        }

        @font-face {
            font-family: "BDO Grotesk";
            src: url("/fonts/BDOGrotesk-Bold.ttf") format("truetype");
            font-weight: 700;
        }

        * {
            box-sizing: border-box;
        }

        body {
            display: grid;
            min-height: 100vh;
            margin: 0;
            padding: 24px;
            place-items: center;
            background: #f1f1ef;
            color: #080808;
            font-family: "BDO Grotesk", Arial, sans-serif;
        }

        main {
            width: min(100%, 680px);
            border-top: 1px solid #080808;
            border-bottom: 1px solid #080808;
            padding: 24px 0;
        }

        .brand,
        .status {
            font-weight: 700;
            letter-spacing: -.045em;
        }

        .brand {
            margin: 0 0 56px;
            font-size: clamp(28px, 6vw, 58px);
            line-height: .9;
        }

        .status {
            margin: 0 0 18px;
            font-size: clamp(46px, 12vw, 92px);
            line-height: .85;
        }

        dl {
            display: grid;
            grid-template-columns: 1fr 1fr;
            margin: 0;
            border-top: 1px solid #b8b8b4;
        }

        div {
            padding: 14px 0;
            border-bottom: 1px solid #d2d2cf;
        }

        dt {
            color: #747470;
            font-size: 12px;
        }

        dd {
            margin: 4px 0 0;
            font-size: 17px;
            font-weight: 700;
        }

        .footnote {
            margin: 22px 0 0;
            color: #666662;
            font-size: 12px;
            line-height: 1.5;
        }

        @media (max-width: 520px) {
            dl {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <main>
        <p class="brand">[UB SPORT CENTER]</p>
        <h1 class="status">Invoice terverifikasi.</h1>
        <dl>
            <div>
                <dt>Nomor invoice</dt>
                <dd>{{ $invoice['receipt'] }}</dd>
            </div>
            <div>
                <dt>Status</dt>
                <dd>{{ $invoice['status_label'] }}</dd>
            </div>
            <div>
                <dt>Total pembayaran</dt>
                <dd>Rp {{ number_format($invoice['pricing']['total'], 0, ',', '.') }}</dd>
            </div>
            <div>
                <dt>Dibayar pada</dt>
                <dd>{{ $invoice['paid_at'] ?? 'Tidak tercatat' }}</dd>
            </div>
        </dl>
        <p class="footnote">
            Halaman ini hanya mengonfirmasi keaslian dan status pembayaran invoice.
            Data pribadi serta rincian layanan tidak ditampilkan.
        </p>
    </main>
</body>
</html>
