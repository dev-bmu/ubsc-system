import Navbar from "@/Components/Landing/Navbar";
import type { PageProps } from "@/types";
import { Head, Link, usePage } from "@inertiajs/react";
import {
    ArrowDownToLine,
    ArrowRight,
    Check,
    ExternalLink,
} from "lucide-react";
import CheckoutMasthead from "./CheckoutMasthead";
import "./BookingCheckoutPage.css";

interface SuccessTransaction {
    receipt_number: string | null;
    amount: number;
    paid_at: string | null;
    payment_status?: string;
}

interface SuccessBooking {
    id: number;
    facility_name: string | null;
    facility_unit_name: string | null;
    image_url: string | null;
    booking_date: string | null;
    start_time: string;
    end_time: string;
}

interface SuccessBookingOrder {
    id: number;
    customer_name: string | null;
    total_amount: number;
    bookings: SuccessBooking[];
    transaction: SuccessTransaction | null;
}

type SuccessPageProps = PageProps<{
    bookingOrder: SuccessBookingOrder;
    invoiceUrl: string;
}>;

const rupiah = (value: number | null | undefined) =>
    new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
    }).format(value ?? 0);

const fullDate = (date: string | null) =>
    date
        ? new Intl.DateTimeFormat("id-ID", {
              weekday: "long",
              day: "2-digit",
              month: "long",
              year: "numeric",
          }).format(new Date(`${date}T00:00:00`))
        : "Tanggal tidak tersedia";

const paidDate = (date: string | null | undefined) =>
    date
        ? new Intl.DateTimeFormat("id-ID", {
              day: "2-digit",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Jakarta",
          }).format(new Date(date.replace(" ", "T")))
        : "Waktu pembayaran tercatat";

const paymentTone = (status: string | undefined) => {
    const normalized = status?.toUpperCase() ?? "PAID";

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
};

export default function BookingSuccessPage() {
    const { bookingOrder, invoiceUrl } = usePage<SuccessPageProps>().props;
    const transaction = bookingOrder.transaction;
    const receipt = transaction?.receipt_number ?? `UBSC-${bookingOrder.id}`;
    const amount = transaction?.amount ?? bookingOrder.total_amount;
    const statusTone = paymentTone(transaction?.payment_status);
    const downloadUrl = `${invoiceUrl}${invoiceUrl.includes("?") ? "&" : "?"}download=1`;

    return (
        <>
            <Head title="Bukti pembayaran | UB Sport Center" />

            <main className="booking-checkout bg-[#f4f4f1]">
                <Navbar activeSection="Booking" surface="media" />
                <CheckoutMasthead title="Bukti lunas" compact />

                <section className="relative px-5 pb-10 pt-7 sm:px-8 lg:px-[3.35vw] lg:pb-12 lg:pt-9">
                    <div
                        className="pointer-events-none absolute right-0 top-0 h-[5px] w-[31%] bg-gradient-to-r from-[#123f5a] via-[#15678d] to-[#ff0000]"
                        aria-hidden="true"
                    />

                    <div className="mx-auto max-w-[1880px]">
                        <header className="grid items-end gap-5 border-b border-black/45 pb-6 md:grid-cols-[18%_1fr_auto] lg:gap-6 lg:pb-7">
                            <div>
                                <p className="text-[12px] text-black/45">
                                    Bukti pembayaran / 06
                                </p>
                                <p className="mt-4 flex items-center gap-2 text-[13px] font-medium">
                                    <span
                                        className="size-2 rotate-45"
                                        style={{ backgroundColor: statusTone.color }}
                                    />
                                    Pembayaran {statusTone.label.toLowerCase()}
                                </p>
                            </div>

                            <div>
                                <p className="max-w-[520px] text-[13px] leading-[1.4] text-black/50">
                                    Pembayaran diterima dan jadwal telah dikunci.
                                </p>
                                <h1 className="mt-2 text-[clamp(2.7rem,5.1vw,6.2rem)] font-semibold leading-[0.9] tracking-[-0.07em]">
                                    Reservasi tercatat.
                                </h1>
                            </div>

                            <dl className="flex min-w-[290px] gap-9 border-l-2 border-[#15678d] pl-5 text-[12px]">
                                <div>
                                    <dt className="text-black/42">Nomor transaksi</dt>
                                    <dd className="mt-1 text-[15px] font-medium">{receipt}</dd>
                                </div>
                                <div>
                                    <dt className="text-black/42">Dibayar</dt>
                                    <dd className="mt-1 text-[15px] font-medium">{rupiah(amount)}</dd>
                                </div>
                            </dl>
                        </header>

                        <div className="grid gap-8 pt-6 lg:grid-cols-[1fr_31%] lg:gap-[5vw] lg:pt-7">
                            <section>
                                <div className="flex items-end justify-between pb-3 sm:border-b sm:border-black/50 sm:pb-4">
                                    <div className="flex items-baseline gap-4">
                                        <span className="text-[12px] text-[#15678d]">01/</span>
                                        <h2 className="text-[clamp(1.7rem,2.5vw,3rem)] font-medium leading-none tracking-[-0.045em]">
                                            Jadwal Anda
                                        </h2>
                                    </div>
                                    <p className="text-[12px] text-black/48">
                                        {String(bookingOrder.bookings.length).padStart(2, "0")} reservasi
                                    </p>
                                </div>

                                {bookingOrder.bookings.map((booking, index) => (
                                    <article
                                        key={booking.id}
                                        className="group grid grid-cols-[58px_1fr] items-center gap-4 border-b border-black/10 py-3.5 last:border-b-0 sm:grid-cols-[70px_1fr_auto] sm:gap-5 sm:border-black/20 sm:last:border-b"
                                    >
                                        <div className="aspect-square overflow-hidden bg-[#d9d9d4] [clip-path:polygon(0_0,100%_0,100%_calc(100%-9px),calc(100%-9px)_100%,0_100%)]">
                                            {booking.image_url ? (
                                                <img
                                                    src={booking.image_url}
                                                    alt=""
                                                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                                                />
                                            ) : (
                                                <span className="flex h-full items-center justify-center text-[11px] text-black/35">
                                                    {String(index + 1).padStart(2, "0")}
                                                </span>
                                            )}
                                        </div>

                                        <div className="min-w-0">
                                            <p className="text-[11px] text-[#15678d]">
                                                {String(index + 1).padStart(2, "0")} / Reservasi
                                            </p>
                                            <h3 className="mt-0.5 text-[clamp(1.35rem,2vw,2.35rem)] font-medium leading-[1.02] tracking-[-0.04em]">
                                                {booking.facility_name ?? "Fasilitas"}
                                            </h3>
                                            <p className="mt-1 text-[12px] text-black/46">
                                                {booking.facility_unit_name ?? "Unit utama"}
                                            </p>
                                        </div>

                                        <div className="col-span-2 flex justify-between pl-[74px] text-[12px] sm:col-span-1 sm:block sm:min-w-[185px] sm:pl-0 sm:text-right">
                                            <p>{fullDate(booking.booking_date)}</p>
                                            <p className="text-black/46 sm:mt-1">
                                                {booking.start_time}—{booking.end_time} WIB
                                            </p>
                                        </div>
                                    </article>
                                ))}
                            </section>

                            <aside>
                                <div className="flex items-baseline gap-4 pb-3 sm:border-b sm:border-black/50 sm:pb-4">
                                    <span className="text-[12px] text-[#ff0000]">02/</span>
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
                                    <Detail label="Diterima" value={paidDate(transaction?.paid_at)} />
                                    <Detail
                                        label="Atas nama"
                                        value={bookingOrder.customer_name ?? "Pengguna UBSC"}
                                    />
                                    <Detail label="Dokumen" value={receipt} />
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
                                Dokumen tersimpan otomatis di riwayat pembayaran.
                            </p>
                            <div className="flex gap-7">
                                <Link href="/?account=history" className="group flex items-center gap-3">
                                    Riwayat pembayaran
                                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                                </Link>
                                <Link
                                    href={route("booking")}
                                    className="group flex items-center gap-3 font-medium text-[#15678d]"
                                >
                                    Booking lainnya
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
            <dd className="flex justify-between gap-3 font-medium">
                <span style={tone ? { color: tone.color } : undefined}>{value}</span>
                {verified && (
                    <span
                        className="flex size-5 shrink-0 rotate-45 items-center justify-center text-white shadow-[0_5px_16px_rgba(0,0,0,0.12)]"
                        style={{
                            background: `linear-gradient(145deg, ${tone?.color ?? "#00a86b"}, #08724f)`,
                            boxShadow: `0 5px 18px ${tone?.soft ?? "rgba(0,168,107,.2)"}`,
                        }}
                    >
                        <Check className="size-3 -rotate-45" strokeWidth={2.5} />
                    </span>
                )}
            </dd>
        </div>
    );
}
