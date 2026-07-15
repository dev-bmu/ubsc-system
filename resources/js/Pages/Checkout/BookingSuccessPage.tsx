import { Head, Link, usePage } from "@inertiajs/react";
import type { PageProps } from "@/types";
import {
    ArrowRight,
    CheckCircle2,
    Download,
    History,
    Home,
    ReceiptText,
} from "lucide-react";
import type { ReactNode } from "react";

interface SuccessTransaction {
    id: number;
    receipt_number: string | null;
    amount: number;
    payment_status: string;
    paid_at: string | null;
}

interface SuccessBooking {
    id: number;
    facility_name: string | null;
    facility_unit_name: string | null;
    booking_date: string | null;
    start_time: string;
    end_time: string;
}

interface SuccessBookingOrder {
    id: number;
    customer_name: string | null;
    total_amount: number;
    status: string;
    bookings: SuccessBooking[];
    transaction: SuccessTransaction | null;
}

type SuccessPageProps = PageProps<{
    bookingOrder: SuccessBookingOrder;
    invoiceUrl: string;
}>;

function rupiah(value: number | null | undefined): string {
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
    }).format(value ?? 0);
}

function formatDate(date: string | null): string {
    if (!date) return "-";

    return new Intl.DateTimeFormat("id-ID", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(new Date(`${date}T00:00:00`));
}

export default function BookingSuccessPage() {
    const { bookingOrder, invoiceUrl } = usePage<SuccessPageProps>().props;
    const receiptNumber =
        bookingOrder.transaction?.receipt_number ?? `UBSC-${bookingOrder.id}`;
    const totalPaid = bookingOrder.transaction?.amount ?? bookingOrder.total_amount;

    return (
        <>
            <Head title="Pembayaran Berhasil" />

            <main className="min-h-screen bg-[#f4f5f7] px-5 py-8 text-[#111111] sm:px-8">
                <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[980px] items-center justify-center">
                    <div className="w-full overflow-hidden rounded-[2.5rem] bg-white shadow-[0_30px_100px_rgba(15,23,42,0.10)] ring-1 ring-black/5">
                        <div className="relative px-6 pb-8 pt-10 text-center sm:px-10 sm:pb-10 sm:pt-12">
                            <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_50%_0%,rgba(11,74,114,0.18),transparent_62%)]" />

                            <div className="relative mx-auto flex size-20 items-center justify-center rounded-full bg-[#0B4A72] text-white shadow-[0_18px_50px_rgba(11,74,114,0.28)]">
                                <CheckCircle2 className="size-10" />
                            </div>

                            <p className="relative mt-6 font-bdo text-sm font-semibold uppercase tracking-[0.18em] text-[#0B4A72]">
                                Booking Confirmed
                            </p>
                            <h1 className="relative mt-3 font-bdo text-[clamp(2.25rem,4vw,4rem)] font-medium leading-[1.02] tracking-[-0.04em]">
                                Pembayaran Berhasil!
                            </h1>
                            <p className="relative mx-auto mt-4 max-w-[560px] font-bdo text-base leading-relaxed text-gray-500">
                                Terima kasih, reservasi Anda sudah dikonfirmasi. Simpan
                                invoice sebagai bukti pembayaran saat datang ke UB Sport
                                Center.
                            </p>
                        </div>

                        <div className="grid gap-4 border-y border-gray-200 bg-[#fbfbfb] p-5 sm:grid-cols-2 sm:p-6">
                            <InfoTile
                                icon={<ReceiptText className="size-5" />}
                                label="Nomor Transaksi"
                                value={receiptNumber}
                            />
                            <InfoTile
                                icon={<CheckCircle2 className="size-5" />}
                                label="Total Dibayar"
                                value={rupiah(totalPaid)}
                            />
                        </div>

                        <div className="p-5 sm:p-6">
                            <div className="rounded-[1.5rem] border border-gray-200 bg-white p-5">
                                <div className="mb-4 flex items-center justify-between gap-4">
                                    <div>
                                        <h2 className="font-bdo text-lg font-semibold">
                                            Detail Reservasi
                                        </h2>
                                        <p className="font-bdo text-sm text-gray-500">
                                            {bookingOrder.bookings.length} jadwal aktif
                                        </p>
                                    </div>
                                    <span className="rounded-full bg-emerald-50 px-3 py-1 font-bdo text-xs font-semibold text-emerald-700">
                                        PAID
                                    </span>
                                </div>

                                <div className="space-y-3">
                                    {bookingOrder.bookings.map((booking) => (
                                        <div
                                            key={booking.id}
                                            className="flex flex-col gap-2 rounded-2xl bg-[#f7f7f7] p-4 sm:flex-row sm:items-center sm:justify-between"
                                        >
                                            <div>
                                                <p className="font-bdo text-base font-semibold">
                                                    {booking.facility_name ?? "Fasilitas"}
                                                </p>
                                                <p className="font-bdo text-sm text-gray-500">
                                                    {booking.facility_unit_name ??
                                                        "Unit utama"}
                                                </p>
                                            </div>
                                            <p className="font-bdo text-sm font-medium text-gray-600 sm:text-right">
                                                {formatDate(booking.booking_date)}
                                                <br />
                                                {booking.start_time} - {booking.end_time}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-6 grid gap-3 sm:grid-cols-3">
                                <a
                                    href={`${invoiceUrl}?print=1`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="success-action bg-black text-white hover:-translate-y-0.5"
                                >
                                    <Download className="size-5" />
                                    Print Invoice
                                </a>

                                <a
                                    href={route("user.transactions")}
                                    className="success-action bg-white text-black ring-1 ring-gray-200 hover:-translate-y-0.5 hover:ring-gray-300"
                                >
                                    <History className="size-5" />
                                    Lihat Riwayat Pemesanan
                                </a>

                                <Link
                                    href="/"
                                    className="success-action bg-white text-black ring-1 ring-gray-200 hover:-translate-y-0.5 hover:ring-gray-300"
                                >
                                    <Home className="size-5" />
                                    Kembali ke Beranda
                                </Link>
                            </div>

                            <Link
                                href={route("booking")}
                                className="mx-auto mt-6 flex w-fit items-center gap-2 font-bdo text-sm font-semibold text-gray-500 transition hover:text-black"
                            >
                                Booking fasilitas lain
                                <ArrowRight className="size-4" />
                            </Link>
                        </div>
                    </div>
                </section>
            </main>
        </>
    );
}

function InfoTile({
    icon,
    label,
    value,
}: {
    icon: ReactNode;
    label: string;
    value: string;
}) {
    return (
        <div className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-black/5">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#eef7fb] text-[#0B4A72]">
                {icon}
            </span>
            <span className="min-w-0">
                <span className="block font-bdo text-xs uppercase tracking-[0.12em] text-gray-400">
                    {label}
                </span>
                <span className="block truncate font-bdo text-lg font-semibold text-black">
                    {value}
                </span>
            </span>
        </div>
    );
}
