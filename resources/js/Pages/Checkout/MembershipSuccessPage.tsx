import Navbar from "@/Components/Landing/Navbar";
import type { MembershipPlanTier, PageProps } from "@/types";
import { Head, Link, usePage } from "@inertiajs/react";
import {
    ArrowDownToLine,
    ArrowRight,
    Check,
    ExternalLink,
} from "lucide-react";
import "./BookingCheckoutPage.css";
import CheckoutMasthead from "./CheckoutMasthead";

interface SuccessPlan {
    name?: string | null;
    tier?: MembershipPlanTier | string | null;
    tier_label?: string | null;
    duration_months?: number | null;
    duration_label?: string | null;
    card_image_url?: string | null;
    image_url?: string | null;
}

interface SuccessTransaction {
    receipt_number?: string | null;
    amount?: number | null;
    paid_at?: string | null;
    payment_status?: string | null;
    payment_method?: string | null;
}

interface SuccessRegistration {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    category?: string | null;
}

interface SuccessMembership {
    id: number;
    status?: string | null;
    customer_name?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    registration_email?: string | null;
    registration_phone?: string | null;
    registration_category?: string | null;
    plan?: SuccessPlan | null;
    transaction?: SuccessTransaction | null;
    registration?: SuccessRegistration | null;
}

type MembershipSuccessProps = PageProps<{
    membership: SuccessMembership;
    invoiceUrl: string;
}>;

const TIER_LABELS: Record<MembershipPlanTier, string> = {
    hemat: "Hemat",
    favorit: "Favorit",
    performa: "Performa",
    eksklusif: "Eksklusif",
};

function rupiah(value: number | null | undefined): string {
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
    }).format(Number(value ?? 0));
}

function parseDate(value: string | null | undefined): Date | null {
    if (!value) return null;

    const parsed = new Date(
        value.includes("T") ? value : value.replace(" ", "T"),
    );

    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function fullDate(value: string | null | undefined): string {
    const date = parseDate(value);
    if (!date) return "Tanggal belum tersedia";

    return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Jakarta",
    }).format(date);
}

function paidDate(value: string | null | undefined): string {
    const date = parseDate(value);
    if (!date) return "Waktu pembayaran tercatat";

    return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
    }).format(date);
}

function durationLabel(plan: SuccessPlan | null | undefined): string {
    if (plan?.duration_label) return plan.duration_label;

    const months = Number(plan?.duration_months ?? 0);
    if (months === 12) return "1 tahun";
    if (months === 1) return "1 bulan";
    if (months > 1) return `${months} bulan`;

    return "Periode membership";
}

function tierLabel(plan: SuccessPlan | null | undefined): string {
    if (plan?.tier_label) return plan.tier_label;

    const tier = String(plan?.tier ?? "hemat").toLowerCase();
    return tier === "hemat" ||
        tier === "favorit" ||
        tier === "performa" ||
        tier === "eksklusif"
        ? TIER_LABELS[tier]
        : "Membership";
}

function categoryLabel(value: string | null | undefined): string {
    if (value === "warga_ub") return "Warga UB";
    if (value === "umum") return "Umum";

    return value || "Akun terverifikasi";
}

function paymentMethodLabel(value: string | null | undefined): string {
    const methods: Record<string, string> = {
        bca_va: "BCA Virtual Account",
        qris: "QRIS",
        card: "Kartu debit / kredit",
    };

    return value ? methods[value] ?? value : "Pembayaran terverifikasi";
}

function paymentTone(status: string | null | undefined) {
    const normalized = String(status ?? "PAID").toUpperCase();

    if (normalized === "PAID") {
        return {
            label: "Lunas",
            color: "#00a86b",
            soft: "rgba(0, 168, 107, 0.2)",
        };
    }

    if (["PENDING", "UNPAID"].includes(normalized)) {
        return {
            label: "Menunggu",
            color: "#986400",
            soft: "rgba(152, 100, 0, 0.13)",
        };
    }

    return {
        label: "Gagal",
        color: "#a51d32",
        soft: "rgba(165, 29, 50, 0.12)",
    };
}

export default function MembershipSuccessPage() {
    const { membership, invoiceUrl } =
        usePage<MembershipSuccessProps>().props;
    const transaction = membership.transaction;
    const plan = membership.plan;
    const registration = membership.registration;
    const receipt =
        transaction?.receipt_number ??
        `MEM-${membership.id.toString().padStart(6, "0")}`;
    const amount = transaction?.amount ?? 0;
    const statusTone = paymentTone(transaction?.payment_status);
    const downloadUrl = `${invoiceUrl}${invoiceUrl.includes("?") ? "&" : "?"}download=1`;
    const customerName =
        membership.customer_name ??
        registration?.full_name ??
        "Member UBSC";
    const customerEmail =
        registration?.email ??
        membership.registration_email ??
        "Email akun";
    const category =
        registration?.category ?? membership.registration_category;
    const planImage = plan?.card_image_url ?? plan?.image_url ?? null;

    return (
        <>
            <Head title="Bukti membership | UB Sport Center" />

            <main className="booking-checkout bg-[#f4f4f1]">
                <Navbar activeSection="Pricing" surface="media" />
                <CheckoutMasthead title="Membership aktif" compact />

                <section className="relative px-5 pb-10 pt-7 sm:px-8 lg:px-[3.35vw] lg:pb-12 lg:pt-9">
                    <div
                        className="pointer-events-none absolute right-0 top-0 h-[5px] w-[31%] bg-gradient-to-r from-[#123f5a] via-[#15678d] to-[#ff0000]"
                        aria-hidden="true"
                    />

                    <div className="mx-auto max-w-[1880px]">
                        <header className="grid items-end gap-5 border-b border-black/45 pb-6 md:grid-cols-[18%_1fr_auto] lg:gap-6 lg:pb-7">
                            <div>
                                <p className="text-[12px] text-black/45">
                                    Bukti membership / 05
                                </p>
                                <p className="mt-4 flex items-center gap-2 text-[13px] font-medium">
                                    <span
                                        className="size-2 rotate-45"
                                        style={{
                                            backgroundColor:
                                                statusTone.color,
                                        }}
                                    />
                                    Pembayaran{" "}
                                    {statusTone.label.toLowerCase()}
                                </p>
                            </div>

                            <div>
                                <p className="max-w-[520px] text-[13px] leading-[1.4] text-black/50">
                                    Pembayaran diterima dan masa aktif telah
                                    diterbitkan untuk akun Anda.
                                </p>
                                <h1 className="mt-2 text-[clamp(2.7rem,5.1vw,6.2rem)] font-semibold leading-[0.9] tracking-[-0.07em]">
                                    Membership tercatat.
                                </h1>
                            </div>

                            <dl className="flex min-w-[290px] gap-9 border-l-2 border-[#15678d] pl-5 text-[12px]">
                                <div>
                                    <dt className="text-black/42">
                                        Nomor transaksi
                                    </dt>
                                    <dd
                                        className="mt-1 max-w-[13rem] truncate text-[15px] font-medium"
                                        title={receipt}
                                    >
                                        {receipt}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-black/42">Dibayar</dt>
                                    <dd className="mt-1 text-[15px] font-medium">
                                        {rupiah(amount)}
                                    </dd>
                                </div>
                            </dl>
                        </header>

                        <div className="grid gap-8 pt-6 lg:grid-cols-[1fr_31%] lg:gap-[5vw] lg:pt-7">
                            <section>
                                <div className="flex items-end justify-between pb-3 sm:border-b sm:border-black/50 sm:pb-4">
                                    <div className="flex items-baseline gap-4">
                                        <span className="text-[12px] text-[#15678d]">
                                            01/
                                        </span>
                                        <h2 className="text-[clamp(1.7rem,2.5vw,3rem)] font-medium leading-none tracking-[-0.045em]">
                                            Paket Anda
                                        </h2>
                                    </div>
                                    <p className="text-[12px] text-black/48">
                                        {durationLabel(plan)} masa aktif
                                    </p>
                                </div>

                                <article className="group grid grid-cols-[64px_1fr] items-center gap-4 border-b border-black/10 py-4 sm:grid-cols-[82px_1fr_auto] sm:gap-5 sm:border-black/20">
                                    <div className="aspect-square overflow-hidden bg-[#d9d9d4] [clip-path:polygon(0_0,100%_0,100%_calc(100%-9px),calc(100%-9px)_100%,0_100%)]">
                                        {planImage ? (
                                            <img
                                                src={planImage}
                                                alt=""
                                                className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                                            />
                                        ) : (
                                            <span className="flex h-full items-center justify-center text-[11px] text-black/35">
                                                UBSC
                                            </span>
                                        )}
                                    </div>

                                    <div className="min-w-0">
                                        <p className="text-[11px] text-[#15678d]">
                                            {tierLabel(plan)} / Membership
                                        </p>
                                        <h3 className="mt-0.5 text-[clamp(1.35rem,2vw,2.35rem)] font-medium leading-[1.02] tracking-[-0.04em]">
                                            {plan?.name ?? "Membership Gym"}
                                        </h3>
                                        <p className="mt-1 text-[12px] text-black/46">
                                            {durationLabel(plan)} ·{" "}
                                            {categoryLabel(category)}
                                        </p>
                                    </div>

                                    <div className="col-span-2 flex justify-between pl-20 text-[12px] sm:col-span-1 sm:block sm:min-w-[210px] sm:pl-0 sm:text-right">
                                        <p>
                                            Aktif {fullDate(
                                                membership.start_date,
                                            )}
                                        </p>
                                        <p className="text-black/46 sm:mt-1">
                                            Hingga{" "}
                                            {fullDate(membership.end_date)}
                                        </p>
                                    </div>
                                </article>

                                <div className="grid grid-cols-2 border-b border-black/15 text-[12px] sm:grid-cols-3 sm:border-black/25">
                                    <Fact
                                        label="Atas nama"
                                        value={customerName}
                                    />
                                    <Fact
                                        label="Email"
                                        value={customerEmail}
                                    />
                                    <Fact
                                        label="Kategori"
                                        value={categoryLabel(category)}
                                    />
                                </div>
                            </section>

                            <aside>
                                <div className="flex items-baseline gap-4 pb-3 sm:border-b sm:border-black/50 sm:pb-4">
                                    <span className="text-[12px] text-[#ff0000]">
                                        02/
                                    </span>
                                    <h2 className="text-[clamp(1.7rem,2.4vw,2.8rem)] font-medium leading-none tracking-[-0.045em]">
                                        Pembayaran
                                    </h2>
                                </div>

                                <dl className="divide-y divide-black/10 sm:divide-black/20 sm:border-b sm:border-black">
                                    <Detail
                                        label="Status"
                                        value={statusTone.label}
                                        verified
                                        tone={statusTone}
                                    />
                                    <Detail
                                        label="Diterima"
                                        value={paidDate(
                                            transaction?.paid_at,
                                        )}
                                    />
                                    <Detail
                                        label="Metode"
                                        value={paymentMethodLabel(
                                            transaction?.payment_method,
                                        )}
                                    />
                                    <Detail
                                        label="Dokumen"
                                        value={receipt}
                                    />
                                </dl>

                                <div className="mt-5 grid gap-2.5">
                                    <a
                                        href={invoiceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group flex min-h-14 items-center justify-between bg-gradient-to-r from-[#0b2638] to-[#15678d] px-5 text-[14px] font-medium text-white transition-[filter,padding] hover:px-6 hover:brightness-110 [clip-path:polygon(0_0,calc(100%-14px)_0,100%_14px,100%_100%,0_100%)]"
                                    >
                                        Buka &amp; cetak PDF
                                        <ExternalLink className="size-4" />
                                    </a>
                                    <a
                                        href={downloadUrl}
                                        className="group flex min-h-12 items-center justify-between px-1 text-[13px] font-medium transition-[padding,color] hover:px-3 hover:text-[#15678d] sm:border-b sm:border-black"
                                    >
                                        Unduh bukti pembayaran
                                        <ArrowDownToLine className="size-4" />
                                    </a>
                                </div>
                            </aside>
                        </div>

                        <footer className="mt-6 flex flex-col justify-between gap-4 pt-3 text-[12px] sm:mt-7 sm:flex-row sm:items-center sm:border-t sm:border-black sm:pt-4">
                            <p className="text-black/48">
                                Dokumen tersimpan otomatis di riwayat
                                pembayaran.
                            </p>
                            <div className="flex gap-7">
                                <Link
                                    href="/?account=history"
                                    className="group flex items-center gap-3"
                                >
                                    Riwayat pembayaran
                                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                                </Link>
                                <Link
                                    href={route("pricing")}
                                    className="group flex items-center gap-3 font-medium text-[#15678d]"
                                >
                                    Lihat paket lainnya
                                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                                </Link>
                            </div>
                        </footer>
                    </div>
                </section>
            </main>
        </>
    );
}

function Fact({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0 border-r border-black/10 px-3 py-3 first:pl-0 last:border-r-0 sm:px-5">
            <span className="block text-[10px] text-black/40">{label}</span>
            <strong
                className="mt-1 block truncate text-[12px] font-medium"
                title={value}
            >
                {value}
            </strong>
        </div>
    );
}

function Detail({
    label,
    value,
    verified = false,
    tone,
}: {
    label: string;
    value: string;
    verified?: boolean;
    tone?: { color: string; soft: string };
}) {
    return (
        <div className="grid grid-cols-[32%_1fr] gap-4 py-3 text-[12px]">
            <dt className="text-black/43">{label}</dt>
            <dd className="flex min-w-0 justify-between gap-3 font-medium">
                <span
                    className="truncate"
                    title={value}
                    style={tone ? { color: tone.color } : undefined}
                >
                    {value}
                </span>
                {verified && (
                    <span
                        className="flex size-5 shrink-0 rotate-45 items-center justify-center text-white shadow-[0_5px_16px_rgba(0,0,0,0.12)]"
                        style={{
                            background: `linear-gradient(145deg, ${tone?.color ?? "#00a86b"}, #08724f)`,
                            boxShadow: `0 5px 18px ${tone?.soft ?? "rgba(0,168,107,.2)"}`,
                        }}
                    >
                        <Check
                            className="size-3 -rotate-45"
                            strokeWidth={2.5}
                        />
                    </span>
                )}
            </dd>
        </div>
    );
}
