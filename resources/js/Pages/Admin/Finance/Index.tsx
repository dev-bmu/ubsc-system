import { Head, router, usePage } from "@inertiajs/react";
import {
    ArrowDownRight,
    ArrowUpRight,
    BarChart3,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    CreditCard,
    Download,
    FileText,
    Filter,
    Landmark,
    LayoutGrid,
    PieChart,
    Printer,
    ReceiptText,
    Search,
    TrendingUp,
    Wallet,
    X,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import AdminLayout from "@/Layouts/AdminLayout";
import { cn } from "@/lib/utils";
import type { PageProps, PaymentStatus } from "@/types";

interface FinanceStats {
    totalRevenue: number;
    bookingRevenue: number;
    membershipRevenue: number;
    paidTransactions: number;
    pendingFailedAmount: number;
    averagePaidTransaction: number;
    totalBookings?: number;
    activeMemberships?: number;
}

interface BreakdownRow {
    name: string;
    revenue: number;
    count: number;
    share: number;
    color: string;
}

interface TypeBreakdown {
    name: string;
    type: "booking" | "membership" | "other";
    revenue: number;
    share: number;
    color: string;
}

interface LedgerRow {
    id: number;
    receipt_number: string;
    invoice_id: string | null;
    checkout_url: string | null;
    customer_name: string;
    type: "booking" | "membership" | "other";
    subject: string;
    amount: number;
    payment_status: PaymentStatus;
    paid_at: string | null;
    created_at: string | null;
}

type FinanceProps = PageProps<{
    stats: FinanceStats;
    revenueTrend: number;
    dailyRevenue: number[];
    monthlyRevenue: number[];
    facilityRevenue: BreakdownRow[];
    membershipPlanRevenue: BreakdownRow[];
    typeBreakdown: TypeBreakdown[];
    ledger: LedgerRow[];
    period: { month: number; year: number };
}>;

type LedgerTypeFilter = "all" | LedgerRow["type"];
type LedgerStatusFilter = "all" | PaymentStatus;

const MONTH_NAMES = [
    "",
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
];

const MONTH_SHORT = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];

const FINANCE_STYLES = `
    .font-clash { font-family: 'Clash Display', sans-serif; }
    .font-bdo { font-family: 'BDO Grotesk', sans-serif; }

    @keyframes shinyBlackText {
        0% { background-position: -200% center; }
        100% { background-position: 200% center; }
    }
    .animate-shiny-black {
        background: linear-gradient(120deg, #0f172a 35%, #cbd5e1 50%, #0f172a 65%);
        background-size: 200% auto;
        color: transparent;
        -webkit-background-clip: text;
        background-clip: text;
        animation: shinyBlackText linear infinite;
    }
    @keyframes shinyText {
        0% { background-position: -200% center; }
        100% { background-position: 200% center; }
    }
    .animate-shiny-text {
        background: linear-gradient(120deg, rgba(255,255,255,.42), #fff 50%, rgba(255,255,255,.42));
        background-size: 200% auto;
        color: transparent;
        -webkit-background-clip: text;
        background-clip: text;
        animation: shinyText linear infinite;
    }
    @keyframes fadeInUp {
        from { opacity: 0; transform: translate3d(0, 24px, 0); }
        to { opacity: 1; transform: translate3d(0, 0, 0); }
    }
    @keyframes float {
        0%, 100% { transform: translate3d(0, 0, 0); }
        50% { transform: translate3d(0, -6px, 0); }
    }
    @keyframes progressFill { from { width: 0%; } }
    @keyframes barGrow {
        from { transform: scaleY(0); transform-origin: bottom; }
        to { transform: scaleY(1); transform-origin: bottom; }
    }
    @keyframes scaleIn {
        from { opacity: 0; transform: scale(.94); }
        to { opacity: 1; transform: scale(1); }
    }
    @keyframes shimmerSweep {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(200%); }
    }
    @keyframes btnSheen {
        0% { left: -80%; }
        100% { left: 120%; }
    }
    @keyframes dotBreath {
        0%, 100% { opacity: .86; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.16); }
    }
    @keyframes dotHalo {
        0%, 100% { opacity: .16; transform: scale(.82); }
        50% { opacity: .42; transform: scale(1.48); }
    }
    .animate-fade-in-up { animation: fadeInUp .62s cubic-bezier(.16,1,.3,1) forwards; opacity: 0; will-change: opacity, transform; }
    .animate-scale-in { animation: scaleIn .5s cubic-bezier(.16,1,.3,1) forwards; opacity: 0; }
    .animate-float { animation: float 3.5s ease-in-out infinite; will-change: transform; }
    .progress-fill { animation: progressFill .75s cubic-bezier(.16,1,.3,1) forwards; }
    .bar-grow { animation: barGrow .55s cubic-bezier(.16,1,.3,1) forwards; }
    .delay-100 { animation-delay: 100ms; }
    .delay-150 { animation-delay: 150ms; }
    .delay-200 { animation-delay: 200ms; }
    .delay-250 { animation-delay: 250ms; }
    .delay-300 { animation-delay: 300ms; }
    .delay-400 { animation-delay: 400ms; }
    .card-glint { position: relative; }
    .card-glint::before {
        content: '';
        position: absolute;
        top: 0;
        left: 20px;
        right: 20px;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,1), transparent);
        pointer-events: none;
        z-index: 2;
    }
    .shimmer-once { position: relative; overflow: hidden; }
    .shimmer-once::after {
        content: '';
        position: absolute;
        inset: 0;
        width: 60%;
        border-radius: inherit;
        pointer-events: none;
        background: linear-gradient(105deg, transparent 0%, rgba(255,255,255,.42) 50%, transparent 100%);
        animation: shimmerSweep 1.1s ease-out .45s forwards;
    }
    .btn-sheen { position: relative; overflow: hidden; }
    .btn-sheen::before {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        width: 50%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.14), transparent);
        animation: btnSheen 3s ease-in-out 1s infinite;
    }
    .finance-live-dot {
        position: relative;
        display: inline-block;
        flex-shrink: 0;
        border-radius: 999px;
        background: var(--dot-color, #E35336);
        box-shadow: 0 0 0 1px rgba(255,255,255,.72), 0 0 9px var(--dot-halo, rgba(227,83,54,.28));
        animation: dotBreath 2.8s ease-in-out infinite;
        isolation: isolate;
    }
    .finance-live-dot::after {
        content: '';
        position: absolute;
        inset: -4px;
        z-index: -1;
        border-radius: inherit;
        background: var(--dot-halo, rgba(227,83,54,.22));
        animation: dotHalo 2.8s ease-in-out infinite;
    }
    .finance-scrollbar {
        scrollbar-width: thin;
        scrollbar-color: rgba(227,83,54,.32) transparent;
    }
    .finance-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .finance-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .finance-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(227,83,54,.32);
        border: 1px solid rgba(255,255,255,.72);
        border-radius: 999px;
    }
    .rev-bar {
        transition: filter .15s ease, transform .15s ease;
        transform-origin: bottom;
    }
    .rev-bar:hover { filter: brightness(1.12); }
    .chart-nav-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 12px;
        border: 1px solid;
        flex-shrink: 0;
        transition: all .2s ease;
    }
    .chart-nav-btn:active { transform: scale(.88); }
    .chart-nav-btn.enabled {
        border-color: #FFD5CD;
        color: #B93D2A;
        background: #fff;
    }
    .chart-nav-btn.enabled:hover {
        background: #FFF1EE;
        border-color: #EA684F;
        box-shadow: 0 2px 8px rgba(227,83,54,.15);
    }
    .chart-nav-btn.disabled {
        border-color: #f1f5f9;
        color: #cbd5e1;
        cursor: not-allowed;
        background: #f8fafc;
    }
    .scrubber-track {
        height: 6px;
        background: #f1f5f9;
        border-radius: 99px;
        overflow: visible;
        cursor: pointer;
        position: relative;
    }
    .scrubber-thumb {
        height: 100%;
        border-radius: 99px;
        background: linear-gradient(90deg, #EA684F, #B93D2A);
        position: absolute;
        top: 0;
        transition: left .25s cubic-bezier(.16,1,.3,1), width .25s;
        box-shadow: 0 1px 4px rgba(227,83,54,.3);
    }
    .jump-input {
        width: 46px;
        height: 32px;
        border-radius: 10px;
        border: 1px solid #e2e8f0;
        background: #fff;
        text-align: center;
        font-size: 10px;
        color: #334155;
        outline: none;
        transition: border-color .15s, box-shadow .15s;
        -moz-appearance: textfield;
    }
    .jump-input::-webkit-outer-spin-button,
    .jump-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    .jump-input:focus {
        border-color: #E35336;
        box-shadow: 0 0 0 3px rgba(227,83,54,.12);
    }
    .jump-go-btn {
        height: 32px;
        padding: 0 10px;
        border-radius: 10px;
        border: 1px solid #FFD5CD;
        background: #FFF1EE;
        color: #B93D2A;
        font-size: 10px;
        font-weight: 700;
        cursor: pointer;
        transition: all .15s;
    }
    .jump-go-btn:hover { background: #FFD5CD; border-color: #EA684F; }
    .jump-go-btn:active { transform: scale(.93); }

    .print-finance-template { display: none; }
    .prt-a4-page { width: 210mm; height: auto; max-height: 297mm; overflow: hidden; margin: 0 auto; background: #fff; padding: 14mm 16mm; box-sizing: border-box; font-family: 'Courier New', Courier, monospace; font-size: 9pt; color: #111; }
    .prt-header { display: flex; align-items: flex-start; gap: 0; margin-bottom: 0; }
    .prt-header-left { width: 72pt; flex-shrink: 0; display: flex; align-items: flex-start; justify-content: flex-start; }
    .prt-logo-img { width: 68pt; height: 68pt; object-fit: contain; display: block; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .prt-header-right { flex: 1; padding-left: 10pt; }
    .prt-company-name-main { font-family: 'Courier New', Courier, monospace; font-size: 13pt; font-weight: bold; letter-spacing: 0.14em; line-height: 1.15; margin: 0; }
    .prt-company-name-sub { font-family: 'Courier New', Courier, monospace; font-size: 10pt; font-weight: bold; letter-spacing: 0.10em; margin: 1pt 0 3pt 0; }
    .prt-company-address { font-size: 8pt; line-height: 1.45; margin-bottom: 4pt; font-family: 'Courier New', Courier, monospace; }
    .prt-header-divider { border: none; border-top: 1.5pt solid #111; margin: 3pt 0 4pt 0; }
    .prt-doc-title { font-family: 'Courier New', Courier, monospace; font-size: 15pt; font-weight: bold; letter-spacing: 0.04em; text-align: center; margin: 0; }
    .prt-meta-outer { display: flex; gap: 0; margin-top: 6pt; margin-bottom: 8pt; border: 0.75pt solid #444; }
    .prt-meta-left { flex: 1; padding: 5pt 8pt 8pt 8pt; font-size: 8.5pt; border-right: 0.75pt solid #444; font-family: 'Courier New', Courier, monospace; }
    .prt-payment-note { margin-top: 22pt; font-size: 8pt; font-weight: bold; line-height: 1.75; font-family: 'Courier New', Courier, monospace; white-space: nowrap; }
    .prt-meta-right { width: 230pt; flex-shrink: 0; }
    .prt-meta-right table { width: 100%; border-collapse: collapse; font-size: 8.5pt; font-family: 'Courier New', Courier, monospace; }
    .prt-meta-right table td { border-bottom: 0.75pt dashed #888; border-left: 0.75pt dashed #888; padding: 3.5pt 6pt; vertical-align: middle; }
    .prt-meta-right table td.meta-label-col { width: 45%; font-size: 8pt; color: #555; font-weight: normal; white-space: nowrap; }
    .prt-meta-right table td.meta-value-col { width: 55%; font-size: 8.5pt; font-weight: normal; }
    .prt-meta-right table td.meta-value-bold { font-weight: bold; }
    .prt-meta-right table tr:last-child td { border-bottom: none; }
    .prt-report-table { width: 100%; border-collapse: collapse; margin-bottom: 6pt; font-size: 8.5pt; font-family: 'Courier New', Courier, monospace; }
    .prt-report-table th { border: 0.75pt solid #111; padding: 4pt 6pt; text-align: center; font-weight: bold; background: #fff; font-family: 'Courier New', Courier, monospace; }
    .prt-report-table td { border: 0.75pt solid #444; padding: 4.5pt 6pt; vertical-align: middle; font-family: 'Courier New', Courier, monospace; }
    .prt-report-table td.rt-center { text-align: center; }
    .prt-report-table td.rt-right { text-align: right; }
    .prt-report-table td.rt-bold { font-weight: bold; }
    .prt-report-table tr.rt-filler td { color: #ddd; border-color: #eee; }
    .prt-bottom-row { display: flex; gap: 0; margin-bottom: 0; }
    .prt-keterangan { flex: 1; border: 0.75pt solid #444; padding: 5pt 7pt; font-size: 8.5pt; min-height: 64pt; font-family: 'Courier New', Courier, monospace; }
    .prt-keterangan-label { font-weight: bold; font-size: 8pt; display: block; margin-bottom: 4pt; border-bottom: 0.5pt solid #ccc; padding-bottom: 2pt; }
    .prt-summary { width: 185pt; flex-shrink: 0; }
    .prt-summary table { width: 100%; border-collapse: collapse; font-size: 8.5pt; font-family: 'Courier New', Courier, monospace; }
    .prt-summary table td { border: 0.75pt solid #444; padding: 3.5pt 6pt; }
    .prt-summary table td:last-child { text-align: right; }
    .prt-summary table tr.sum-total td { font-weight: bold; }
    .prt-page-footer { margin-top: 10pt; font-family: 'Courier New', Courier, monospace; font-size: 8pt; color: #555; display: flex; justify-content: space-between; align-items: center; border-top: 0.5pt solid #ccc; padding-top: 5pt; }

    @media (prefers-reduced-motion: reduce) {
        .animate-fade-in-up, .animate-float, .bar-grow, .finance-live-dot, .finance-live-dot::after {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
        }
    }
    @media print {
        @page { size: A4 portrait; margin: 0; }
        body * { visibility: hidden !important; }
        .print-finance-template, .print-finance-template * { visibility: visible !important; }
        .print-finance-template { display: block !important; position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; z-index: 99999 !important; }
        .prt-a4-page { width: 210mm !important; height: auto !important; min-height: unset !important; max-height: 297mm !important; overflow: hidden !important; padding: 14mm 16mm !important; margin: 0 !important; box-sizing: border-box !important; page-break-after: avoid !important; break-after: avoid !important; }
        .prt-logo-img { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; width: 68pt !important; height: 68pt !important; }
    }
`;

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
    UNPAID: "Belum bayar",
    PAID: "Lunas",
    EXPIRED: "Expired",
    FAILED: "Gagal",
};

const PAYMENT_STYLE: Record<PaymentStatus, string> = {
    UNPAID: "border-[#F8B5A8] bg-[#FFF1EE] text-[#B93D2A]",
    PAID: "border-emerald-200 bg-emerald-50 text-emerald-700",
    EXPIRED: "border-slate-200 bg-slate-50 text-slate-500",
    FAILED: "border-rose-200 bg-rose-50 text-rose-600",
};

function ShinyTextBlack({ text, speed = 4, className = "" }: { text: string; speed?: number; className?: string }) {
    return <span className={cn("animate-shiny-black", className)} style={{ animationDuration: `${speed}s` }}>{text}</span>;
}

function ShinyText({ text, speed = 3, className = "" }: { text: string; speed?: number; className?: string }) {
    return <span className={cn("animate-shiny-text", className)} style={{ animationDuration: `${speed}s` }}>{text}</span>;
}

function LiveDot({ size = "sm", color = "#E35336", halo = "rgba(227,83,54,.28)" }: { size?: "xs" | "sm"; color?: string; halo?: string }) {
    const sizeClass = size === "xs" ? "h-1.5 w-1.5" : "h-2 w-2";
    return <span className={cn("finance-live-dot", sizeClass)} style={{ "--dot-color": color, "--dot-halo": halo } as CSSProperties} />;
}

function ShinyIcon({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-[15px] bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] text-white shadow-[0_12px_24px_-20px_rgba(227,83,54,.9)]", className)}>
            <span className="pointer-events-none absolute left-2 right-2 top-1.5 h-1 rounded-full bg-white/35 blur-[1px]" />
            {children}
        </div>
    );
}

function formatRupiah(amount: number): string {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

function formatCompact(amount: number): string {
    if (amount >= 1_000_000_000) {
        return `Rp ${(amount / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}M`;
    }
    if (amount >= 1_000_000) {
        return `Rp ${(amount / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}JT`;
    }
    if (amount >= 1_000) {
        return `Rp ${(amount / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })}rb`;
    }
    return formatRupiah(amount);
}

function formatChartRevenue(amount: number): string {
    if (amount >= 1_000_000) {
        return `${(amount / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}JT`;
    }
    if (amount >= 1_000) {
        return `${(amount / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })}rb`;
    }
    return amount.toLocaleString("id-ID");
}

function formatNumber(value: number): string {
    return value.toLocaleString("id-ID");
}

function getElapsedMonthRevenue(data: number[], currentDayInMonth?: number): number[] {
    if (!data.length) return [];
    const today = Number.isFinite(currentDayInMonth) && currentDayInMonth ? currentDayInMonth : new Date().getDate();
    const elapsedDays = Math.min(data.length, Math.max(1, today));
    return data.slice(0, elapsedDays);
}

function shiftPeriod(month: number, year: number, delta: number): { month: number; year: number } {
    const next = new Date(year, month - 1 + delta, 1);
    return { month: next.getMonth() + 1, year: next.getFullYear() };
}

function maxValue(values: number[]): number {
    return Math.max(1, ...values);
}

function PaymentBadge({ status }: { status: PaymentStatus }) {
    return (
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-bdo text-[11px] font-bold", PAYMENT_STYLE[status])}>
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
            {PAYMENT_LABEL[status]}
        </span>
    );
}

function PeriodPicker({ period }: { period: { month: number; year: number } }) {
    const goTo = (month: number, year: number) => {
        router.get(route("admin.finance.index"), { month, year }, { preserveScroll: true, preserveState: false });
    };
    const prev = shiftPeriod(period.month, period.year, -1);
    const next = shiftPeriod(period.month, period.year, 1);

    return (
        <div className="grid grid-cols-[38px_1fr_38px] gap-1.5 rounded-[18px] border border-slate-200 bg-slate-50 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,.82)]">
            <button type="button" onClick={() => goTo(prev.month, prev.year)} className="flex h-9 items-center justify-center rounded-[13px] bg-white text-[#B93D2A] ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:ring-[#F8B5A8]" aria-label="Bulan sebelumnya">
                <ChevronLeft size={16} />
            </button>
            <div className="flex min-w-[150px] items-center justify-center gap-2 rounded-[13px] bg-white px-3 text-slate-800 ring-1 ring-slate-100">
                <CalendarDays size={15} className="text-[#E35336]" />
                <span className="font-bdo text-xs font-bold sm:text-sm">{MONTH_NAMES[period.month]} {period.year}</span>
            </div>
            <button type="button" onClick={() => goTo(next.month, next.year)} className="flex h-9 items-center justify-center rounded-[13px] bg-white text-[#B93D2A] ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:ring-[#F8B5A8]" aria-label="Bulan berikutnya">
                <ChevronRight size={16} />
            </button>
        </div>
    );
}

function InfoChip({ color, label }: { color: string; label: string }) {
    return (
        <span className="inline-flex h-9 items-center justify-center gap-2 rounded-[14px] border border-slate-200 bg-white/80 px-3 font-bdo text-[10px] font-bold uppercase tracking-wide text-slate-600 shadow-sm">
            <LiveDot size="xs" color={color} halo={`${color}3d`} />
            {label}
        </span>
    );
}

function FinanceToolbar({ period, rows, stats }: { period: { month: number; year: number }; rows: LedgerRow[]; stats: FinanceStats }) {
    return (
        <section className="finance-no-print card-glint animate-fade-in-up rounded-[22px] border border-[#FFE0D8] bg-[linear-gradient(135deg,#ffffff_0%,#fff8f6_58%,#f8fafc_100%)] p-2.5 shadow-[0_18px_42px_-36px_rgba(185,61,42,.5)]">
            <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    <InfoChip color="#10B981" label={`${stats.paidTransactions} lunas`} />
                    <InfoChip color="#E35336" label={`${stats.totalBookings ?? 0} reservasi`} />
                    <InfoChip color="#0EA5E9" label={`${stats.activeMemberships ?? 0} member`} />
                    <InfoChip color="#64748B" label={`${rows.length} ledger`} />
                </div>

                <div className="grid gap-2 sm:grid-cols-[minmax(210px,1fr)_auto_auto]">
                    <PeriodPicker period={period} />
                    <button type="button" onClick={() => downloadFinanceCsv(rows, period)} className="inline-flex h-11 items-center justify-center gap-2 rounded-[16px] border border-[#FFD5CD] bg-white px-4 font-bdo text-xs font-bold text-[#B93D2A] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#FFF1EE]">
                        <Download size={15} />
                        CSV
                    </button>
                    <button type="button" onClick={() => window.print()} className="inline-flex h-11 items-center justify-center gap-2 rounded-[16px] bg-[linear-gradient(135deg,#F08C78,#E35336_55%,#B93D2A)] px-4 font-bdo text-xs font-bold text-white shadow-[0_16px_28px_-22px_rgba(227,83,54,.95)] transition hover:-translate-y-0.5">
                        <Printer size={15} />
                        Print
                    </button>
                </div>
            </div>
        </section>
    );
}

function RevenueHero({ stats, trend, period, dailyRevenue }: { stats: FinanceStats; trend: number; period: { month: number; year: number }; dailyRevenue: number[] }) {
    const bookingShare = stats.totalRevenue > 0 ? Math.round((stats.bookingRevenue / stats.totalRevenue) * 100) : 0;
    const membershipShare = stats.totalRevenue > 0 ? Math.round((stats.membershipRevenue / stats.totalRevenue) * 100) : 0;
    const positive = trend >= 0;
    const sparkData = dailyRevenue.slice(-20);
    const sparkMax = maxValue(sparkData);

    return (
        <section className="shimmer-once animate-fade-in-up delay-100 group relative flex min-h-[336px] flex-col justify-between overflow-hidden rounded-[26px] bg-[linear-gradient(135deg,#E35336_0%,#C6422E_45%,#8F2E20_100%)] p-5 text-white shadow-2xl shadow-[#F8B5A8]/40 transition-all duration-500 hover:-translate-y-1 hover:shadow-[#F08C78]/50 sm:p-6">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border border-white/18" />
            <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-[#EA684F]/20 blur-3xl" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.06)_0,rgba(255,255,255,.06)_1px,transparent_1px,transparent_18px)]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

            <div className="relative z-10 flex items-start justify-between gap-4">
                <div>
                    <div className="mb-3 flex items-center gap-2">
                        <div className="rounded-lg bg-white/18 p-1.5 backdrop-blur-md ring-1 ring-white/15">
                            <Wallet className="h-4 w-4 text-white" />
                        </div>
                        <p className="font-bdo text-[10px] font-bold uppercase tracking-widest text-[#FFD5CD]">Finance Command</p>
                    </div>
                    <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.2em] text-white/58">Total Pendapatan</p>
                    <h2 className="mt-1 font-clash text-[1.9rem] font-bold leading-none tracking-tight text-white sm:text-[2.35rem] 2xl:text-[2.5rem]">
                        Rp <ShinyText text={formatCompact(stats.totalRevenue).replace("Rp ", "")} speed={4} />
                    </h2>
                    <p className="mt-2 font-bdo text-xs font-semibold text-[#FFD5CD]/80">{formatRupiah(stats.totalRevenue)} - {MONTH_NAMES[period.month]} {period.year}</p>
                    <div className={cn("mt-3 inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-bdo text-[10px] font-bold backdrop-blur-md", positive ? "border border-white/20 bg-white/15 text-white" : "border border-red-700/30 bg-red-900/30 text-red-200")}>
                        {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {Math.abs(trend).toLocaleString("id-ID", { maximumFractionDigits: 1 })}% bulan ini
                    </div>
                </div>
                <div className="flex shrink-0 animate-float items-center justify-center rounded-[18px] border border-white/25 bg-white/15 p-3 shadow-lg backdrop-blur-xl">
                    <TrendingUp className="h-5 w-5 text-white" />
                </div>
            </div>

            <div className="relative z-10 my-4 flex flex-1 flex-col justify-center">
                <p className="mb-3 font-bdo text-[10px] font-bold uppercase tracking-widest text-[#F8B5A8]/80">Pemisahan sumber pendapatan</p>
                <div className="overflow-hidden rounded-[18px] border border-white/15 bg-white/10 backdrop-blur-xl">
                    <RevenueHeroLine label="Booking Revenue" value={formatCompact(stats.bookingRevenue)} share={bookingShare} icon={<Landmark size={14} />} />
                    <RevenueHeroLine label="Membership Revenue" value={formatCompact(stats.membershipRevenue)} share={membershipShare} icon={<CreditCard size={14} />} />
                    <RevenueHeroLine label="Transaksi Lunas" value={String(stats.paidTransactions)} share={100} icon={<ReceiptText size={14} />} muted />
                </div>
            </div>

            {sparkData.length > 0 && (
                <div className="relative z-10 mb-4">
                    <p className="mb-1.5 font-bdo text-[9px] uppercase tracking-widest text-[#F8B5A8]/60">Tren 20 hari terakhir</p>
                    <div className="flex items-end gap-[2px]" style={{ height: 24 }}>
                        {sparkData.map((value, index) => {
                            const height = Math.max((value / sparkMax) * 22, value > 0 ? 3 : 1.5);
                            return <span key={index} className="flex-1 rounded-sm bg-white/45" style={{ height }} />;
                        })}
                    </div>
                </div>
            )}
        </section>
    );
}

function RevenueHeroLine({ label, value, share, icon, muted = false }: { label: string; value: string; share: number; icon: ReactNode; muted?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3.5 py-2.5 last:border-b-0">
            <div className="flex min-w-0 items-center gap-2.5">
                <span className="rounded-lg bg-white/15 p-1.5 text-white">{icon}</span>
                <span className="truncate font-bdo text-[11px] font-medium text-[#FFD5CD]">{label}</span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
                {!muted && <span className="font-bdo text-[10px] font-bold text-emerald-200">{share}%</span>}
                <span className="font-clash text-sm font-bold text-white">{value}</span>
            </div>
        </div>
    );
}

function MetricGrid({ stats }: { stats: FinanceStats }) {
    return (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MetricCard icon={<Landmark size={18} />} label="Booking Revenue" value={formatRupiah(stats.bookingRevenue)} note={`${stats.totalBookings ?? 0} reservasi`} tone="terracotta" delay="delay-100" />
            <MetricCard icon={<CreditCard size={18} />} label="Membership Revenue" value={formatRupiah(stats.membershipRevenue)} note={`${stats.activeMemberships ?? 0} member aktif`} tone="emerald" delay="delay-150" />
            <MetricCard icon={<ReceiptText size={18} />} label="Transaksi Paid" value={formatNumber(stats.paidTransactions)} note={`Avg ${formatRupiah(stats.averagePaidTransaction)}`} tone="sky" delay="delay-200" />
            <MetricCard icon={<Wallet size={18} />} label="Pending / Failed" value={formatRupiah(stats.pendingFailedAmount)} note="Perlu rekonsiliasi" tone="slate" delay="delay-250" />
        </section>
    );
}

function MetricCard({ icon, label, value, note, tone, delay }: { icon: ReactNode; label: string; value: string; note: string; tone: "terracotta" | "emerald" | "sky" | "slate"; delay: string }) {
    const styles = {
        terracotta: {
            card: "border-[#F08C78]/50 bg-[#21110e] text-white shadow-[0_18px_38px_-29px_rgba(227,83,54,.86)]",
            icon: "border-white/15 bg-white/[.10] text-[#FFD5CD]",
            chip: "border-[#F08C78]/40 bg-[#E35336]/20 text-[#FFD5CD]",
            accent: "#F08C78",
            bar: "linear-gradient(180deg,#FFD5CD,#E35336)",
            note: "text-[#FFD5CD]/78",
        },
        emerald: {
            card: "border-emerald-100 bg-white text-slate-950 shadow-[0_18px_38px_-30px_rgba(16,185,129,.52)]",
            icon: "border-emerald-100 bg-emerald-50 text-emerald-600",
            chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
            accent: "#10B981",
            bar: "linear-gradient(180deg,#6ee7b7,#059669)",
            note: "text-slate-500",
        },
        sky: {
            card: "border-sky-100 bg-white text-slate-950 shadow-[0_18px_38px_-30px_rgba(14,165,233,.52)]",
            icon: "border-sky-100 bg-sky-50 text-sky-600",
            chip: "border-sky-200 bg-sky-50 text-sky-700",
            accent: "#0EA5E9",
            bar: "linear-gradient(180deg,#7dd3fc,#0284c7)",
            note: "text-slate-500",
        },
        slate: {
            card: "border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_55%,#FFF1EE_100%)] text-slate-950 shadow-[0_18px_38px_-30px_rgba(100,116,139,.42)]",
            icon: "border-slate-200 bg-white text-[#B93D2A]",
            chip: "border-slate-200 bg-white text-slate-600",
            accent: "#64748B",
            bar: "linear-gradient(180deg,#cbd5e1,#64748b)",
            note: "text-slate-500",
        },
    }[tone];
    const bars = Array.from({ length: 9 }, (_, index) => {
        const wave = ((index * 17 + label.length * 7 + value.length * 11) % 54) + 28;
        return Math.min(92, wave);
    });

    return (
        <article className={cn("animate-fade-in-up relative min-h-[150px] overflow-hidden rounded-[20px] border p-3.5 transition-all duration-300 hover:-translate-y-1", styles.card, delay)}>
            <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-20" />
            <div className="relative z-10 flex h-full min-h-[124px] flex-col justify-between">
                <div className="flex items-start justify-between gap-3">
                    <span className={cn("flex h-9 w-9 items-center justify-center rounded-[13px] border shadow-[inset_0_1px_0_rgba(255,255,255,.34)]", styles.icon)}>{icon}</span>
                    <span className={cn("rounded-full border px-2.5 py-1 font-bdo text-[9px] font-bold uppercase tracking-wide", styles.chip)}>
                        Live
                    </span>
                </div>

                <div className="mt-3">
                    <div className="min-w-0">
                        <div className="min-w-0">
                            <p className="break-words font-clash text-[1.05rem] font-bold leading-[1.05] tracking-tight sm:text-[1.16rem] 2xl:text-[1.25rem]" title={value}>{value}</p>
                            <p className="mt-2 font-bdo text-[12px] font-semibold opacity-85">{label}</p>
                        </div>
                    </div>
                    <div className="mt-2.5 flex h-7 items-end gap-[3px] rounded-[12px] border border-current/10 bg-white/10 px-2 py-1.5">
                        {bars.map((height, index) => (
                            <span key={index} className="flex-1 rounded-t-[3px]" style={{ height: `${height}%`, background: styles.bar, opacity: index < 3 ? .48 : .9 }} />
                        ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                        <p className={cn("min-w-0 break-words font-bdo text-[11px] font-semibold leading-tight", styles.note)}>{note}</p>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: styles.accent, boxShadow: `0 0 0 4px ${styles.accent}22` }} />
                    </div>
                </div>
            </div>
        </article>
    );
}

function DailyRevenueCard({ data, trend, period }: { data: number[]; trend: number; period: { month: number; year: number } }) {
    const trendPositive = trend >= 0;
    const currentDay = period.month === new Date().getMonth() + 1 && period.year === new Date().getFullYear()
        ? new Date().getDate()
        : data.length;

    return (
        <section className="card-glint animate-fade-in-up delay-200 group relative flex min-h-[344px] min-w-0 flex-col rounded-[22px] border border-slate-200/80 bg-white p-3.5 shadow-sm sm:p-4" style={{ overflow: "visible" }}>
            <div className="pointer-events-none absolute inset-0 rounded-[24px] bg-gradient-to-br from-[#FFF1EE]/30 via-transparent to-slate-50/20 opacity-0 transition-opacity duration-1000 group-hover:opacity-100" />
            <div className="pointer-events-none absolute left-5 right-5 top-0 z-10 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />

            <div className="relative z-10 mb-3.5">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                        <ShinyIcon className="h-10 w-10 shrink-0 transition-transform duration-300 group-hover:scale-105">
                            <TrendingUp className="h-4 w-4 text-white" />
                        </ShinyIcon>
                        <div className="min-w-0">
                            <h2 className="whitespace-nowrap font-clash text-sm font-semibold leading-tight text-slate-900">Grafik Pendapatan</h2>
                            <p className="mt-0.5 whitespace-nowrap font-bdo text-[10px] font-medium text-slate-400">Pendapatan bulan berjalan</p>
                        </div>
                    </div>
                    <span className={cn("flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 font-bdo text-[10px] font-bold shadow-sm", trendPositive ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-rose-100 bg-rose-50 text-rose-600")}>
                        {trendPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        <span className="whitespace-nowrap">{Math.abs(trend).toLocaleString("id-ID", { maximumFractionDigits: 1 })}% vs bln lalu</span>
                    </span>
                </div>
            </div>

            <div className="relative z-10 mb-3 h-px bg-gradient-to-r from-transparent via-slate-100 to-transparent" />

            <div className="relative z-10 flex-1" style={{ overflow: "visible" }}>
                <FinanceInteractiveRevenueChart data={data} monthLabel={MONTH_SHORT[period.month]} currentDayInMonth={currentDay} />
            </div>
        </section>
    );
}

function FinanceInteractiveRevenueChart({ data, monthLabel, currentDayInMonth }: { data: number[]; monthLabel: string; currentDayInMonth: number }) {
    const detailWindowSize = 10;
    const chartData = data && data.length > 0 ? data : Array(30).fill(0);
    const totalDays = chartData.length;
    const [winStart, setWinStart] = useState(() => Math.max(0, totalDays - detailWindowSize));
    const [viewMode, setViewMode] = useState<"month" | "detail">("month");
    const [activeIdx, setActiveIdx] = useState<number | null>(null);
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const [jumpDay, setJumpDay] = useState("");
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => setIsLoaded(true), 180);
        return () => window.clearTimeout(timer);
    }, []);

    const elapsedData = getElapsedMonthRevenue(chartData, currentDayInMonth);
    const maxGlobal = Math.max(...chartData, 1000);
    const avgGlobal = elapsedData.length > 0 ? elapsedData.reduce((sum, value) => sum + value, 0) / elapsedData.length : 0;
    const peakValue = Math.max(...elapsedData, 0);
    const peakIdx = peakValue > 0 ? chartData.indexOf(peakValue) : -1;
    const activeDays = elapsedData.filter((value) => value > 0).length;
    const fullMonth = viewMode === "month";
    const effectiveWindowSize = fullMonth ? totalDays : Math.min(detailWindowSize, totalDays);
    const chartStart = fullMonth ? 0 : winStart;
    const winEnd = fullMonth ? totalDays : Math.min(winStart + effectiveWindowSize, totalDays);
    const windowData = chartData.slice(chartStart, winEnd);
    const canPrev = !fullMonth && winStart > 0;
    const canNext = !fullMonth && winEnd < totalDays;
    const maxStart = Math.max(0, totalDays - detailWindowSize);
    const thumbPct = totalDays > 0 ? (detailWindowSize / totalDays) * 100 : 100;
    const thumbLeft = maxStart > 0 ? (winStart / totalDays) * 100 : 0;
    const avgLinePct = maxGlobal > 0 ? (avgGlobal / maxGlobal) * 100 : 0;
    const avgLineBottom = `calc(${avgLinePct}% + 1px)`;

    const slide = (direction: -1 | 1) => {
        setWinStart((start) => {
            const next = start + direction * Math.ceil(detailWindowSize / 2);
            return Math.max(0, Math.min(totalDays - detailWindowSize, next));
        });
        setActiveIdx(null);
        setHoverIdx(null);
    };

    const jumpTo = () => {
        const day = parseInt(jumpDay, 10);
        if (Number.isNaN(day) || day < 1 || day > totalDays) return;
        const index = day - 1;
        const nextStart = Math.min(Math.max(0, index - Math.floor(detailWindowSize / 2)), Math.max(0, totalDays - detailWindowSize));
        setWinStart(nextStart);
        setViewMode("detail");
        setActiveIdx(index);
        setHoverIdx(null);
        setJumpDay("");
    };

    const bars = windowData.map((value, localIdx) => {
        const globalIdx = chartStart + localIdx;
        const rawHeight = maxGlobal > 0 ? (value / maxGlobal) * 100 : 0;
        const heightPct = value > 0 ? Math.max(rawHeight, 4) : 1.5;
        const day = globalIdx + 1;
        const tooltipAlign = fullMonth
            ? day <= 3 ? "left" : day >= 21 ? "right" : "center"
            : localIdx <= 1 ? "left" : localIdx >= windowData.length - 2 ? "right" : "center";

        return {
            value,
            localIdx,
            globalIdx,
            heightPct,
            day,
            isPeak: globalIdx === peakIdx,
            isAboveAvg: value > avgGlobal && globalIdx !== peakIdx,
            isActive: globalIdx === activeIdx,
            isHovered: globalIdx === hoverIdx,
            tooltipAlign,
        };
    });

    return (
        <div className="flex w-full select-none flex-col gap-3 font-bdo" style={{ overflow: "visible" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                    {([{ key: "month", label: "Bulan" }, { key: "detail", label: "10 Hari" }] as const).map((option) => (
                        <button key={option.key} type="button" onClick={() => { setViewMode(option.key); setActiveIdx(null); setHoverIdx(null); }} className={cn("rounded-lg px-3 py-1.5 font-bdo text-[10px] font-bold uppercase tracking-wider transition-all", viewMode === option.key ? "bg-white text-[#B93D2A] shadow-sm ring-1 ring-[#FFD5CD]" : "text-slate-400 hover:text-slate-700")}>
                            {option.label}
                        </button>
                    ))}
                </div>
                <span className="font-bdo text-[10px] font-medium text-slate-400">{fullMonth ? `${totalDays} hari dalam satu tampilan` : `Tgl ${chartStart + 1}-${winEnd}`}</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {[
                    { label: "Hari Puncak", value: peakIdx >= 0 ? `Tgl ${peakIdx + 1}` : "-", accent: "text-[#E35336]", bg: "border-[#FFD5CD] bg-[#FFF1EE]" },
                    { label: "Rata-rata", value: formatChartRevenue(Math.round(avgGlobal)), accent: "text-slate-800", bg: "border-slate-100 bg-slate-50" },
                    { label: "Hari Aktif", value: `${activeDays} hari`, accent: "text-emerald-600", bg: "border-emerald-100 bg-emerald-50" },
                ].map((stat) => (
                    <div key={stat.label} className={cn("rounded-xl border px-2.5 py-1.5", stat.bg)}>
                        <p className="mb-0.5 font-bdo text-[9px] font-bold uppercase tracking-widest text-slate-400">{stat.label}</p>
                        <p className={cn("font-clash text-sm font-bold", stat.accent)}>{stat.value}</p>
                    </div>
                ))}
            </div>

            {activeIdx !== null && (
                <div className="animate-scale-in flex items-center justify-between gap-3 rounded-2xl border border-[#F8B5A8] bg-[#FFF1EE] px-3.5 py-2.5">
                    <div>
                        <p className="font-bdo text-[9px] font-bold uppercase tracking-widest text-[#E35336]/80">Detail Hari</p>
                        <p className="font-clash text-sm font-bold text-slate-900">{formatRupiah(chartData[activeIdx])}</p>
                    </div>
                    <div className="text-right">
                        <p className="font-bdo text-[9px] uppercase tracking-wide text-slate-500">{activeIdx + 1} {monthLabel}</p>
                        <p className={cn("mt-0.5 font-bdo text-[10px] font-bold", chartData[activeIdx] > avgGlobal ? "text-emerald-600" : chartData[activeIdx] === 0 ? "text-slate-400" : "text-rose-500")}>
                            {chartData[activeIdx] > avgGlobal ? "di atas rata-rata" : chartData[activeIdx] === 0 ? "tidak ada transaksi" : "di bawah rata-rata"}
                        </p>
                    </div>
                    <button type="button" onClick={() => setActiveIdx(null)} className="ml-auto shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-[#FFD5CD] hover:text-slate-700" aria-label="Tutup detail hari">
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}

            <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50/60 p-3" style={{ overflow: "visible", position: "relative" }}>
                <div className="flex min-w-0 gap-2" style={{ overflow: "visible" }}>
                    <div className="flex shrink-0 flex-col justify-between pb-7 text-right" style={{ width: 34 }}>
                        <span className="font-bdo text-[9px] font-medium text-slate-300">{formatChartRevenue(maxGlobal)}</span>
                        <span className="font-bdo text-[9px] font-medium text-slate-300">{formatChartRevenue(Math.round(maxGlobal * 0.5))}</span>
                        <span className="font-bdo text-[9px] font-medium text-slate-200">0</span>
                    </div>

                    <div className="min-w-0 flex-1" style={{ overflow: "visible", position: "relative" }}>
                        <div style={{ height: 112, position: "relative", overflow: "visible" }}>
                            <div className="pointer-events-none absolute inset-x-0" style={{ top: 0, bottom: 0 }}>
                                <div className="absolute inset-x-0" style={{ top: 0, borderTop: "1px dashed #f1f5f9" }} />
                                <div className="absolute inset-x-0" style={{ top: "50%", borderTop: "1px dashed #f1f5f9" }} />
                                <div className="absolute inset-x-0" style={{ bottom: 0, borderTop: "1px solid #e2e8f0" }} />
                            </div>

                            {avgGlobal > 0 && (
                                <div className="pointer-events-none absolute inset-x-0" style={{ bottom: avgLineBottom, borderTop: "2px dashed rgba(227,83,54,.72)", filter: "drop-shadow(0 1px 2px rgba(227,83,54,.22))", zIndex: 20 }}>
                                    <span className="absolute whitespace-nowrap font-bdo text-[8px] font-bold" style={{ right: 0, top: -15, background: "#FFF1EE", color: "#E35336", padding: "2px 5px", borderRadius: 6, lineHeight: 1.4, border: "1px solid #FFD5CD", boxShadow: "0 4px 10px rgba(227,83,54,.12)" }}>
                                        avg {formatChartRevenue(Math.round(avgGlobal))}
                                    </span>
                                </div>
                            )}

                            <div className={cn("flex min-w-0 items-end", fullMonth ? "gap-px" : "gap-1.5")} style={{ height: "100%", overflow: "visible", position: "relative" }}>
                                {bars.map((bar) => (
                                    <button key={bar.globalIdx} type="button" className="relative flex min-w-0 flex-1 cursor-pointer flex-col items-stretch justify-end text-left" style={{ height: "100%", overflow: "visible" }} onClick={() => setActiveIdx(bar.isActive ? null : bar.globalIdx)} onMouseEnter={() => setHoverIdx(bar.globalIdx)} onMouseLeave={() => setHoverIdx(null)} aria-label={`Pendapatan tanggal ${bar.day}`}>
                                        <div className={cn("pointer-events-none absolute z-30 w-max transition-opacity duration-150", bar.isActive || bar.isHovered ? "animate-scale-in opacity-100" : "opacity-0")} style={{ bottom: `${bar.heightPct}%`, ...(bar.tooltipAlign === "left" ? { left: 0, transform: "translateY(-10px)" } : bar.tooltipAlign === "right" ? { right: 0, transform: "translateY(-10px)" } : { left: "50%", transform: "translateX(-50%) translateY(-10px)" }) }}>
                                            <div className="overflow-hidden rounded-xl ring-2 ring-[#F08C78]" style={{ minWidth: 142, background: "#fff", boxShadow: "0 12px 30px rgba(227,83,54,.22), 0 2px 8px rgba(15,23,42,.10)" }}>
                                                <div className="flex items-center gap-1.5 px-3 py-1.5" style={{ background: "linear-gradient(90deg,#E35336,#B93D2A)" }}>
                                                    <LiveDot size="xs" color="#ffffff" halo="rgba(255,255,255,.3)" />
                                                    <p className="whitespace-nowrap font-bdo text-[9px] font-bold uppercase tracking-widest text-white">{bar.day} {monthLabel}</p>
                                                </div>
                                                <div className="px-3 py-2.5">
                                                    <p className="whitespace-nowrap font-clash text-sm font-bold text-slate-950">{formatRupiah(bar.value)}</p>
                                                    <p className="mt-0.5 font-bdo text-[9px] font-bold uppercase tracking-wider text-[#E35336]">Detail pendapatan</p>
                                                </div>
                                            </div>
                                        </div>

                                        {bar.isPeak && isLoaded && (
                                            <div className="pointer-events-none absolute font-bdo text-[9px] font-bold text-[#E35336]" style={{ bottom: `calc(${bar.heightPct}% + 4px)`, left: "50%", transform: "translateX(-50%)", lineHeight: 1, zIndex: 4 }}>
                                                Peak
                                            </div>
                                        )}

                                        <div className="rev-bar w-full rounded-t-[5px]" style={{ height: isLoaded ? `${bar.heightPct}%` : "0%", transition: `height .65s cubic-bezier(.16,1,.3,1) ${bar.localIdx * 38}ms, filter .15s`, background: bar.isPeak ? "linear-gradient(180deg,#EA684F 0%,#8F2E20 100%)" : bar.isAboveAvg ? "linear-gradient(180deg,#F08C78 0%,#E35336 100%)" : "linear-gradient(180deg,#e2e8f0 0%,#cbd5e1 100%)", boxShadow: bar.isPeak ? "0 0 16px rgba(227,83,54,.4), inset 0 1px 0 rgba(255,255,255,.25)" : bar.isAboveAvg ? "0 0 6px rgba(227,83,54,.18)" : "none", outline: bar.isActive ? "2px solid #E35336" : "none", outlineOffset: "2px" }} />
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className={cn("mt-2 flex min-w-0", fullMonth ? "gap-px" : "gap-1.5")}>
                            {bars.map((bar) => {
                                const showLabel = !fullMonth || bar.day === 1 || bar.day === totalDays || bar.day % 5 === 0 || bar.isActive || bar.isHovered || bar.globalIdx === peakIdx;
                                return (
                                    <div key={bar.globalIdx} className="min-w-0 flex-1 text-center">
                                        <span className={cn("block truncate font-bdo", fullMonth ? "text-[7px] sm:text-[8px]" : "text-[9px]")} style={{ fontWeight: bar.globalIdx === peakIdx || bar.isActive ? 700 : 500, color: bar.isActive ? "#B93D2A" : bar.globalIdx === peakIdx ? "#E35336" : "#94a3b8", opacity: showLabel ? 1 : 0 }}>
                                            {showLabel ? bar.day : ""}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="mt-3 flex items-center gap-3 border-t border-slate-100/80 pt-3">
                    {[
                        { color: "linear-gradient(135deg,#EA684F,#8F2E20)", label: "Puncak" },
                        { color: "linear-gradient(135deg,#F08C78,#E35336)", label: "Di atas avg" },
                        { color: "linear-gradient(135deg,#e2e8f0,#cbd5e1)", label: "Normal" },
                    ].map((legend) => (
                        <div key={legend.label} className="flex items-center gap-1.5">
                            <div className="h-2.5 w-2.5 rounded-[3px]" style={{ background: legend.color }} />
                            <span className="font-bdo text-[9px] text-slate-400">{legend.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className={cn("flex items-center gap-2", fullMonth && "opacity-60")}>
                <button type="button" onClick={() => slide(-1)} disabled={!canPrev} className={cn("chart-nav-btn", canPrev ? "enabled" : "disabled")} title="Periode sebelumnya">
                    <ChevronLeft className="h-4 w-4" />
                </button>

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex justify-between px-0.5">
                        <span className="font-bdo text-[9px] text-slate-400">Tgl {chartStart + 1}</span>
                        <span className="font-bdo text-[9px] font-bold text-[#E35336]/70">{monthLabel}</span>
                        <span className="font-bdo text-[9px] text-slate-400">Tgl {winEnd}</span>
                    </div>
                    <div className="scrubber-track" onClick={(event) => { if (fullMonth) setViewMode("detail"); const rect = event.currentTarget.getBoundingClientRect(); const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)); setWinStart(Math.round(pct * maxStart)); setActiveIdx(null); setHoverIdx(null); }}>
                        <div className="scrubber-thumb" style={{ left: `${thumbLeft}%`, width: `${thumbPct}%` }} />
                    </div>
                </div>

                <button type="button" onClick={() => slide(1)} disabled={!canNext} className={cn("chart-nav-btn", canNext ? "enabled" : "disabled")} title="Periode berikutnya">
                    <ChevronRight className="h-4 w-4" />
                </button>

                <div className="flex shrink-0 items-center gap-1">
                    <input type="number" min={1} max={totalDays} value={jumpDay} onChange={(event) => setJumpDay(event.target.value)} onKeyDown={(event) => event.key === "Enter" && jumpTo()} placeholder="Tgl" className="jump-input" />
                    <button type="button" onClick={jumpTo} className="jump-go-btn">Go</button>
                </div>
            </div>
        </div>
    );
}

interface InsightBar {
    label: string;
    value: number;
    meta: string;
    onClick?: () => void;
}

function FinanceInsightGrid({ monthlyRevenue, activeMonth, year, facilityRevenue, membershipPlanRevenue }: { monthlyRevenue: number[]; activeMonth: number; year: number; facilityRevenue: BreakdownRow[]; membershipPlanRevenue: BreakdownRow[] }) {
    const annualBars = monthlyRevenue.map((value, index) => ({
        label: MONTH_SHORT[index + 1],
        value,
        meta: MONTH_NAMES[index + 1],
        onClick: () => router.get(route("admin.finance.index"), { month: index + 1, year }, { preserveScroll: true, preserveState: false }),
    }));
    const reservationBars = facilityRevenue.slice(0, 8).map((row) => ({ label: row.name, value: row.revenue, meta: `${row.count} trx` }));
    const membershipBars = membershipPlanRevenue.slice(0, 8).map((row) => ({ label: row.name, value: row.revenue, meta: `${row.count} trx` }));

    return (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <InsightBarCard title="Pendapatan Tahunan" subtitle={`Grafik bulanan ${year}`} bars={annualBars} activeLabel={MONTH_SHORT[activeMonth]} icon={<TrendingUp size={17} />} variant="paper" delay="delay-250" />
            <InsightBarCard title="Reservasi" subtitle="Bar revenue per fasilitas" bars={reservationBars} icon={<LayoutGrid size={17} />} variant="ember" delay="delay-300" />
            <InsightBarCard title="Membership" subtitle="Bar revenue per paket" bars={membershipBars} icon={<CreditCard size={17} />} variant="mint" delay="delay-400" />
        </section>
    );
}

function InsightBarCard({ title, subtitle, bars, activeLabel, icon, variant, delay }: { title: string; subtitle: string; bars: InsightBar[]; activeLabel?: string; icon: ReactNode; variant: "paper" | "ember" | "mint"; delay: string }) {
    const max = maxValue(bars.map((bar) => bar.value));
    const total = bars.reduce((sum, bar) => sum + bar.value, 0);
    const top = bars.reduce<InsightBar | null>((leader, bar) => (!leader || bar.value > leader.value ? bar : leader), null);
    const palette = {
        paper: {
            card: "border-slate-200/80 bg-white shadow-sm",
            rail: "bg-slate-100",
            bar: "linear-gradient(180deg,#EA684F 0%,#B93D2A 100%)",
            chip: "border-[#F8B5A8]/70 bg-[#FFF7F5] text-[#B93D2A]",
        },
        ember: {
            card: "border-[#F8B5A8]/70 bg-[#FFF7F5] shadow-[0_16px_38px_-32px_rgba(227,83,54,.58)]",
            rail: "bg-white",
            bar: "linear-gradient(180deg,#F08C78 0%,#E35336 58%,#B93D2A 100%)",
            chip: "border-[#F8B5A8] bg-white text-[#B93D2A]",
        },
        mint: {
            card: "border-emerald-100 bg-white shadow-[0_16px_38px_-32px_rgba(16,185,129,.48)]",
            rail: "bg-emerald-50",
            bar: "linear-gradient(180deg,#34d399 0%,#10b981 62%,#047857 100%)",
            chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
        },
    }[variant];

    return (
        <article className={cn("card-glint animate-fade-in-up relative overflow-hidden rounded-[22px] border p-4", palette.card, delay)}>
            <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                    <ShinyIcon className="h-9 w-9">{icon}</ShinyIcon>
                    <div className="min-w-0">
                        <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{subtitle}</p>
                        <h2 className="truncate font-clash text-base font-semibold text-slate-950">{title}</h2>
                    </div>
                </div>
                <span className={cn("shrink-0 rounded-full border px-3 py-1 font-bdo text-[11px] font-bold", palette.chip)}>{formatCompact(total)}</span>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2">
                <div className="rounded-[14px] border border-slate-100 bg-white/70 p-2.5">
                    <p className="font-bdo text-[9px] font-bold uppercase tracking-widest text-slate-400">Top</p>
                    <p className="mt-1 truncate font-clash text-sm font-bold text-slate-950">{top?.label ?? "-"}</p>
                </div>
                <div className="rounded-[14px] border border-slate-100 bg-white/70 p-2.5">
                    <p className="font-bdo text-[9px] font-bold uppercase tracking-widest text-slate-400">Nilai</p>
                    <p className="mt-1 truncate font-clash text-sm font-bold text-slate-950">{top ? formatCompact(top.value) : "-"}</p>
                </div>
            </div>

            <div className="finance-scrollbar overflow-x-auto pb-1">
                {bars.length === 0 ? (
                    <div className="rounded-[20px] border border-dashed border-slate-200 bg-white/70 p-8 text-center font-bdo text-sm font-semibold text-slate-400">Belum ada data pada periode ini.</div>
                ) : (
                    <div className="flex min-w-[390px] items-end gap-2">
                        {bars.map((bar, index) => {
                            const height = Math.max(10, Math.round((bar.value / max) * 118));
                            const active = activeLabel === bar.label;
                            const content = (
                                <>
                                    <div className={cn("flex h-[130px] w-full items-end rounded-[10px] px-1.5 py-1.5", palette.rail)}>
                                        <div className="rev-bar bar-grow w-full rounded-t-[5px]" style={{ height, background: active ? "linear-gradient(180deg,#0f172a,#334155)" : palette.bar, animationDelay: `${index * 45}ms` }} />
                                    </div>
                                    <span className={cn("mt-2 block max-w-full truncate font-bdo text-[10px] font-bold", active ? "text-slate-950" : "text-slate-400")}>{bar.label}</span>
                                </>
                            );

                            return bar.onClick ? (
                                <button key={`${bar.label}-${index}`} type="button" onClick={bar.onClick} className="group min-w-0 flex-1 rounded-[14px] p-1.5 text-center transition hover:bg-white/70" title={`${bar.meta}: ${formatRupiah(bar.value)}`}>
                                    {content}
                                </button>
                            ) : (
                                <div key={`${bar.label}-${index}`} className="group min-w-0 flex-1 rounded-[14px] p-1.5 text-center" title={`${bar.meta}: ${formatRupiah(bar.value)}`}>
                                    {content}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </article>
    );
}

function RevenueMixPanel({ rows, stats }: { rows: TypeBreakdown[]; stats: FinanceStats }) {
    const fallbackRows: TypeBreakdown[] = rows.length > 0 ? rows : [
        { name: "Booking", type: "booking", revenue: stats.bookingRevenue, share: stats.totalRevenue > 0 ? Math.round((stats.bookingRevenue / stats.totalRevenue) * 100) : 0, color: "#E35336" },
        { name: "Membership", type: "membership", revenue: stats.membershipRevenue, share: stats.totalRevenue > 0 ? Math.round((stats.membershipRevenue / stats.totalRevenue) * 100) : 0, color: "#10B981" },
    ];
    const total = fallbackRows.reduce((sum, row) => sum + row.revenue, 0);
    const booking = fallbackRows.find((row) => row.type === "booking");
    const membership = fallbackRows.find((row) => row.type === "membership");

    return (
        <section className="card-glint animate-fade-in-up delay-250 overflow-hidden rounded-[22px] border border-[#FFE0D8] bg-[linear-gradient(135deg,#ffffff_0%,#fff7f4_60%,#f8fafc_100%)] p-4 shadow-[0_18px_42px_-36px_rgba(185,61,42,.48)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                    <ShinyIcon className="h-10 w-10">
                        <PieChart size={17} />
                    </ShinyIcon>
                    <div className="min-w-0">
                        <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.16em] text-[#B93D2A]/70">Revenue split</p>
                        <h2 className="font-clash text-lg font-semibold leading-tight text-slate-950">Booking dan Membership</h2>
                        <p className="mt-1 font-bdo text-xs font-semibold text-slate-500">Finance bisa langsung membaca kontribusi setiap sumber pendapatan.</p>
                    </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[560px]">
                    <RevenueMixStat label="Total" value={formatCompact(total)} accent="#0f172a" />
                    <RevenueMixStat label="Booking" value={booking ? formatCompact(booking.revenue) : "Rp 0"} accent="#E35336" share={booking?.share ?? 0} />
                    <RevenueMixStat label="Membership" value={membership ? formatCompact(membership.revenue) : "Rp 0"} accent="#10B981" share={membership?.share ?? 0} />
                </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-[18px] border border-white bg-white/72 p-2 shadow-sm">
                <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
                    {fallbackRows.map((row) => (
                        <div
                            key={row.type}
                            className="h-full transition-all"
                            style={{ width: `${Math.max(0, Math.min(100, row.share))}%`, background: `linear-gradient(90deg, ${row.color}, ${row.type === "membership" ? "#34d399" : "#F08C78"})` }}
                            title={`${row.name}: ${row.share}%`}
                        />
                    ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                    {fallbackRows.map((row) => (
                        <span key={row.type} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 font-bdo text-[10px] font-bold uppercase tracking-wide text-slate-600">
                            <span className="h-2 w-2 rounded-full" style={{ background: row.color }} />
                            {row.name} {row.share}%
                        </span>
                    ))}
                </div>
            </div>
        </section>
    );
}

function RevenueMixStat({ label, value, accent, share }: { label: string; value: string; accent: string; share?: number }) {
    return (
        <div className="rounded-[16px] border border-white bg-white/78 p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
                <p className="font-bdo text-[9px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
                {share !== undefined && <p className="font-bdo text-[10px] font-bold" style={{ color: accent }}>{share}%</p>}
            </div>
            <p className="mt-1 truncate font-clash text-base font-bold text-slate-950">{value}</p>
        </div>
    );
}

function BreakdownPanel({ title, subtitle, rows, icon, tone = "terracotta" }: { title: string; subtitle: string; rows: BreakdownRow[]; icon: ReactNode; tone?: "terracotta" | "emerald" }) {
    const total = rows.reduce((sum, row) => sum + row.revenue, 0);
    const transactions = rows.reduce((sum, row) => sum + row.count, 0);
    const leader = rows[0];
    const avgTransaction = transactions > 0 ? Math.round(total / transactions) : 0;
    const topThreeShare = rows.slice(0, 3).reduce((sum, row) => sum + row.share, 0);
    const maxRevenue = maxValue(rows.map((row) => row.revenue));
    const accent = tone === "emerald" ? "#10B981" : "#E35336";
    const soft = tone === "emerald" ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-[#FFF1EE] border-[#FFD5CD] text-[#B93D2A]";

    return (
        <section className="card-glint animate-fade-in-up delay-300 overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-3.5">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <ShinyIcon className="h-9 w-9">{icon}</ShinyIcon>
                        <div className="min-w-0">
                            <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{subtitle}</p>
                            <h2 className="truncate font-clash text-base font-semibold text-slate-950">{title}</h2>
                        </div>
                    </div>
                    <span className={cn("hidden rounded-full border px-3 py-1 font-bdo text-[11px] font-bold sm:inline-flex", soft)}>{rows.length} item</span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
                    <BreakdownStat label="Total" value={formatCompact(total)} />
                    <BreakdownStat label="Transaksi" value={formatNumber(transactions)} />
                    <BreakdownStat label="Avg / trx" value={formatCompact(avgTransaction)} />
                    <BreakdownStat label="Top 3" value={`${Math.min(100, Math.round(topThreeShare))}%`} active color={accent} />
                </div>

                {leader && (
                    <div className={cn("mt-3 rounded-[16px] border p-3", soft)}>
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="font-bdo text-[9px] font-bold uppercase tracking-widest opacity-70">Kontributor terbesar</p>
                                <p className="mt-1 truncate font-clash text-base font-bold text-slate-950">{leader.name}</p>
                            </div>
                            <div className="text-right">
                                <p className="font-clash text-base font-bold text-slate-950">{formatCompact(leader.revenue)}</p>
                                <p className="font-bdo text-[10px] font-bold opacity-80">{leader.share}% dari total</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="finance-scrollbar max-h-[360px] space-y-2.5 overflow-y-auto p-3.5">
                {rows.length === 0 ? (
                    <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-6 text-center font-bdo text-sm font-semibold text-slate-400">Belum ada data pada periode ini.</div>
                ) : rows.map((row, index) => {
                    const avg = row.count > 0 ? Math.round(row.revenue / row.count) : 0;
                    const barWidth = Math.max(4, Math.round((row.revenue / maxRevenue) * 100));
                    return (
                        <article key={`${row.name}-${index}`} className="rounded-[18px] border border-slate-100 bg-slate-50/70 p-3 transition hover:border-[#F8B5A8] hover:bg-white hover:shadow-sm">
                            <div className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-3">
                                <span className="flex h-8 w-8 items-center justify-center rounded-[12px] bg-white font-clash text-xs font-bold text-slate-500 ring-1 ring-slate-100">{index + 1}</span>
                                <div className="min-w-0">
                                    <p className="truncate font-clash text-sm font-semibold text-slate-950">{row.name}</p>
                                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                                        <BreakdownMicro label="Share" value={`${row.share}%`} />
                                        <BreakdownMicro label="Trx" value={formatNumber(row.count)} />
                                        <BreakdownMicro label="Avg" value={formatCompact(avg)} />
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-clash text-sm font-semibold text-slate-950">{formatCompact(row.revenue)}</p>
                                    <p className="mt-1 font-bdo text-[10px] font-bold" style={{ color: accent }}>{formatRupiah(row.revenue)}</p>
                                </div>
                            </div>
                            <div className="mt-3 h-3 overflow-hidden rounded-[6px] bg-white ring-1 ring-slate-100">
                                <div className="progress-fill h-full rounded-[6px]" style={{ width: `${barWidth}%`, background: `linear-gradient(90deg, ${row.color}, ${accent})` }} />
                            </div>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}

function BreakdownStat({ label, value, active = false, color = "#E35336" }: { label: string; value: string; active?: boolean; color?: string }) {
    return (
        <div className={cn("rounded-[16px] border p-2.5", active ? "bg-white" : "border-slate-100 bg-slate-50")}>
            <p className="font-bdo text-[9px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
            <p className="mt-1 truncate font-clash text-sm font-bold text-slate-950" style={active ? { color } : undefined}>{value}</p>
        </div>
    );
}

function BreakdownMicro({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0 rounded-[10px] bg-white px-2 py-1 ring-1 ring-slate-100">
            <p className="font-bdo text-[8px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
            <p className="truncate font-bdo text-[10px] font-bold text-slate-700">{value}</p>
        </div>
    );
}

function LedgerTable({ rows, search, setSearch, typeFilter, setTypeFilter, statusFilter, setStatusFilter }: { rows: LedgerRow[]; search: string; setSearch: (value: string) => void; typeFilter: LedgerTypeFilter; setTypeFilter: (value: LedgerTypeFilter) => void; statusFilter: LedgerStatusFilter; setStatusFilter: (value: LedgerStatusFilter) => void }) {
    const paidRows = rows.filter((row) => row.payment_status === "PAID");
    const attentionRows = rows.filter((row) => row.payment_status !== "PAID");
    const paidAmount = paidRows.reduce((sum, row) => sum + row.amount, 0);
    const attentionAmount = attentionRows.reduce((sum, row) => sum + row.amount, 0);
    const bookingRows = rows.filter((row) => row.type === "booking").length;
    const membershipRows = rows.filter((row) => row.type === "membership").length;

    return (
        <section className="card-glint animate-fade-in-up delay-400 overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm">
            <div className="relative overflow-hidden border-b border-slate-100 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_58%,#FFF1EE_100%)] p-3.5 sm:p-4">
                <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-[#F8B5A8]/25 blur-3xl" />
                <div className="relative z-10 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <ShinyIcon className="h-10 w-10">
                            <ReceiptText size={18} />
                        </ShinyIcon>
                        <div className="min-w-0">
                            <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Ledger transaksi lengkap</p>
                            <h2 className="font-clash text-base font-semibold leading-tight text-slate-950">Rekonsiliasi dan Invoice</h2>
                            <p className="mt-1 max-w-2xl font-bdo text-[11px] font-medium leading-relaxed text-slate-500">
                                {rows.length} transaksi tampil sesuai filter, dengan nominal lunas dan transaksi yang perlu perhatian langsung terlihat.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[580px]">
                        <LedgerSummaryStat label="Lunas" value={formatRupiah(paidAmount)} detail={`${paidRows.length} trx`} tone="emerald" />
                        <LedgerSummaryStat label="Perhatian" value={formatRupiah(attentionAmount)} detail={`${attentionRows.length} trx`} tone="rose" />
                        <LedgerSummaryStat label="Booking" value={formatNumber(bookingRows)} detail="reservasi" tone="terracotta" />
                        <LedgerSummaryStat label="Member" value={formatNumber(membershipRows)} detail="membership" tone="sky" />
                    </div>
                </div>

                <div className="finance-no-print relative z-10 mt-3 grid gap-2 rounded-[20px] border border-white bg-white/78 p-2 shadow-[0_16px_34px_-30px_rgba(15,23,42,.38)] backdrop-blur sm:grid-cols-[minmax(220px,1fr)_minmax(135px,160px)_minmax(135px,160px)]">
                    <label className="relative">
                        <span className="sr-only">Cari transaksi</span>
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari invoice, customer, fasilitas..." className="h-10 w-full rounded-[15px] border border-slate-200 bg-slate-50 pl-10 pr-10 font-bdo text-sm font-semibold text-slate-700 outline-none transition focus:border-[#F08C78] focus:bg-white focus:ring-2 focus:ring-[#FFD5CD]" />
                        {search && (
                            <button type="button" onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Hapus pencarian">
                                <X size={13} />
                            </button>
                        )}
                    </label>
                    <FilterSelect label="Filter tipe transaksi" value={typeFilter} onChange={(value) => setTypeFilter(value as LedgerTypeFilter)}>
                        <option value="all">Semua tipe</option>
                        <option value="booking">Booking</option>
                        <option value="membership">Membership</option>
                        <option value="other">Lainnya</option>
                    </FilterSelect>
                    <FilterSelect label="Filter status pembayaran" value={statusFilter} onChange={(value) => setStatusFilter(value as LedgerStatusFilter)}>
                        <option value="all">Semua status</option>
                        <option value="PAID">Lunas</option>
                        <option value="UNPAID">Belum bayar</option>
                        <option value="FAILED">Gagal</option>
                        <option value="EXPIRED">Expired</option>
                    </FilterSelect>
                </div>
            </div>

            <div className="hidden md:block">
                <div className="finance-scrollbar max-h-[500px] overflow-auto">
                    <table className="w-full min-w-[1120px] border-separate border-spacing-0">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-slate-50/95 text-left backdrop-blur">
                                {["Invoice", "Tanggal", "Customer", "Tipe", "Detail", "Status", "Nominal", "Xendit"].map((header) => (
                                    <th key={header} className="border-b border-slate-100 px-4 py-2.5 font-bdo text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{header}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center font-bdo text-sm font-medium text-slate-400">Tidak ada transaksi yang cocok dengan filter.</td>
                                </tr>
                            ) : rows.map((row) => (
                                <tr key={row.id} className="group transition hover:bg-[#FFF1EE]/45">
                                    <td className="border-b border-slate-100 px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <span className="flex h-9 w-9 items-center justify-center rounded-[13px] border border-slate-100 bg-slate-50 text-slate-500 transition group-hover:border-[#F8B5A8] group-hover:bg-white group-hover:text-[#B93D2A]">
                                                <FileText size={15} />
                                            </span>
                                            <div>
                                                <p className="font-clash text-sm font-semibold text-slate-900">{row.receipt_number}</p>
                                                <p className="mt-0.5 font-bdo text-[11px] font-medium text-slate-400">#{row.id}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="border-b border-slate-100 px-4 py-3 font-bdo text-xs font-semibold text-slate-600">{row.paid_at ?? row.created_at ?? "-"}</td>
                                    <td className="border-b border-slate-100 px-4 py-3">
                                        <p className="max-w-[180px] truncate font-clash text-sm font-semibold text-slate-900">{row.customer_name}</p>
                                    </td>
                                    <td className="border-b border-slate-100 px-4 py-3"><TypeBadge type={row.type} /></td>
                                    <td className="border-b border-slate-100 px-4 py-3">
                                        <p className="max-w-[240px] truncate font-bdo text-sm font-semibold text-slate-700">{row.subject}</p>
                                    </td>
                                    <td className="border-b border-slate-100 px-4 py-3"><PaymentBadge status={row.payment_status} /></td>
                                    <td className="border-b border-slate-100 px-4 py-3 text-right">
                                        <p className="font-clash text-sm font-bold text-slate-950">{formatRupiah(row.amount)}</p>
                                        <p className="mt-0.5 font-bdo text-[10px] font-bold text-slate-400">{row.payment_status === "PAID" ? "settled" : "open"}</p>
                                    </td>
                                    <td className="border-b border-slate-100 px-4 py-3">
                                        <span className="block max-w-[170px] truncate font-bdo text-xs font-semibold text-slate-400">{row.invoice_id ?? "-"}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="finance-scrollbar max-h-[560px] space-y-3 overflow-y-auto p-3.5 md:hidden">
                {rows.length === 0 ? (
                    <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-6 text-center font-bdo text-sm font-semibold text-slate-400">Tidak ada transaksi yang cocok dengan filter.</div>
                ) : rows.map((row) => (
                    <article key={row.id} className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-100 bg-slate-50/80 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate font-clash text-sm font-semibold text-slate-950">{row.customer_name}</p>
                                    <p className="mt-1 font-bdo text-[11px] font-semibold text-slate-400">{row.receipt_number}</p>
                                </div>
                                <PaymentBadge status={row.payment_status} />
                            </div>
                            <p className="mt-3 break-words font-clash text-xl font-bold leading-tight text-slate-950">{formatRupiah(row.amount)}</p>
                        </div>
                        <div className="p-4">
                            <p className="font-bdo text-xs font-semibold text-slate-600">{row.subject}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <TypeBadge type={row.type} />
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-bdo text-[11px] font-bold text-slate-500">{row.paid_at ?? row.created_at ?? "-"}</span>
                            </div>
                            <p className="mt-3 truncate font-bdo text-[11px] font-semibold text-slate-400">Xendit: {row.invoice_id ?? "-"}</p>
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}

function LedgerSummaryStat({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "emerald" | "rose" | "terracotta" | "sky" }) {
    const style = {
        emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
        rose: "border-rose-100 bg-rose-50 text-rose-600",
        terracotta: "border-[#F8B5A8] bg-[#FFF1EE] text-[#B93D2A]",
        sky: "border-sky-100 bg-sky-50 text-sky-700",
    }[tone];

    return (
        <div className={cn("min-w-0 rounded-[16px] border p-2.5", style)}>
            <p className="font-bdo text-[9px] font-bold uppercase tracking-widest opacity-70">{label}</p>
            <p className="mt-1 break-words font-clash text-sm font-bold leading-tight text-slate-950">{value}</p>
            <p className="mt-1 font-bdo text-[10px] font-bold opacity-80">{detail}</p>
        </div>
    );
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
    return (
        <label className="relative">
            <span className="sr-only">{label}</span>
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select aria-label={label} title={label} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-[15px] border border-slate-200 bg-slate-50 pl-9 pr-3 font-bdo text-sm font-bold text-slate-600 outline-none transition focus:border-[#F08C78] focus:ring-2 focus:ring-[#FFD5CD]">
                {children}
            </select>
        </label>
    );
}

function TypeBadge({ type }: { type: LedgerRow["type"] }) {
    return (
        <span className="rounded-full border border-[#F8B5A8]/70 bg-[#FFF1EE] px-3 py-1 font-bdo text-[11px] font-bold text-[#B93D2A]">
            {type === "booking" ? "Booking" : type === "membership" ? "Membership" : "Lainnya"}
        </span>
    );
}

function FinancePrintTemplate({ stats, dailyRevenue, revenueTrend, period }: { stats: FinanceStats; dailyRevenue: number[]; revenueTrend: number; period: { month: number; year: number } }) {
    const periodLabel = `${MONTH_NAMES[period.month]} ${period.year}`;
    const activeDays = dailyRevenue.filter((value) => value > 0).length;
    const totalDaily = dailyRevenue.reduce((sum, value) => sum + value, 0);
    const avgRevenue = activeDays > 0 ? Math.round(totalDaily / activeDays) : 0;
    const peakRevenue = Math.max(0, ...dailyRevenue);
    const peakDay = peakRevenue > 0 ? dailyRevenue.findIndex((value) => value === peakRevenue) + 1 : 0;
    const trendSign = revenueTrend >= 0 ? "+" : "";
    const now = new Date();
    const dateStr = now.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
    const rows = [
        { kategori: "Keuangan", detail: "Total Pendapatan Periode", satuan: periodLabel, nilai: formatRupiah(stats.totalRevenue) },
        { kategori: "Keuangan", detail: "Pendapatan Reservasi", satuan: "booking", nilai: formatRupiah(stats.bookingRevenue) },
        { kategori: "Keuangan", detail: "Pendapatan Membership", satuan: "membership", nilai: formatRupiah(stats.membershipRevenue) },
        { kategori: "Keuangan", detail: "Rata-rata Pendapatan Harian", satuan: `${activeDays} hari aktif`, nilai: formatRupiah(avgRevenue) },
        { kategori: "Keuangan", detail: `Puncak Pendapatan${peakDay ? ` (Tgl ${peakDay})` : ""}`, satuan: peakDay ? "1 hari" : "-", nilai: formatRupiah(peakRevenue) },
        { kategori: "Trend", detail: "Perubahan vs Bulan Lalu", satuan: "MoM", nilai: `${trendSign}${revenueTrend}%` },
        { kategori: "Operasional", detail: "Total Reservasi Bulan Ini", satuan: "transaksi", nilai: formatNumber(stats.totalBookings ?? 0) },
        { kategori: "Operasional", detail: "Membership Aktif", satuan: "anggota", nilai: formatNumber(stats.activeMemberships ?? 0) },
    ];

    return (
        <div className="print-finance-template">
            <div className="prt-a4-page">
                <div className="prt-header">
                    <div className="prt-header-left">
                        <img src="/BES.png" alt="Brawijaya Edusport" className="prt-logo-img" />
                    </div>
                    <div className="prt-header-right">
                        <p className="prt-company-name-main">BRAWIJAYA EDUSPORT</p>
                        <p className="prt-company-name-sub">PT BRAWIJAYA MULTI USAHA</p>
                        <div className="prt-company-address">
                            Jln. Terusan Cibogo No.1 Kota Malang<br />
                            NPWP 3295.65.312
                        </div>
                        <hr className="prt-header-divider" />
                        <p className="prt-doc-title">LAPORAN KEUANGAN</p>
                    </div>
                </div>

                <div className="prt-meta-outer">
                    <div className="prt-meta-left">
                        Laporan ini merangkum pendapatan reservasi fasilitas dan membership gym pada periode terpilih.
                        <div className="prt-payment-note">
                            Pembayaran melalui Bank Mandiri<br />
                            144-0-02487884-2<br />
                            An Brawijaya Multi Usaha
                        </div>
                    </div>
                    <div className="prt-meta-right">
                        <table>
                            <tbody>
                                <tr><td className="meta-label-col">Tanggal</td><td className="meta-value-col">{dateStr}</td></tr>
                                <tr><td className="meta-label-col">Nomor</td><td className="meta-value-col meta-value-bold">KEUANGAN/{period.year}/{String(period.month).padStart(2, "0")}</td></tr>
                                <tr><td className="meta-label-col">Periode</td><td className="meta-value-col">{periodLabel}</td></tr>
                                <tr><td className="meta-label-col">Hari Aktif</td><td className="meta-value-col">{activeDays} hari</td></tr>
                                <tr><td className="meta-label-col">Trend Bulan Ini</td><td className="meta-value-col">{trendSign}{revenueTrend}%</td></tr>
                                <tr><td className="meta-label-col">Mata Uang</td><td className="meta-value-col">Indonesian Rupiah</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <table className="prt-report-table">
                    <thead>
                        <tr>
                            <th style={{ width: "32pt" }}>No.</th>
                            <th style={{ width: "74pt" }}>Kategori</th>
                            <th>Keterangan / Detail</th>
                            <th style={{ width: "86pt" }}>Satuan</th>
                            <th style={{ width: "94pt" }}>Nilai</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => (
                            <tr key={`${row.kategori}-${row.detail}`}>
                                <td className="rt-center">{index + 1}</td>
                                <td>{row.kategori}</td>
                                <td>{row.detail}</td>
                                <td className="rt-center">{row.satuan}</td>
                                <td className="rt-right rt-bold">{row.nilai}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="prt-bottom-row">
                    <div className="prt-keterangan">
                        <span className="prt-keterangan-label">KETERANGAN</span>
                        Data laporan diambil dari transaksi yang masuk pada periode {periodLabel}. Nilai pendapatan dihitung dari transaksi berstatus lunas. Pending, gagal, dan expired disajikan sebagai bahan rekonsiliasi finance.
                    </div>
                    <div className="prt-summary">
                        <table>
                            <tbody>
                                <tr><td>Booking</td><td>{formatRupiah(stats.bookingRevenue)}</td></tr>
                                <tr><td>Membership</td><td>{formatRupiah(stats.membershipRevenue)}</td></tr>
                                <tr><td>Pending/Gagal</td><td>{formatRupiah(stats.pendingFailedAmount)}</td></tr>
                                <tr className="sum-total"><td>Total</td><td>{formatRupiah(stats.totalRevenue)}</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="prt-page-footer">
                    <span>Halaman 1 dari 1</span>
                    <span>Laporan Keuangan - {periodLabel} - Brawijaya Edusport</span>
                    <span>Dicetak: {dateStr}</span>
                </div>
            </div>
        </div>
    );
}

function downloadFinanceCsv(rows: LedgerRow[], period: { month: number; year: number }) {
    const periodLabel = `${MONTH_NAMES[period.month]} ${period.year}`;
    const headers = [
        "No",
        "Periode",
        "Receipt Number",
        "Xendit Invoice ID",
        "Tanggal",
        "Customer",
        "Tipe Transaksi",
        "Detail",
        "Status Pembayaran",
        "Nominal",
        "Checkout URL",
    ];
    const escapeCell = (value: string | number | null) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
    const body = rows.map((row, index) => [
        index + 1,
        periodLabel,
        row.receipt_number,
        row.invoice_id,
        row.paid_at ?? row.created_at ?? "",
        row.customer_name,
        row.type === "booking" ? "Booking" : row.type === "membership" ? "Membership" : "Lainnya",
        row.subject,
        PAYMENT_LABEL[row.payment_status],
        row.amount,
        row.checkout_url,
    ].map(escapeCell).join(","));
    const csv = [
        headers.map(escapeCell).join(","),
        ...body,
        "",
        ["Ringkasan", periodLabel, "", "", "", "", "", "Total baris", rows.length, rows.reduce((sum, row) => sum + row.amount, 0), ""].map(escapeCell).join(","),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `UBSC-Finance-Ledger-${MONTH_NAMES[period.month]}-${period.year}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

export default function FinanceIndex() {
    const { stats, revenueTrend, dailyRevenue, monthlyRevenue, facilityRevenue, membershipPlanRevenue, typeBreakdown, ledger, period } = usePage<FinanceProps>().props;
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState<LedgerTypeFilter>("all");
    const [statusFilter, setStatusFilter] = useState<LedgerStatusFilter>("all");

    const filteredLedger = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return ledger.filter((row) => {
            const matchType = typeFilter === "all" || row.type === typeFilter;
            const matchStatus = statusFilter === "all" || row.payment_status === statusFilter;
            const matchSearch = !needle || [row.receipt_number, row.invoice_id ?? "", row.customer_name, row.subject, row.type, row.payment_status].join(" ").toLowerCase().includes(needle);
            return matchType && matchStatus && matchSearch;
        });
    }, [ledger, search, statusFilter, typeFilter]);

    return (
        <AdminLayout
            header={
                <div className="flex flex-col gap-0.5 pt-3 animate-fade-in-up">
                    <style dangerouslySetInnerHTML={{ __html: FINANCE_STYLES }} />
                    <span className="font-bdo text-[10px] font-medium tracking-wide text-[#E35336]">Laporan Keuangan</span>
                    <h1 className="font-clash text-2xl font-bold uppercase tracking-tight xl:text-3xl">
                        <ShinyTextBlack text="Finance" speed={4} />
                    </h1>
                </div>
            }
        >
            <Head title="Finance" />

            <div className="flex flex-col gap-4 overflow-x-hidden pb-16 pt-3">
                <FinanceToolbar period={period} rows={filteredLedger} stats={stats} />

                <section className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2 2xl:grid-cols-[minmax(330px,0.84fr)_minmax(420px,1fr)_minmax(460px,1.12fr)]">
                    <RevenueHero stats={stats} trend={revenueTrend} period={period} dailyRevenue={dailyRevenue} />
                    <MetricGrid stats={stats} />
                    <div className="lg:col-span-2 2xl:col-span-1">
                        <DailyRevenueCard data={dailyRevenue} trend={revenueTrend} period={period} />
                    </div>
                </section>

                <RevenueMixPanel rows={typeBreakdown} stats={stats} />

                <FinanceInsightGrid monthlyRevenue={monthlyRevenue} activeMonth={period.month} year={period.year} facilityRevenue={facilityRevenue} membershipPlanRevenue={membershipPlanRevenue} />

                <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <BreakdownPanel title="Breakdown per Fasilitas" subtitle="Kontribusi pendapatan reservasi" rows={facilityRevenue} icon={<LayoutGrid size={17} />} />
                    <BreakdownPanel title="Breakdown per Paket" subtitle="Kontribusi pendapatan membership" rows={membershipPlanRevenue} icon={<BarChart3 size={17} />} tone="emerald" />
                </section>

                <LedgerTable rows={filteredLedger} search={search} setSearch={setSearch} typeFilter={typeFilter} setTypeFilter={setTypeFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} />
            </div>

            <FinancePrintTemplate stats={stats} dailyRevenue={dailyRevenue} revenueTrend={revenueTrend} period={period} />
        </AdminLayout>
    );
}
