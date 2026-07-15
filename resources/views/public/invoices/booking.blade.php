@php
    use Carbon\Carbon;

    $transaction = $bookingOrder->transaction;
    $receipt = $transaction?->receipt_number ?? 'DRAFT-' . str_pad((string) $bookingOrder->id, 6, '0', STR_PAD_LEFT);
    $paidAt = $transaction?->paid_at
        ? Carbon::parse($transaction->paid_at)->timezone(config('app.timezone'))->format('d M Y, H:i')
        : now()->format('d M Y, H:i');
    $issuedAt = now()->format('d M Y, H:i');
    $rupiah = fn ($value) => 'Rp' . number_format((int) $value, 0, ',', '.');
@endphp
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Invoice {{ $receipt }} - UB Sport Center</title>
    <style>
        * { box-sizing: border-box; }
        body {
            margin: 0;
            background: #eef1f5;
            color: #111827;
            font-family: Arial, Helvetica, sans-serif;
        }
        .invoice-toolbar {
            position: sticky;
            top: 0;
            z-index: 10;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding: 14px 24px;
            background: rgba(255,255,255,.94);
            border-bottom: 1px solid #dfe3e8;
            backdrop-filter: blur(14px);
        }
        .toolbar-title {
            margin: 0;
            font-size: 14px;
            font-weight: 800;
        }
        .toolbar-subtitle {
            margin: 2px 0 0;
            color: #667085;
            font-size: 12px;
        }
        .toolbar-actions {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .toolbar-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 38px;
            padding: 0 14px;
            border-radius: 12px;
            border: 1px solid #d0d5dd;
            background: #fff;
            color: #111;
            font-size: 13px;
            font-weight: 800;
            text-decoration: none;
            cursor: pointer;
        }
        .toolbar-button.primary {
            border-color: #0b4a72;
            background: #0b4a72;
            color: #fff;
        }
        .invoice-preview {
            padding: 28px 16px 48px;
        }
        .invoice-page {
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            padding: 18mm 18mm 16mm;
            background: #fff;
            box-shadow: 0 28px 80px rgba(15,23,42,.14);
            color: #101828;
        }
        .topbar {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 32px;
            padding-bottom: 24px;
            border-bottom: 1px solid #e5e7eb;
        }
        .brand {
            display: flex;
            align-items: flex-start;
            gap: 16px;
        }
        .brand-logo {
            display: block;
            width: 92px;
            height: auto;
            object-fit: contain;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
        }
        .brand-title {
            margin: 0;
            font-size: 15px;
            font-weight: 800;
            line-height: 1.2;
        }
        .brand-address {
            margin: 7px 0 0;
            max-width: 250px;
            color: #667085;
            font-size: 11px;
            line-height: 1.55;
        }
        .invoice-heading {
            text-align: right;
        }
        .invoice-heading h1 {
            margin: 0;
            font-size: 28px;
            line-height: 1;
            letter-spacing: -0.04em;
        }
        .status-pill {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-top: 10px;
            padding: 6px 11px;
            border-radius: 999px;
            background: #ecfdf3;
            color: #027a48;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: .08em;
        }
        .meta-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 18px;
            margin-top: 24px;
        }
        .panel {
            border: 1px solid #e5e7eb;
            border-radius: 18px;
            padding: 18px;
            background: #fff;
        }
        .panel.soft {
            background: #f9fafb;
        }
        .panel-title {
            margin: 0 0 14px;
            color: #667085;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: .12em;
            text-transform: uppercase;
        }
        .kv-list {
            display: grid;
            gap: 10px;
        }
        .kv {
            display: flex;
            justify-content: space-between;
            gap: 20px;
            font-size: 12px;
            line-height: 1.4;
        }
        .kv span:first-child {
            color: #667085;
        }
        .kv span:last-child {
            max-width: 62%;
            text-align: right;
            font-weight: 700;
        }
        .section {
            margin-top: 22px;
        }
        .booking-list {
            display: grid;
            gap: 12px;
        }
        .booking-item {
            display: grid;
            grid-template-columns: 34px minmax(0, 1fr) auto;
            gap: 14px;
            align-items: flex-start;
            padding: 16px;
            border: 1px solid #e5e7eb;
            border-radius: 18px;
            background: #fff;
        }
        .number-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 34px;
            height: 34px;
            border-radius: 12px;
            background: #0b4a72;
            color: #fff;
            font-size: 12px;
            font-weight: 800;
        }
        .facility-name {
            margin: 0;
            font-size: 14px;
            font-weight: 800;
            line-height: 1.25;
        }
        .slot-detail {
            margin: 6px 0 0;
            color: #667085;
            font-size: 12px;
            line-height: 1.55;
        }
        .item-price {
            padding-top: 2px;
            white-space: nowrap;
            text-align: right;
            font-size: 14px;
            font-weight: 800;
        }
        .summary-wrap {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 300px;
            gap: 20px;
            align-items: start;
            margin-top: 22px;
        }
        .notes {
            color: #667085;
            font-size: 12px;
            line-height: 1.6;
        }
        .summary-card {
            display: grid;
            gap: 10px;
            padding: 18px;
            border-radius: 18px;
            background: #f9fafb;
            border: 1px solid #e5e7eb;
        }
        .summary-row {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            font-size: 13px;
        }
        .summary-row span:first-child {
            color: #667085;
        }
        .summary-row span:last-child {
            font-weight: 800;
        }
        .summary-row.discount span:last-child {
            color: #027a48;
        }
        .summary-total {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            margin-top: 4px;
            padding-top: 14px;
            border-top: 1px solid #d0d5dd;
            font-size: 18px;
            font-weight: 900;
            letter-spacing: -0.025em;
        }
        .footer {
            display: flex;
            justify-content: space-between;
            gap: 20px;
            margin-top: 34px;
            padding-top: 18px;
            border-top: 1px solid #e5e7eb;
            color: #98a2b3;
            font-size: 11px;
            line-height: 1.5;
        }
        @media (max-width: 900px) {
            .invoice-page {
                width: 100%;
                min-height: auto;
                padding: 24px;
            }
            .invoice-preview {
                padding: 16px 8px 32px;
            }
            .invoice-toolbar,
            .topbar,
            .footer {
                align-items: flex-start;
                flex-direction: column;
            }
            .invoice-heading {
                text-align: left;
            }
            .meta-grid,
            .summary-wrap {
                grid-template-columns: 1fr;
            }
            .booking-item {
                grid-template-columns: 34px minmax(0, 1fr);
            }
            .item-price {
                grid-column: 2;
                text-align: left;
            }
        }
        @media print {
            @page { size: A4 portrait; margin: 0; }
            body {
                background: #fff !important;
            }
            .invoice-toolbar {
                display: none !important;
            }
            .invoice-preview {
                padding: 0 !important;
            }
            .invoice-page {
                width: 210mm !important;
                min-height: 297mm !important;
                margin: 0 !important;
                padding: 18mm !important;
                box-shadow: none !important;
                print-color-adjust: exact !important;
                -webkit-print-color-adjust: exact !important;
            }
        }
    </style>
</head>
<body>
    <div class="invoice-toolbar">
        <div>
            <p class="toolbar-title">Preview Invoice Reservasi</p>
            <p class="toolbar-subtitle">Klik Print lalu pilih Save as PDF jika ingin menyimpan file PDF.</p>
        </div>
        <div class="toolbar-actions">
            <a class="toolbar-button" href="{{ route('checkout.booking.success', $bookingOrder) }}">Kembali</a>
            <button class="toolbar-button primary" type="button" onclick="window.print()">Print / Save as PDF</button>
        </div>
    </div>

    <main class="invoice-preview">
        <section class="invoice-page">
            <header class="topbar">
                <div class="brand">
                    <img src="/ubsc-blue.svg" alt="UB Sport Center" class="brand-logo">
                    <div>
                        <p class="brand-title">UB Sport Center</p>
                        <p class="brand-address">
                            Jl. Terusan Cibogo No.1, Penanggungan, Klojen, Kota Malang, Jawa Timur 65113
                        </p>
                    </div>
                </div>
                <div class="invoice-heading">
                    <h1>Invoice</h1>
                    <span class="status-pill">{{ $transaction?->payment_status === 'PAID' ? 'Paid' : ($transaction?->payment_status ?? 'Unpaid') }}</span>
                </div>
            </header>

            <section class="meta-grid">
                <div class="panel soft">
                    <p class="panel-title">Invoice Detail</p>
                    <div class="kv-list">
                        <div class="kv"><span>Invoice No</span><span>{{ $receipt }}</span></div>
                        <div class="kv"><span>Order ID</span><span>#{{ $bookingOrder->id }}</span></div>
                        <div class="kv"><span>Invoice Date</span><span>{{ $issuedAt }}</span></div>
                        <div class="kv"><span>Paid At</span><span>{{ $paidAt }}</span></div>
                    </div>
                </div>

                <div class="panel">
                    <p class="panel-title">Customer</p>
                    <div class="kv-list">
                        <div class="kv"><span>Name</span><span>{{ $bookingOrder->customer_name }}</span></div>
                        <div class="kv"><span>WhatsApp</span><span>{{ $bookingOrder->whatsapp_number ?: '-' }}</span></div>
                        <div class="kv"><span>Category</span><span>{{ $bookingOrder->identity_category === 'warga_ub' ? 'Warga UB' : 'Umum' }}</span></div>
                        @if ($bookingOrder->identity_number)
                            <div class="kv"><span>NIM / NIDN</span><span>{{ $bookingOrder->identity_number }}</span></div>
                        @endif
                    </div>
                </div>
            </section>

            <section class="section">
                <p class="panel-title">Booking Items</p>
                <div class="booking-list">
                    @foreach ($bookingOrder->bookings as $booking)
                        <article class="booking-item">
                            <span class="number-badge">{{ str_pad((string) $loop->iteration, 2, '0', STR_PAD_LEFT) }}</span>
                            <div>
                                <p class="facility-name">{{ $booking->facility?->name ?? 'Fasilitas' }}</p>
                                <p class="slot-detail">
                                    {{ $booking->facilityUnit?->name ?? 'Unit utama' }}<br>
                                    {{ $booking->booking_date ? Carbon::parse($booking->booking_date)->format('d M Y') : '-' }}
                                    · {{ substr((string) $booking->start_time, 0, 5) }} - {{ substr((string) $booking->end_time, 0, 5) }}
                                </p>
                            </div>
                            <div class="item-price">{{ $rupiah($booking->subtotal_price) }}</div>
                        </article>
                    @endforeach
                </div>
            </section>

            <section class="summary-wrap">
                <div class="panel">
                    <p class="panel-title">Notes</p>
                    <div class="notes">
                        {{ $bookingOrder->notes ?: 'Harap tunjukkan invoice ini kepada petugas UB Sport Center pada saat kedatangan.' }}
                    </div>
                </div>

                <div class="summary-card">
                    <div class="summary-row">
                        <span>Subtotal</span>
                        <span>{{ $rupiah($bookingOrder->subtotal_amount) }}</span>
                    </div>
                    <div class="summary-row discount">
                        <span>UB Discount</span>
                        <span>-{{ $rupiah($bookingOrder->discount_amount) }}</span>
                    </div>
                    <div class="summary-row">
                        <span>Transaction Fee</span>
                        <span>{{ $rupiah($bookingOrder->transaction_fee) }}</span>
                    </div>
                    <div class="summary-total">
                        <span>Total</span>
                        <span>{{ $rupiah($bookingOrder->total_amount) }}</span>
                    </div>
                </div>
            </section>

            <footer class="footer">
                <span>Thank you for booking with UB Sport Center.</span>
                <span>Generated {{ $issuedAt }}</span>
            </footer>
        </section>
    </main>

    @if ($autoPrint)
        <script>
            window.addEventListener("load", () => {
                window.setTimeout(() => window.print(), 350);
            });
        </script>
    @endif
</body>
</html>
