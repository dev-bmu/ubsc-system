import { useEffect, useMemo, useState } from "react";
import {
    AlertCircle,
    ArrowUpRight,
    CalendarDays,
    Dumbbell,
    MapPin,
    Receipt,
    RefreshCw,
} from "lucide-react";
import axios from "axios";
import { cn } from "@/lib/utils";
import AccountModalShell from "./AccountModalShell";
import { Barcode, NumberReel } from "./PassKit";

interface Props {
    onClose: () => void;
}

interface TransactionItem {
    id: number;
    amount: number;
    payment_status: "UNPAID" | "PAID" | "EXPIRED" | "FAILED";
    checkout_url: string | null;
    paid_at: string | null;
    created_at: string;
    type: "booking" | "membership";
    facility_name: string;
    booking_date: string | null;
    membership_plan: string | null;
}

const STATUS_CONFIG: Record<
    string,
    { label: string; dot: string; pill: string }
> = {
    PAID: {
        label: "Lunas",
        dot: "bg-emerald-500",
        pill: "bg-emerald-500/12 text-emerald-700",
    },
    UNPAID: {
        label: "Belum Bayar",
        dot: "bg-amber-500",
        pill: "bg-amber-500/14 text-amber-700",
    },
    EXPIRED: {
        label: "Kedaluwarsa",
        dot: "bg-navy-900/40",
        pill: "bg-navy-900/[0.06] text-navy-900/50",
    },
    FAILED: {
        label: "Gagal",
        dot: "bg-rose-500",
        pill: "bg-rose-500/12 text-rose-600",
    },
};

function formatRupiah(amount: number) {
    return "Rp " + new Intl.NumberFormat("id-ID").format(amount);
}

function formatDate(dateStr: string | null) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function SkeletonRow() {
    return (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-navy-900/[0.06] bg-white p-4 transition-all duration-300 hover:shadow-[0_4px_16px_-6px_rgba(7,21,48,0.12)]">
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="account-skeleton h-11 w-11 flex-shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1 space-y-2">
                    <div className="account-skeleton h-3 w-3/4 rounded" />
                    <div className="account-skeleton h-3 w-1/3 rounded" />
                </div>
            </div>
            <div className="account-skeleton h-6 w-16 rounded-full" />
        </div>
    );
}

export default function PaymentHistoryModal({ onClose }: Props) {
    const [transactions, setTransactions] = useState<TransactionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let active = true;
        setLoading(true);
        setError(null);
        axios
            .get("/user/transactions")
            .then((res) => {
                if (active) setTransactions(res.data);
            })
            .catch(() => {
                if (active) setError("Gagal memuat data transaksi.");
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [reloadKey]);

    const summary = useMemo(() => {
        const paid = transactions.filter((t) => t.payment_status === "PAID");
        const unpaid = transactions.filter(
            (t) => t.payment_status === "UNPAID",
        );
        const totalPaid = paid.reduce((sum, t) => sum + t.amount, 0);
        return { count: transactions.length, totalPaid, unpaid: unpaid.length };
    }, [transactions]);

    return (
        <AccountModalShell
            bannerGradient="from-[#13315e] via-navy-900 to-navy-950"
            eyebrow="Riwayat"
            title="Riwayat Pembayaran"
            subtitle="Semua transaksi booking dan membership Anda."
            wordmark="Riwayat"
            accent="#3B82F6"
            onClose={onClose}
        >
            {/* ── Summary strip ── */}
            {!loading && !error && transactions.length > 0 && (
                <div className="mb-5 grid grid-cols-3 gap-2.5">
                    <div className="kl-stagger kl-tactile rounded-2xl border border-navy-900/[0.07] bg-white px-3 py-3 text-center" style={{ ["--i" as string]: 0 }}>
                        <NumberReel
                            value={summary.count}
                            className="justify-center font-clash text-[22px] font-bold leading-none text-navy-900"
                        />
                        <p className="mt-1.5 font-bdo text-[10px] uppercase tracking-wide text-navy-900/45">
                            Transaksi
                        </p>
                    </div>
                    <div className="kl-stagger kl-tactile relative col-span-2 overflow-hidden rounded-2xl border border-navy-900/[0.07] bg-white px-3.5 py-3 text-left" style={{ ["--i" as string]: 1 }}>
                        <div className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full bg-accent-red/10 blur-2xl" />
                        <p className="relative font-clash text-[18px] font-bold leading-none text-navy-900">
                            {formatRupiah(summary.totalPaid)}
                        </p>
                        <p className="relative mt-1.5 font-bdo text-[10px] uppercase tracking-wide text-navy-900/45">
                            Total Terbayar
                        </p>
                        <Barcode className="relative mt-2 h-4 text-navy-900/25" />
                    </div>
                </div>
            )}

            {/* ── Loading ── */}
            {loading && (
                <div className="space-y-3">
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                </div>
            )}

            {/* ── Error ── */}
            {!loading && error && (
                <div className="flex flex-col items-center rounded-2xl border border-rose-200 bg-rose-50/60 px-6 py-10 text-center">
                    <AlertCircle className="mb-3 h-9 w-9 text-rose-400" />
                    <p className="font-bdo text-[14px] font-medium text-rose-600">
                        {error}
                    </p>
                    <button
                        type="button"
                        onClick={() => setReloadKey((k) => k + 1)}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-navy-900/15 bg-white px-4 py-2 font-clash text-[13px] font-semibold text-navy-900 transition-colors hover:bg-navy-900/[0.04]"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Coba Lagi
                    </button>
                </div>
            )}

            {/* ── Empty ── */}
            {!loading && !error && transactions.length === 0 && (
                <div className="flex flex-col items-center rounded-2xl border border-navy-900/[0.07] bg-white px-6 py-14 text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-900/[0.05]">
                        <Receipt className="h-7 w-7 text-navy-900/30" />
                    </div>
                    <p className="font-clash text-[15px] font-semibold text-navy-900">
                        Belum ada transaksi
                    </p>
                    <p className="mt-1 font-bdo text-[13px] text-navy-900/45">
                        Transaksi booking dan membership Anda akan tampil di
                        sini.
                    </p>
                </div>
            )}

            {/* ── List ── */}
            {!loading && !error && transactions.length > 0 && (
                <ul className="space-y-3">
                    {transactions.map((t, idx) => {
                        const status =
                            STATUS_CONFIG[t.payment_status] ??
                            STATUS_CONFIG.FAILED;
                        const isMembership = t.type === "membership";
                        const isUnpaid = t.payment_status === "UNPAID";
                        const title = isMembership
                            ? (t.membership_plan ?? "Membership")
                            : t.facility_name;
                        return (
                            <li
                                key={t.id}
                                className="kl-stagger kl-tactile rounded-2xl border border-navy-900/[0.07] bg-white p-4 transition-all duration-300"
                                style={{ ["--i" as string]: Math.min(idx, 8) }}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex min-w-0 flex-1 items-stretch gap-3">
                                        {/* Ticket stub */}
                                        <div className="flex flex-col items-center gap-2 self-stretch pr-3">
                                            <div
                                                className={cn(
                                                    "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl",
                                                    isMembership
                                                        ? "bg-accent-red/10"
                                                        : "bg-navy-900/[0.06]",
                                                )}
                                            >
                                                {isMembership ? (
                                                    <Dumbbell className="h-5 w-5 text-accent-red" />
                                                ) : (
                                                    <MapPin className="h-5 w-5 text-navy-900/55" />
                                                )}
                                            </div>
                                            <span
                                                aria-hidden="true"
                                                className="w-px flex-1 border-l-2 border-dashed border-navy-900/15"
                                            />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-clash text-[14px] font-semibold text-navy-900">
                                                {title}
                                            </p>
                                            <p className="mt-0.5 flex items-center gap-1.5 font-bdo text-[11px] text-navy-900/45">
                                                <CalendarDays className="h-3 w-3" />
                                                {formatDate(
                                                    t.booking_date ??
                                                        t.paid_at ??
                                                        t.created_at,
                                                )}
                                                <span className="text-navy-900/20">
                                                    •
                                                </span>
                                                {isMembership
                                                    ? "Membership"
                                                    : "Booking"}
                                            </p>
                                            <p className="mt-1.5 font-clash text-[15px] font-bold text-navy-900">
                                                {formatRupiah(t.amount)}
                                            </p>
                                        </div>
                                    </div>
                                    <span
                                        className={cn(
                                            "inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-bdo text-[11px] font-semibold",
                                            status.pill,
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "h-1.5 w-1.5 rounded-full",
                                                status.dot,
                                            )}
                                            style={
                                                isUnpaid
                                                    ? {
                                                          animation:
                                                              "kl-dot-pulse 2s ease-in-out infinite",
                                                      }
                                                    : undefined
                                            }
                                        />
                                        {status.label}
                                    </span>
                                </div>

                                {isUnpaid && t.checkout_url && (
                                    <a
                                        href={t.checkout_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group relative mt-3 flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-navy-900 font-clash text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-all hover:bg-navy-800 active:scale-[0.99]"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="pointer-events-none absolute inset-0 -translate-x-[130%] skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[230%]"
                                        />
                                        <span className="relative flex items-center gap-2">
                                            Lanjutkan Pembayaran
                                            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                                        </span>
                                    </a>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </AccountModalShell>
    );
}
