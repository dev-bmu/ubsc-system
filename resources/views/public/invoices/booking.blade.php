@php
    $rupiah = fn ($value) => 'Rp ' . number_format((int) $value, 0, ',', '.');
    $duration = function (int $minutes): string {
        if ($minutes <= 0) {
            return 'durasi tidak tercatat';
        }

        $hours = intdiv($minutes, 60);
        $remainingMinutes = $minutes % 60;

        if ($hours > 0 && $remainingMinutes > 0) {
            return $hours . ' jam ' . $remainingMinutes . ' menit';
        }

        return $hours > 0
            ? $hours . ' jam'
            : $remainingMinutes . ' menit';
    };
    $clip = fn ($value, $limit) => \Illuminate\Support\Str::limit(
        trim((string) $value),
        $limit,
        '…',
    );
    $pages = collect($invoice['items'])->chunk(5)->values();

    if ($pages->isEmpty()) {
        $pages = collect([collect()]);
    }

    $pageCount = $pages->count();
    $documentSubject = $invoice['document_subject'] ?? 'Reservasi fasilitas';
    $terms = $invoice['terms'] ?? [
        'Invoice sah setelah pembayaran tercatat lunas. Tunjukkan invoice kepada petugas saat datang.',
        'Jadwal mengikuti tanggal, unit, dan waktu yang tercantum. Hadir 15 menit lebih awal.',
        'Perubahan jadwal mengikuti ketersediaan dan kebijakan reservasi. Gunakan fasilitas sesuai peraturan petugas.',
        'Jangan bagikan QR atau nomor transaksi. Invoice ini bukan merupakan faktur pajak.',
    ];
@endphp
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <title>Invoice {{ $invoice['receipt'] }} · UB Sport Center</title>
    <style>
        @page {
            size: A4 portrait;
            margin: 0;
        }

        @if ($invoice['fonts']['regular'])
            @font-face {
                font-family: "BDO Grotesk";
                font-style: normal;
                font-weight: 400;
                src: url("{{ $invoice['fonts']['regular'] }}") format("truetype");
            }
        @endif

        @if ($invoice['fonts']['medium'])
            @font-face {
                font-family: "BDO Grotesk";
                font-style: normal;
                font-weight: 500;
                src: url("{{ $invoice['fonts']['medium'] }}") format("truetype");
            }
        @endif

        @if ($invoice['fonts']['semibold'])
            @font-face {
                font-family: "BDO Grotesk";
                font-style: normal;
                font-weight: 600;
                src: url("{{ $invoice['fonts']['semibold'] }}") format("truetype");
            }
        @endif

        @if ($invoice['fonts']['bold'])
            @font-face {
                font-family: "BDO Grotesk";
                font-style: normal;
                font-weight: 700;
                src: url("{{ $invoice['fonts']['bold'] }}") format("truetype");
            }
        @endif

        * {
            box-sizing: border-box;
        }

        html,
        body {
            width: 210mm;
            margin: 0;
            padding: 0;
            background: #f2f2f0;
            color: #080808;
            font-family: "BDO Grotesk", Arial, sans-serif;
            font-size: 6pt;
            font-weight: 400;
            line-height: 1.08;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
        }

        .invoice-page {
            position: relative;
            width: 210mm;
            height: 296.8mm;
            overflow: hidden;
            background: #f2f2f0;
        }

        .page-break {
            page-break-after: always;
        }

        .masthead {
            position: absolute;
            top: 6.5mm;
            left: 7mm;
            width: 196mm;
            height: 24mm;
            margin: 0;
            font-size: 59pt;
            font-weight: 700;
            letter-spacing: -3.35pt;
            line-height: .82;
            white-space: nowrap;
        }

        .meta {
            position: absolute;
            top: 51.5mm;
            left: 7mm;
            width: 196mm;
            height: 15.5mm;
            border-bottom: .38pt solid #080808;
        }

        .meta td {
            height: 15mm;
            padding: 0 0 2.4mm;
            vertical-align: bottom;
            font-size: 8.4pt;
            font-weight: 600;
            letter-spacing: -.08pt;
            line-height: 1.1;
        }

        .meta__client {
            width: 25%;
        }

        .meta__document {
            width: 50%;
        }

        .meta__title {
            width: 25%;
            text-align: right;
        }

        .meta__line {
            display: block;
            white-space: nowrap;
        }

        .meta__invoice {
            display: block;
            font-size: 20.5pt;
            font-weight: 700;
            letter-spacing: -1.15pt;
            line-height: .82;
        }

        .items {
            position: absolute;
            top: 69.5mm;
            left: 7mm;
            width: 196mm;
        }

        .items col:nth-child(1) {
            width: 52%;
        }

        .items col:nth-child(2) {
            width: 8%;
        }

        .items col:nth-child(3) {
            width: 15%;
        }

        .items col:nth-child(4) {
            width: 11%;
        }

        .items col:nth-child(5) {
            width: 14%;
        }

        .items tr {
            height: 14.5mm;
        }

        .items td {
            height: 14.5mm;
            padding: 0;
            vertical-align: top;
            font-size: 8.2pt;
            font-weight: 600;
            line-height: 1.13;
        }

        .items td:not(:first-child) {
            padding-top: .2mm;
            text-align: right;
            white-space: nowrap;
        }

        .item__name,
        .item__detail {
            display: block;
            white-space: nowrap;
        }

        .item__name {
            margin-bottom: .1mm;
            font-weight: 600;
        }

        .item__detail {
            padding-left: 8mm;
            font-size: 7.2pt;
            font-weight: 500;
        }

        .totals {
            position: absolute;
            top: 166mm;
            left: 104mm;
            width: 99mm;
        }

        .totals td {
            height: 4.6mm;
            padding: 0;
            font-size: 8.2pt;
            font-weight: 600;
            letter-spacing: -.04pt;
            vertical-align: top;
        }

        .totals__label {
            width: 61%;
        }

        .totals__value {
            width: 39%;
            text-align: right;
            white-space: nowrap;
        }

        .totals__grand td {
            padding-top: .35mm;
            font-weight: 700;
        }

        .settlement-rule {
            position: absolute;
            top: 208mm;
            left: 7mm;
            width: 196mm;
            height: 0;
            border-top: .38pt solid #080808;
        }

        .payment-title {
            position: absolute;
            top: 211.4mm;
            left: 7mm;
            margin: 0;
            font-size: 19pt;
            font-weight: 700;
            letter-spacing: -.78pt;
            line-height: .82;
        }

        .payment-reference {
            position: absolute;
            top: 212mm;
            left: 56mm;
            width: 42mm;
            font-size: 7pt;
            font-weight: 600;
            line-height: 1.12;
        }

        .payment-reference span {
            display: block;
            white-space: nowrap;
        }

        .payment-detail {
            position: absolute;
            top: 228mm;
            left: 7mm;
            width: 45mm;
            font-size: 8pt;
            font-weight: 500;
            line-height: 1.28;
        }

        .payment-detail strong,
        .payment-detail span {
            display: block;
        }

        .payment-detail strong {
            margin-bottom: 2.2mm;
            font-size: 7pt;
            font-weight: 600;
        }

        .payment-detail span {
            margin-bottom: .8mm;
        }

        .qr {
            position: absolute;
            top: 227.5mm;
            left: 55.5mm;
            width: 22mm;
            text-align: center;
        }

        .qr img {
            display: block;
            width: 21mm;
            height: 21mm;
            margin: 0 auto;
        }

        .qr__fallback {
            width: 21mm;
            height: 21mm;
            padding: 5mm 1.5mm 0;
            border: .35pt solid #080808;
            font-size: 4pt;
            font-weight: 600;
            line-height: 1.05;
            text-align: center;
        }

        .qr span {
            display: block;
            margin-top: 1mm;
            font-size: 6.5pt;
            font-weight: 600;
            white-space: nowrap;
        }

        .terms {
            position: absolute;
            top: 212mm;
            left: 105mm;
            width: 98mm;
            height: 59mm;
            overflow: hidden;
            font-size: 7.6pt;
            font-weight: 500;
            line-height: 1.18;
        }

        .terms strong {
            display: block;
            margin-bottom: 1.1mm;
            font-size: 7.2pt;
            font-weight: 700;
        }

        .terms ol {
            margin: 0;
            padding: 0 0 0 3.2mm;
        }

        .terms li {
            margin: 0 0 .45mm;
            padding: 0;
        }

        .footer {
            position: absolute;
            top: 279.3mm;
            left: 7mm;
            width: 196mm;
            border-top: .38pt solid #080808;
        }

        .footer td {
            padding: 1.7mm 0 0;
            vertical-align: top;
            font-size: 6.6pt;
            font-weight: 600;
            line-height: 1.12;
        }

        .footer__brand {
            padding-right: 5mm !important;
        }

        .footer__location {
            padding-right: 5mm !important;
        }

        .footer__support {
            padding-right: 4mm !important;
        }

        .footer td span + span {
            white-space: nowrap;
        }

        .footer img {
            display: block;
            width: 20mm;
            height: auto;
            margin: -.7mm 0 0;
        }

        .footer span {
            display: block;
        }

        .continuation {
            position: absolute;
            top: 282mm;
            right: 7mm;
            font-size: 4pt;
            font-weight: 600;
        }
    </style>
</head>
<body>
    @foreach ($pages as $pageIndex => $pageItems)
        @php
            $pageNumber = $pageIndex + 1;
            $isLastPage = $pageNumber === $pageCount;
        @endphp
        <section class="invoice-page{{ $isLastPage ? '' : ' page-break' }}">
            <h1 class="masthead">[UB SPORT CENTER]</h1>

            <table class="meta">
                <tr>
                    <td class="meta__client">
                        <span class="meta__line">
                            [{{ $invoice['issued_at'] ? \Illuminate\Support\Str::before($invoice['issued_at'], ',') : 'Tanggal tidak tercatat' }}]
                        </span>
                        <span class="meta__line">[{{ $clip($invoice['customer']['name'], 23) }}]</span>
                    </td>
                    <td class="meta__document">
                        <span class="meta__line">[#{{ $invoice['receipt'] }}]</span>
                        <span class="meta__line">
                            [{{ $documentSubject }}{{ $pageCount > 1 ? ' · ' . $pageNumber . '/' . $pageCount : '' }}]
                        </span>
                    </td>
                    <td class="meta__title">
                        <span class="meta__invoice">INVOICE</span>
                    </td>
                </tr>
            </table>

            <table class="items">
                <colgroup>
                    <col>
                    <col>
                    <col>
                    <col>
                    <col>
                </colgroup>
                <tbody>
                    @foreach ($pageItems as $item)
                        @php
                            $globalItemNumber = ($pageIndex * 5) + $loop->iteration;
                            $unit = $item['unit_name'] ?: 'Unit utama';
                            $location = $item['location'] ?: 'UB Sport Center';
                            $category = $item['category_name'] ?: 'Reservasi';
                        @endphp
                        <tr>
                            <td>
                                <span class="item__name">
                                    {{ str_pad((string) $globalItemNumber, 2, '0', STR_PAD_LEFT) }}.
                                    {{ $clip($item['facility_name'], 40) }}
                                </span>
                                @if (! empty($item['details']) && is_array($item['details']))
                                    @foreach (array_slice($item['details'], 0, 3) as $detail)
                                        <span class="item__detail">{{ $clip($detail, 62) }}</span>
                                    @endforeach
                                @else
                                    <span class="item__detail">
                                        {{ $clip($unit, 26) }} · {{ $clip($category, 22) }}
                                    </span>
                                    <span class="item__detail">
                                        {{ $item['date_label'] }} · {{ $item['start_time'] }}–{{ $item['end_time'] }}
                                    </span>
                                    <span class="item__detail">
                                        {{ $clip($location, 28) }} · {{ $duration((int) $item['duration_minutes']) }}
                                    </span>
                                @endif
                            </td>
                            <td>1</td>
                            <td>{{ number_format((int) $item['subtotal'], 0, ',', '.') }}</td>
                            <td>0</td>
                            <td>{{ number_format((int) $item['subtotal'], 0, ',', '.') }}</td>
                        </tr>
                    @endforeach
                </tbody>
            </table>

            @if ($isLastPage)
                <table class="totals">
                    <tr>
                        <td class="totals__label">SUBTOTAL:</td>
                        <td class="totals__value">{{ $rupiah($invoice['pricing']['regular_subtotal']) }}</td>
                    </tr>
                    <tr>
                        <td class="totals__label">DISKON:</td>
                        <td class="totals__value">− {{ $rupiah($invoice['pricing']['discount']) }}</td>
                    </tr>
                    <tr>
                        <td class="totals__label">BIAYA TRANSAKSI:</td>
                        <td class="totals__value">{{ $rupiah($invoice['pricing']['transaction_fee']) }}</td>
                    </tr>
                    <tr class="totals__grand">
                        <td class="totals__label">TOTAL:</td>
                        <td class="totals__value">{{ $rupiah($invoice['pricing']['total']) }}</td>
                    </tr>
                    <tr>
                        <td class="totals__label">DIBAYAR:</td>
                        <td class="totals__value">{{ $rupiah($invoice['pricing']['paid']) }}</td>
                    </tr>
                    <tr>
                        <td class="totals__label">SISA TAGIHAN (IDR):</td>
                        <td class="totals__value">{{ $rupiah($invoice['pricing']['balance_due']) }}</td>
                    </tr>
                </table>

                <div class="settlement-rule"></div>
                <h2 class="payment-title">PAYMENT</h2>
                <div class="payment-reference">
                    <span>[INV NO. {{ $clip($invoice['receipt'], 20) }}]</span>
                    <span>[REF: {{ $invoice['document_code'] }}]</span>
                </div>
                <div class="payment-detail">
                    <strong>[RINCIAN PEMBAYARAN]</strong>
                    <span>Metode: {{ $invoice['payment_method'] }}</span>
                    <span>Status: {{ $invoice['status_label'] }}</span>
                    <span>Dibayar: {{ $invoice['paid_at'] ?? 'Tidak tercatat' }}</span>
                    <span>Total: {{ $rupiah($invoice['pricing']['paid']) }}</span>
                </div>
                <div class="qr">
                    @if ($invoice['qr_data_uri'])
                        <img src="{{ $invoice['qr_data_uri'] }}" alt="QR verifikasi invoice">
                    @else
                        <div class="qr__fallback">VERIFIKASI<br>{{ $invoice['document_code'] }}</div>
                    @endif
                    <span>VERIFIKASI</span>
                </div>
                <div class="terms">
                    <strong>SYARAT &amp; KETENTUAN:</strong>
                    <ol>
                        @foreach ($terms as $term)
                            <li>{{ $term }}</li>
                        @endforeach
                    </ol>
                </div>
            @endif

            <table class="footer">
                <colgroup>
                    <col style="width: 16%;">
                    <col style="width: 39%;">
                    <col style="width: 20%;">
                    <col style="width: 25%;">
                </colgroup>
                <tr>
                    <td class="footer__brand">
                        @if ($invoice['logo_data_uri'])
                            <img src="{{ $invoice['logo_data_uri'] }}" alt="">
                        @else
                            <span>[UB SPORT CENTER]</span>
                        @endif
                    </td>
                    <td class="footer__location">
                        <span>[LOKASI]</span>
                        <span>JL. TERUSAN CIBOGO NO.1, MALANG</span>
                    </td>
                    <td class="footer__support">
                        <span>[BANTUAN]</span>
                        <span>+62 852 8080 9080</span>
                    </td>
                    <td class="footer__document">
                        <span>[DOKUMEN]</span>
                        <span>{{ $invoice['document_code'] }} · {{ $pageNumber }}/{{ $pageCount }}</span>
                    </td>
                </tr>
            </table>

            @unless ($isLastPage)
                <span class="continuation">LANJUTAN · {{ $pageNumber }}/{{ $pageCount }}</span>
            @endunless
        </section>
    @endforeach
</body>
</html>
