import { useEffect, useState } from "react";
import { CreditCard, ExternalLink, Loader2, X } from "lucide-react";
import axios from "axios";
import { cn } from "@/lib/utils";

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
    facility_name: string;
    booking_date: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
    PAID:    { label: "Lunas",        className: "bg-emerald-500/15 text-emerald-400" },
    UNPAID:  { label: "Belum Bayar",  className: "bg-amber-500/15 text-amber-400" },
    EXPIRED: { label: "Kedaluwarsa",  className: "bg-slate-500/15 text-slate-400" },
    FAILED:  { label: "Gagal",        className: "bg-rose-500/15 text-rose-400" },
};

function formatRupiah(amount: number) {
    return "Rp " + new Intl.NumberFormat("id-ID").format(amount);
}

function formatDate(dateStr: string | null) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

export default function PaymentHistoryModal({ onClose }: Props) {
    const [transactions, setTransactions] = useState<TransactionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    useEffect(() => {
        axios
            .get("/user/transactions")
            .then((res) => setTransactions(res.data))
            .catch(() => setError("Gagal memuat data transaksi."))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-[24px] border border-white/[0.07] bg-[#0d1422] shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10">
                            <CreditCard className="h-4 w-4 text-blue-400" />
                        </div>
                        <div>
                            <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.18em] text-blue-400">
                                Riwayat
                            </p>
                            <h2 className="font-clash text-[16px] font-semibold text-white">
                                History Pembayaran
                            </h2>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-xl text-white/30 transition-all hover:bg-white/[0.06] hover:text-white/70"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="max-h-[60vh] overflow-y-auto">
                    {loading && (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-white/30" />
                        </div>
                    )}

                    {!loading && error && (
                        <div className="px-6 py-10 text-center">
                            <p className="font-bdo text-sm text-rose-400">{error}</p>
                        </div>
                    )}

                    {!loading && !error && transactions.length === 0 && (
                        <div className="px-6 py-12 text-center">
                            <CreditCard className="mx-auto mb-3 h-8 w-8 text-white/15" />
                            <p className="font-bdo text-sm text-white/40">Belum ada transaksi.</p>
                        </div>
                    )}

                    {!loading && !error && transactions.length > 0 && (
                        <ul className="divide-y divide-white/[0.06] px-4 py-2">
                            {transactions.map((t) => {
                                const status = STATUS_CONFIG[t.payment_status] ?? STATUS_CONFIG.FAILED;
                                return (
                                    <li key={t.id} className="flex items-start justify-between gap-3 py-4">
                                        <div className="min-w-0 flex-1">
                                            <p className="font-clash text-[13px] font-semibold text-white truncate">
                                                {t.facility_name}
                                            </p>
                                            <p className="font-bdo text-[11px] text-white/40">
                                                {formatDate(t.booking_date ?? t.created_at)}
                                            </p>
                                            <p className="mt-0.5 font-bdo text-[13px] text-white/70">
                                                {formatRupiah(t.amount)}
                                            </p>
                                        </div>
                                        <div className="flex flex-shrink-0 flex-col items-end gap-2">
                                            <span
                                                className={cn(
                                                    "rounded-full px-2.5 py-0.5 font-bdo text-[10px] font-medium",
                                                    status.className,
                                                )}
                                            >
                                                {status.label}
                                            </span>
                                            {t.payment_status === "UNPAID" && t.checkout_url && (
                                                <a
                                                    href={t.checkout_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1 rounded-lg bg-blue-500/10 px-2.5 py-1 font-bdo text-[11px] text-blue-400 transition-colors hover:bg-blue-500/20"
                                                >
                                                    Bayar
                                                    <ExternalLink className="h-3 w-3" />
                                                </a>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
