import { Head, Link, useForm, usePage } from "@inertiajs/react";
import type { PageProps } from "@/types";
import {
    ArrowLeft,
    Banknote,
    CheckCircle2,
    CreditCard,
    Landmark,
    Loader2,
    QrCode,
    ReceiptText,
    ShieldCheck,
    type LucideIcon,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";

type IdentityCategory = "warga_ub" | "umum";
type PaymentMethodId = "bca_va" | "qris" | "card";

interface BookingCheckoutBooking {
    id: number;
    facility_name: string | null;
    facility_unit_name: string | null;
    booking_date: string | null;
    start_time: string;
    end_time: string;
    subtotal_price: number;
    status: string;
}

interface BookingCheckoutTransaction {
    id: number;
    receipt_number: string | null;
    amount: number;
    payment_status: string;
    checkout_url: string | null;
    paid_at: string | null;
}

interface BookingCheckoutOrder {
    id: number;
    customer_name: string | null;
    whatsapp_number: string | null;
    identity_category: IdentityCategory | string | null;
    identity_number: string | null;
    subtotal_amount: number;
    transaction_fee: number;
    discount_amount: number;
    total_amount: number;
    status: string;
    notes: string | null;
    expires_at: string | null;
    bookings: BookingCheckoutBooking[];
    transaction: BookingCheckoutTransaction | null;
}

interface PaymentMethod {
    id: PaymentMethodId;
    label: string;
}

type CheckoutPageProps = PageProps<{
    bookingOrder: BookingCheckoutOrder;
    paymentMethods: PaymentMethod[];
    mockPayment: boolean;
}>;

interface CheckoutFormData {
    customer_name: string;
    whatsapp_number: string;
    identity_category: IdentityCategory;
    identity_number: string;
    notes: string;
    payment_method: PaymentMethodId;
}

const PAYMENT_METHOD_META: Record<
    PaymentMethodId,
    {
        eyebrow: string;
        description: string;
        feeLabel: string;
        icon: LucideIcon;
    }
> = {
    bca_va: {
        eyebrow: "Virtual Account",
        description: "Nomor VA aktif setelah pembayaran dikonfirmasi.",
        feeLabel: "Fee Rp 6.000 included",
        icon: Landmark,
    },
    qris: {
        eyebrow: "Scan QR",
        description: "Cocok untuk mobile banking dan e-wallet.",
        feeLabel: "Instant confirmation",
        icon: QrCode,
    },
    card: {
        eyebrow: "Kartu",
        description: "Gunakan kartu kredit atau debit berlogo Visa/Mastercard.",
        feeLabel: "Secure card flow",
        icon: CreditCard,
    },
};

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

function normalizeIdentityCategory(value: string | null | undefined): IdentityCategory {
    return value === "warga_ub" ? "warga_ub" : "umum";
}

export default function BookingCheckoutPage() {
    const { bookingOrder, paymentMethods, mockPayment, auth } =
        usePage<CheckoutPageProps>().props;

    const { data, setData, post, processing, errors } = useForm<CheckoutFormData>({
        customer_name: bookingOrder.customer_name ?? auth.user?.name ?? "",
        whatsapp_number:
            bookingOrder.whatsapp_number ?? auth.user?.phone_number ?? "+62",
        identity_category: normalizeIdentityCategory(
            bookingOrder.identity_category ?? auth.user?.identity_category,
        ),
        identity_number: bookingOrder.identity_number ?? auth.user?.identity_number ?? "",
        notes: bookingOrder.notes ?? "",
        payment_method: paymentMethods[0]?.id ?? "bca_va",
    });

    const selectedMethod = PAYMENT_METHOD_META[data.payment_method];
    const SelectedPaymentIcon = selectedMethod.icon;
    const receiptNumber =
        bookingOrder.transaction?.receipt_number ?? `DRAFT-${bookingOrder.id}`;

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        post(route("checkout.booking.mock-pay", bookingOrder.id), {
            preserveScroll: true,
        });
    };

    const setIdentityCategory = (value: IdentityCategory) => {
        setData((current) => ({
            ...current,
            identity_category: value,
            identity_number: value === "warga_ub" ? current.identity_number : "",
        }));
    };

    return (
        <>
            <Head title="Checkout Booking" />

            <main className="min-h-screen bg-[#f4f5f7] px-5 py-6 text-[#111111] sm:px-8 lg:px-10">
                <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 pb-6">
                    <Link
                        href={route("booking")}
                        className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 font-bdo text-sm font-medium text-black shadow-sm ring-1 ring-black/5 transition hover:-translate-x-0.5"
                    >
                        <ArrowLeft className="size-4" />
                        Kembali
                    </Link>

                    <div className="hidden items-center gap-2 rounded-full bg-white px-4 py-2 font-bdo text-sm text-gray-500 ring-1 ring-black/5 sm:flex">
                        <ShieldCheck className="size-4 text-[#0B4A72]" />
                        Mock payment {mockPayment ? "aktif" : "nonaktif"}
                    </div>
                </div>

                <form
                    onSubmit={submit}
                    className="mx-auto grid max-w-[1200px] grid-cols-1 gap-8 pb-16 pt-2 lg:grid-cols-12"
                >
                    <section className="lg:col-span-7">
                        <div className="rounded-[2rem] bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] ring-1 ring-black/5 sm:p-8">
                            <div className="mb-8 flex items-start justify-between gap-6">
                                <div>
                                    <p className="font-bdo text-sm font-medium text-[#0B4A72]">
                                        Checkout Reservasi
                                    </p>
                                    <h1 className="mt-2 font-bdo text-[clamp(2rem,3vw,3rem)] font-medium leading-[1.05] tracking-[-0.03em]">
                                        Data Penyewa
                                    </h1>
                                </div>
                                <div className="rounded-2xl bg-[#f1f5f9] px-4 py-3 text-right">
                                    <p className="font-bdo text-[11px] uppercase tracking-[0.12em] text-gray-400">
                                        Invoice
                                    </p>
                                    <p className="font-bdo text-sm font-semibold text-black">
                                        {receiptNumber}
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-5">
                                <Field
                                    label="Nama Lengkap"
                                    error={errors.customer_name}
                                >
                                    <input
                                        value={data.customer_name}
                                        onChange={(event) =>
                                            setData("customer_name", event.target.value)
                                        }
                                        className="checkout-input"
                                        placeholder="Nama sesuai identitas"
                                        required
                                    />
                                </Field>

                                <Field
                                    label="Nomor Ponsel"
                                    error={errors.whatsapp_number}
                                >
                                    <input
                                        value={data.whatsapp_number}
                                        onChange={(event) =>
                                            setData("whatsapp_number", event.target.value)
                                        }
                                        className="checkout-input"
                                        placeholder="+62812..."
                                        required
                                    />
                                </Field>

                                <Field
                                    label="Kategori Identitas"
                                    error={errors.identity_category}
                                >
                                    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#f5f5f5] p-1">
                                        {(["warga_ub", "umum"] as const).map((value) => (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => setIdentityCategory(value)}
                                                className={`rounded-xl px-4 py-3 font-bdo text-sm font-medium transition ${
                                                    data.identity_category === value
                                                        ? "bg-black text-white shadow-sm"
                                                        : "text-gray-500 hover:text-black"
                                                }`}
                                            >
                                                {value === "warga_ub" ? "Warga UB" : "Umum"}
                                            </button>
                                        ))}
                                    </div>
                                </Field>

                                {data.identity_category === "warga_ub" && (
                                    <Field
                                        label="NIM / NIDN"
                                        error={errors.identity_number}
                                    >
                                        <input
                                            value={data.identity_number}
                                            onChange={(event) =>
                                                setData("identity_number", event.target.value)
                                            }
                                            className="checkout-input"
                                            inputMode="numeric"
                                            placeholder="Masukkan NIM atau NIDN"
                                            required
                                        />
                                    </Field>
                                )}

                                <Field label="Catatan Tambahan" error={errors.notes}>
                                    <textarea
                                        value={data.notes}
                                        onChange={(event) =>
                                            setData("notes", event.target.value)
                                        }
                                        className="checkout-input min-h-[8rem] resize-none py-4"
                                        placeholder="Opsional, misalnya kebutuhan khusus atau estimasi kedatangan."
                                    />
                                </Field>
                            </div>
                        </div>
                    </section>

                    <aside className="lg:col-span-5">
                        <div className="sticky top-8 space-y-5">
                            <div className="rounded-[2rem] bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] ring-1 ring-black/5">
                                <div className="mb-5 flex items-center gap-3">
                                    <div className="flex size-11 items-center justify-center rounded-2xl bg-black text-white">
                                        <ReceiptText className="size-5" />
                                    </div>
                                    <div>
                                        <h2 className="font-bdo text-xl font-semibold">
                                            Ringkasan Order
                                        </h2>
                                        <p className="font-bdo text-sm text-gray-500">
                                            {bookingOrder.bookings.length} jadwal dipilih
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {bookingOrder.bookings.map((booking) => (
                                        <div
                                            key={booking.id}
                                            className="rounded-2xl bg-[#f7f7f7] p-4"
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <p className="font-bdo text-base font-semibold">
                                                        {booking.facility_name ?? "Fasilitas"}
                                                    </p>
                                                    <p className="font-bdo text-sm text-gray-500">
                                                        {booking.facility_unit_name ??
                                                            "Unit utama"}
                                                    </p>
                                                </div>
                                                <p className="font-bdo text-sm font-semibold">
                                                    {rupiah(booking.subtotal_price)}
                                                </p>
                                            </div>
                                            <p className="mt-3 font-bdo text-sm text-gray-500">
                                                {formatDate(booking.booking_date)} ·{" "}
                                                {booking.start_time} - {booking.end_time}
                                            </p>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-5 space-y-3 border-t border-gray-200 pt-5 font-bdo text-sm">
                                    <SummaryRow
                                        label="Subtotal"
                                        value={rupiah(bookingOrder.subtotal_amount)}
                                    />
                                    {bookingOrder.discount_amount > 0 && (
                                        <SummaryRow
                                            label="Diskon Warga UB"
                                            value={`-${rupiah(bookingOrder.discount_amount)}`}
                                            tone="success"
                                        />
                                    )}
                                    <SummaryRow
                                        label="Biaya transaksi"
                                        value={rupiah(bookingOrder.transaction_fee)}
                                    />
                                    <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                                        <span className="text-base font-semibold">
                                            Total Pembayaran
                                        </span>
                                        <span className="text-2xl font-semibold tracking-[-0.03em]">
                                            {rupiah(bookingOrder.total_amount)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-[2rem] bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] ring-1 ring-black/5">
                                <div className="mb-5 flex items-center justify-between gap-4">
                                    <div>
                                        <h2 className="font-bdo text-xl font-semibold">
                                            Pembayaran
                                        </h2>
                                        <p className="font-bdo text-sm text-gray-500">
                                            Pilih metode mock payment.
                                        </p>
                                    </div>
                                    <Banknote className="size-5 text-gray-400" />
                                </div>

                                <div className="space-y-3">
                                    {paymentMethods.map((method) => {
                                        const meta = PAYMENT_METHOD_META[method.id];
                                        const Icon = meta.icon;
                                        const active = data.payment_method === method.id;

                                        return (
                                            <button
                                                key={method.id}
                                                type="button"
                                                onClick={() =>
                                                    setData("payment_method", method.id)
                                                }
                                                className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition ${
                                                    active
                                                        ? "border-[#0B4A72] bg-[#eef7fb] shadow-[0_12px_36px_rgba(11,74,114,0.12)]"
                                                        : "border-gray-200 bg-white hover:border-gray-300"
                                                }`}
                                            >
                                                <span
                                                    className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${
                                                        active
                                                            ? "bg-[#0B4A72] text-white"
                                                            : "bg-[#f4f4f4] text-gray-500"
                                                    }`}
                                                >
                                                    <Icon className="size-5" />
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block font-bdo text-[11px] uppercase tracking-[0.12em] text-gray-400">
                                                        {meta.eyebrow}
                                                    </span>
                                                    <span className="block font-bdo text-base font-semibold text-black">
                                                        {method.label}
                                                    </span>
                                                    <span className="mt-0.5 block font-bdo text-sm text-gray-500">
                                                        {meta.description}
                                                    </span>
                                                </span>
                                                <span className="flex flex-col items-end gap-2">
                                                    {active ? (
                                                        <CheckCircle2 className="size-5 text-[#0B4A72]" />
                                                    ) : (
                                                        <span className="size-5 rounded-full border border-gray-300" />
                                                    )}
                                                    <span className="hidden whitespace-nowrap font-bdo text-xs text-gray-400 sm:block">
                                                        {meta.feeLabel}
                                                    </span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>

                                <button
                                    type="submit"
                                    disabled={processing}
                                    className="mt-6 flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-black px-6 font-bdo text-base font-semibold text-white shadow-[0_18px_40px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {processing ? (
                                        <Loader2 className="size-5 animate-spin" />
                                    ) : (
                                        <SelectedPaymentIcon className="size-5" />
                                    )}
                                    Bayar Sekarang
                                </button>
                            </div>
                        </div>
                    </aside>
                </form>
            </main>
        </>
    );
}

function Field({
    label,
    error,
    children,
}: {
    label: string;
    error?: string;
    children: ReactNode;
}) {
    return (
        <label className="block">
            <span className="mb-2 block font-bdo text-sm font-medium text-gray-700">
                {label}
            </span>
            {children}
            {error && (
                <span className="mt-2 block font-bdo text-sm text-red-600">
                    {error}
                </span>
            )}
        </label>
    );
}

function SummaryRow({
    label,
    value,
    tone = "default",
}: {
    label: string;
    value: string;
    tone?: "default" | "success";
}) {
    return (
        <div className="flex items-center justify-between gap-4 text-gray-500">
            <span>{label}</span>
            <span
                className={`font-semibold ${
                    tone === "success" ? "text-emerald-600" : "text-black"
                }`}
            >
                {value}
            </span>
        </div>
    );
}
