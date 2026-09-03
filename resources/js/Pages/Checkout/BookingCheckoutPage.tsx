import Navbar from "@/Components/Landing/Navbar";
import {
    clearPaymentAttemptKey,
    getOrCreatePaymentAttemptKey,
    paymentAttemptIntentScope,
} from "@/lib/paymentAttemptIntent";
import CheckoutMasthead from "./CheckoutMasthead";
import type { PageProps } from "@/types";
import { Head, Link, router, useForm, usePage } from "@inertiajs/react";
import {
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    Banknote,
    CreditCard,
    Landmark,
    Loader2,
    QrCode,
    RefreshCw,
    ShieldCheck,
    type LucideIcon,
} from "lucide-react";
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FormEvent,
    type ReactNode,
} from "react";
import "./BookingCheckoutPage.css";

type IdentityCategory = "warga_ub" | "umum";
type CheckoutTone = "active" | "paid" | "neutral";

interface BookingCheckoutBooking {
    id: number;
    facility_name: string | null;
    facility_unit_name: string | null;
    image_url: string | null;
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
    id: string;
    label: string;
}

type CheckoutPageProps = PageProps<{
    bookingOrder: BookingCheckoutOrder;
    paymentMethods: PaymentMethod[];
    mockPayment: boolean;
    submissionSafetySeconds: number;
    serverNow: string;
}>;

interface CheckoutFormData {
    idempotency_key: string;
    customer_name: string;
    whatsapp_number: string;
    identity_category: IdentityCategory;
    identity_number: string;
    notes: string;
    payment_method: string;
}

interface PaymentMethodMeta {
    eyebrow: string;
    description: string;
    icon: LucideIcon;
}

const PAYMENT_METHOD_META: Record<string, PaymentMethodMeta> = {
    bca_va: {
        eyebrow: "Transfer bank",
        description: "Nomor virtual account dibuat setelah konfirmasi.",
        icon: Landmark,
    },
    qris: {
        eyebrow: "Pembayaran instan",
        description: "Gunakan mobile banking atau dompet digital.",
        icon: QrCode,
    },
    card: {
        eyebrow: "Kartu",
        description: "Kartu debit atau kredit Visa dan Mastercard.",
        icon: CreditCard,
    },
};

const FALLBACK_PAYMENT_META: PaymentMethodMeta = {
    eyebrow: "Metode pembayaran",
    description: "Ikuti petunjuk pembayaran setelah konfirmasi.",
    icon: Banknote,
};


function rupiah(value: number | null | undefined): string {
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
    }).format(value ?? 0);
}

function formatCompactDate(date: string | null): string {
    if (!date) return "Tanggal belum tersedia";

    return new Intl.DateTimeFormat("id-ID", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(new Date(`${date}T00:00:00`));
}

function normalizeIdentityCategory(
    value: string | null | undefined,
): IdentityCategory {
    return value === "warga_ub" ? "warga_ub" : "umum";
}

function normalizeIndonesianPhone(value: string): string {
    let phone = value.replace(/[\s().+\-]+/g, "");

    if (phone.startsWith("0")) {
        phone = `62${phone.slice(1)}`;
    } else if (phone.startsWith("8")) {
        phone = `62${phone}`;
    }

    return phone;
}

function parseExpiry(value: string | null): number | null {
    if (!value) return null;

    const parsed = Date.parse(value.includes("T") ? value : value.replace(" ", "T"));
    return Number.isFinite(parsed) ? parsed : null;
}

function useExpiry(expiresAt: string | null, serverNow: string) {
    const target = useMemo(() => parseExpiry(expiresAt), [expiresAt]);
    const serverOffset = useMemo(() => {
        const serverTimestamp = parseExpiry(serverNow);

        return serverTimestamp === null ? 0 : serverTimestamp - Date.now();
    }, [serverNow]);
    const [remaining, setRemaining] = useState<number | null>(() =>
        target === null
            ? null
            : Math.max(0, target - (Date.now() + serverOffset)),
    );

    useEffect(() => {
        if (target === null) {
            setRemaining(null);
            return;
        }

        const update = () =>
            setRemaining(Math.max(0, target - (Date.now() + serverOffset)));
        update();

        const timer = window.setInterval(update, 1_000);
        return () => window.clearInterval(timer);
    }, [serverOffset, target]);

    const label = useMemo(() => {
        if (remaining === null) return "—";
        if (remaining <= 0) return "00:00";

        const totalSeconds = Math.floor(remaining / 1_000);
        const hours = Math.floor(totalSeconds / 3_600);
        const minutes = Math.floor((totalSeconds % 3_600) / 60);
        const seconds = totalSeconds % 60;

        return hours > 0
            ? `${hours.toString().padStart(2, "0")}:${minutes
                  .toString()
                  .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
            : `${minutes.toString().padStart(2, "0")}:${seconds
                  .toString()
                  .padStart(2, "0")}`;
    }, [remaining]);

    return {
        isExpired: remaining !== null && remaining <= 0,
        remainingMs: remaining,
        label,
    };
}

function resolveCheckoutState({
    order,
    expiredByClock,
    gatewayReady,
    hasPaymentMethods,
}: {
    order: BookingCheckoutOrder;
    expiredByClock: boolean;
    gatewayReady: boolean;
    hasPaymentMethods: boolean;
}) {
    const transactionStatus = order.transaction?.payment_status?.toUpperCase();
    const paid =
        order.status === "paid" && transactionStatus === "PAID";
    const serverPayable =
        ["draft", "pending_payment"].includes(order.status) &&
        transactionStatus === "UNPAID";

    if (paid) {
        return {
            key: "paid",
            tone: "paid" as CheckoutTone,
            label: "Pembayaran selesai",
            description: "Reservasi telah dikonfirmasi dan tercatat.",
            action: "Lihat bukti pembayaran",
            serverPayable: false,
        };
    }

    if (order.status === "expired" || expiredByClock) {
        return {
            key: "expired",
            tone: "neutral" as CheckoutTone,
            label: "Waktu pembayaran berakhir",
            description: "Slot dilepas agar dapat dipilih kembali.",
            action: "Reservasi tidak lagi aktif",
            serverPayable: false,
        };
    }

    if (order.status === "cancelled") {
        return {
            key: "cancelled",
            tone: "neutral" as CheckoutTone,
            label: "Reservasi dibatalkan",
            description: "Tidak ada pembayaran yang dapat diproses.",
            action: "Reservasi telah dibatalkan",
            serverPayable: false,
        };
    }

    if (transactionStatus === "FAILED") {
        return {
            key: "failed",
            tone: "neutral" as CheckoutTone,
            label: "Pembayaran belum berhasil",
            description: "Pilih kembali jadwal untuk membuat transaksi baru.",
            action: "Transaksi tidak dapat dilanjutkan",
            serverPayable: false,
        };
    }

    if (!order.transaction) {
        return {
            key: "missing",
            tone: "neutral" as CheckoutTone,
            label: "Transaksi belum tersedia",
            description: "Muat ulang halaman atau hubungi tim reservasi.",
            action: "Transaksi belum tersedia",
            serverPayable: false,
        };
    }

    if (serverPayable && !gatewayReady) {
        return {
            key: "gateway",
            tone: "neutral" as CheckoutTone,
            label: "Gerbang pembayaran belum aktif",
            description: "Detail reservasi tetap tersimpan selama waktu berlaku.",
            action: "Pembayaran belum tersedia",
            serverPayable: true,
        };
    }

    if (serverPayable && !hasPaymentMethods) {
        return {
            key: "method",
            tone: "neutral" as CheckoutTone,
            label: "Metode pembayaran belum tersedia",
            description: "Coba lagi sebelum batas waktu reservasi berakhir.",
            action: "Pilih metode pembayaran",
            serverPayable: true,
        };
    }

    if (serverPayable) {
        return {
            key: "payable",
            tone: "active" as CheckoutTone,
            label: "Menunggu pembayaran",
            description: "Jadwal ditahan khusus untuk reservasi ini.",
            action: "Bayar dan selesaikan",
            serverPayable: true,
        };
    }

    return {
        key: "unavailable",
        tone: "neutral" as CheckoutTone,
        label: "Status sedang disinkronkan",
        description: "Tindakan pembayaran dinonaktifkan untuk sementara.",
        action: "Pembayaran tidak tersedia",
        serverPayable: false,
    };
}

export default function BookingCheckoutPage() {
    const {
        bookingOrder,
        paymentMethods,
        mockPayment,
        submissionSafetySeconds,
        serverNow,
        auth,
    } = usePage<CheckoutPageProps>().props;
    const expiry = useExpiry(bookingOrder.expires_at, serverNow);
    const [syncingState, setSyncingState] = useState(false);
    const syncingStateRef = useRef(false);
    const errorSummaryRef = useRef<HTMLDivElement>(null);
    const automaticSyncAtRef = useRef(0);
    const initialPaymentMethod = paymentMethods[0]?.id ?? "";
    const paymentIntentScopeFor = (paymentMethod: string) =>
        paymentAttemptIntentScope([
            "booking",
            auth.user?.id ?? null,
            bookingOrder.id,
            bookingOrder.transaction?.id ?? null,
            paymentMethod,
        ]);

    const { data, setData, post, processing, errors, clearErrors } =
        useForm<CheckoutFormData>({
            idempotency_key: getOrCreatePaymentAttemptKey(
                paymentIntentScopeFor(initialPaymentMethod),
            ),
            customer_name:
                bookingOrder.customer_name ?? auth.user?.name ?? "",
            whatsapp_number:
                bookingOrder.whatsapp_number ??
                auth.user?.phone_number ??
                "+62",
            identity_category: normalizeIdentityCategory(
                bookingOrder.identity_category ??
                    auth.user?.identity_category,
            ),
            identity_number:
                bookingOrder.identity_number ??
                auth.user?.identity_number ??
                "",
            notes: bookingOrder.notes ?? "",
            payment_method: initialPaymentMethod,
        });
    const formErrors = errors as Record<string, string | undefined>;

    const state = resolveCheckoutState({
        order: bookingOrder,
        expiredByClock: expiry.isExpired,
        gatewayReady: mockPayment,
        hasPaymentMethods: paymentMethods.length > 0,
    });
    const formLocked = state.key !== "payable";
    const receiptNumber =
        bookingOrder.transaction?.receipt_number ??
        `DRAFT-${bookingOrder.id.toString().padStart(6, "0")}`;
    const priceBeforeDiscount =
        bookingOrder.subtotal_amount + bookingOrder.discount_amount;
    const supportRequest = (() => {
        switch (state.key) {
            case "paid":
                return "Mohon bantu memastikan detail reservasi dan bukti pembayaran saya sudah tercatat dengan benar.";
            case "expired":
                return "Waktu pembayaran saya telah berakhir. Mohon bantu periksa apakah jadwal ini masih dapat dipesan kembali.";
            case "cancelled":
                return "Reservasi saya dibatalkan. Mohon bantu jelaskan status dan pilihan pemesanan berikutnya.";
            case "failed":
                return "Pembayaran saya belum berhasil. Mohon bantu periksa status transaksi dan langkah aman berikutnya.";
            case "missing":
            case "gateway":
            case "method":
            case "unavailable":
                return "Mohon bantu periksa status reservasi dan pilihan pembayaran yang tersedia untuk saya.";
            default:
                return "Mohon bantu saya menyelesaikan pembayaran reservasi ini.";
        }
    })();
    const supportMessage = [
        "Halo tim reservasi UB Sport Center, saya membutuhkan bantuan terkait reservasi berikut.",
        `Nomor transaksi: ${receiptNumber}`,
        `Jumlah jadwal: ${bookingOrder.bookings.length}`,
        `Total pembayaran: ${rupiah(bookingOrder.total_amount)}`,
        `Status saat ini: ${state.label}`,
        supportRequest,
        "Terima kasih.",
    ].join("\n");
    const whatsappSupportHref = `https://wa.me/6285280809080?text=${encodeURIComponent(
        supportMessage,
    )}`;
    const normalizedPhone = normalizeIndonesianPhone(data.whatsapp_number);
    const customerDataComplete =
        data.customer_name.trim().length >= 2 &&
        data.customer_name.trim().length <= 255 &&
        /^628[0-9]{7,13}$/.test(normalizedPhone) &&
        data.notes.length <= 1000 &&
        (data.identity_category !== "warga_ub" ||
            /^[0-9]{6,30}$/.test(data.identity_number.trim()));
    const submissionWindowOpen =
        expiry.remainingMs === null ||
        expiry.remainingMs > Math.max(0, submissionSafetySeconds) * 1_000;
    const canSubmit =
        state.key === "payable" &&
        state.serverPayable &&
        customerDataComplete &&
        submissionWindowOpen &&
        Boolean(data.payment_method) &&
        !processing;
    const operationalError =
        formErrors.checkout ??
        formErrors.idempotency_key ??
        formErrors.identity_category ??
        formErrors.payment_method ??
        null;
    const checkoutStage = (() => {
        if (["paid", "expired", "cancelled", "failed"].includes(state.key)) {
            return 3;
        }

        if (
            customerDataComplete &&
            [
                "payable",
                "gateway",
                "method",
                "missing",
                "unavailable",
            ].includes(state.key)
        ) {
            return 2;
        }

        return 1;
    })();

    const syncCheckoutState = useCallback((clearCurrentErrors = false) => {
        if (syncingStateRef.current || processing) return;

        syncingStateRef.current = true;
        setSyncingState(true);
        if (clearCurrentErrors) clearErrors();

        router.reload({
            only: [
                "bookingOrder",
                "paymentMethods",
                "mockPayment",
                "submissionSafetySeconds",
                "serverNow",
            ],
            onFinish: () => {
                syncingStateRef.current = false;
                setSyncingState(false);
            },
        });
    }, [clearErrors, processing]);

    useEffect(() => {
        if (!state.serverPayable) return;

        const syncWhenVisible = () => {
            if (document.visibilityState !== "visible") return;

            const now = Date.now();
            if (now - automaticSyncAtRef.current < 3_000) return;
            automaticSyncAtRef.current = now;
            syncCheckoutState(false);
        };

        window.addEventListener("focus", syncWhenVisible);
        document.addEventListener("visibilitychange", syncWhenVisible);

        return () => {
            window.removeEventListener("focus", syncWhenVisible);
            document.removeEventListener("visibilitychange", syncWhenVisible);
        };
    }, [state.serverPayable, syncCheckoutState]);

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canSubmit) return;

        post(route("checkout.booking.mock-pay", bookingOrder.id), {
            preserveScroll: true,
            onSuccess: (page) => {
                if (page.component === "Checkout/BookingSuccessPage") {
                    clearPaymentAttemptKey(
                        paymentIntentScopeFor(data.payment_method),
                    );
                }
            },
            onError: (formErrors) => {
                if (formErrors.idempotency_key) {
                    const scope = paymentIntentScopeFor(data.payment_method);
                    clearPaymentAttemptKey(scope);
                    setData(
                        "idempotency_key",
                        getOrCreatePaymentAttemptKey(scope),
                    );
                }

                window.requestAnimationFrame(() => {
                    const fieldByError: Record<string, string> = {
                        customer_name: "checkout-customer-name",
                        whatsapp_number: "checkout-whatsapp-number",
                        identity_number: "checkout-identity-number",
                        notes: "checkout-notes",
                    };
                    const firstField = Object.keys(fieldByError).find(
                        (key) => Boolean(formErrors[key]),
                    );

                    if (firstField) {
                        document
                            .getElementById(fieldByError[firstField])
                            ?.focus();
                        return;
                    }

                    errorSummaryRef.current?.focus();
                });
            },
        });
    };

    return (
        <>
            <Head>
                <title>Checkout Booking | UB Sport Center</title>
                <meta
                    name="description"
                    content="Konfirmasi detail reservasi dan selesaikan pembayaran fasilitas UB Sport Center."
                />
            </Head>

            <main className="booking-checkout">
                <Navbar activeSection="Booking" surface="media" />

                <CheckoutMasthead />

                <section
                    className="checkout-canvas"
                    data-section
                    aria-labelledby="checkout-page-title"
                >
                    <header className="checkout-lead">
                        <Link
                            href={route("booking")}
                            className="checkout-lead__back"
                        >
                            <ArrowLeft aria-hidden="true" />
                            Kembali ke booking
                        </Link>
                        <div className="checkout-lead__rail">
                            <div className="checkout-lead__folio">
                                <span>Checkout / 06</span>
                                <strong>Reservasi fasilitas</strong>
                            </div>
                            <h1 id="checkout-page-title">
                                Selesaikan reservasi
                            </h1>
                            <dl className="checkout-lead__meta">
                                <div>
                                    <dt>Jadwal dipilih</dt>
                                    <dd>
                                        <strong>
                                            {bookingOrder.bookings.length
                                                .toString()
                                                .padStart(2, "0")}
                                        </strong>{" "}
                                        reservasi
                                    </dd>
                                </div>
                                <div>
                                    <dt>Nomor transaksi</dt>
                                    <dd>{receiptNumber}</dd>
                                </div>
                            </dl>
                        </div>
                    </header>

                    <nav
                        className="checkout-journey"
                        aria-label={`Progres checkout, tahap ${checkoutStage} dari 3`}
                    >
                        <ol className="checkout-journey__route">
                            {(
                                [
                                    [1, "Informasi", "Data pemesan"],
                                    [2, "Pembayaran", "Pilih metode"],
                                    [3, "Selesai", "Status akhir"],
                                ] as const
                            ).map(([step, label, caption]) => {
                                const itemState =
                                    step < checkoutStage
                                        ? "done"
                                        : step === checkoutStage
                                          ? "current"
                                          : "upcoming";

                                return (
                                    <li
                                        key={step}
                                        data-state={itemState}
                                        aria-current={
                                            itemState === "current"
                                                ? "step"
                                                : undefined
                                        }
                                    >
                                        <span className="checkout-journey__number">
                                            {String(step).padStart(2, "0")}/
                                        </span>
                                        <span className="checkout-journey__copy">
                                            <strong>{label}</strong>
                                            <small>{caption}</small>
                                        </span>
                                    </li>
                                );
                            })}
                        </ol>
                    </nav>

                    <form className="checkout-layout" onSubmit={submit}>
                        {operationalError && (
                            <div
                                ref={errorSummaryRef}
                                className="checkout-error-summary"
                                role="alert"
                                tabIndex={-1}
                                aria-labelledby="checkout-error-title"
                            >
                                <AlertTriangle aria-hidden="true" />
                                <span className="checkout-error-summary__copy">
                                    <strong id="checkout-error-title">
                                        Transaksi belum diteruskan
                                    </strong>
                                    <span>{operationalError}</span>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => syncCheckoutState(true)}
                                    disabled={syncingState || processing}
                                >
                                    <RefreshCw
                                        aria-hidden="true"
                                        className={
                                            syncingState
                                                ? "checkout-error-summary__spinner"
                                                : undefined
                                        }
                                    />
                                    {syncingState
                                        ? "Menyinkronkan"
                                        : "Sinkronkan status"}
                                </button>
                            </div>
                        )}
                        <div className="checkout-form-column">
                            <CheckoutBlock
                                index="01"
                                title="Formulir pemesan"
                                description="Lengkapi data kontak penerima status dan bukti reservasi."
                            >
                                <div className="checkout-field-grid">
                                    <Field
                                        htmlFor="checkout-customer-name"
                                        label="Nama lengkap"
                                        error={errors.customer_name}
                                        required
                                    >
                                        <input
                                            id="checkout-customer-name"
                                            name="customer_name"
                                            value={data.customer_name}
                                            onChange={(event) => {
                                                setData(
                                                    "customer_name",
                                                    event.target.value,
                                                );
                                                clearErrors("customer_name");
                                            }}
                                            className="checkout-input"
                                            placeholder="Nama sesuai identitas"
                                            autoComplete="name"
                                            disabled={formLocked}
                                            aria-invalid={
                                                errors.customer_name
                                                    ? "true"
                                                    : undefined
                                            }
                                            aria-describedby={
                                                errors.customer_name
                                                    ? "checkout-customer-name-error"
                                                    : undefined
                                            }
                                            required
                                        />
                                    </Field>

                                    <Field
                                        htmlFor="checkout-whatsapp-number"
                                        label="Nomor WhatsApp"
                                        error={errors.whatsapp_number}
                                        required
                                    >
                                        <input
                                            id="checkout-whatsapp-number"
                                            name="whatsapp_number"
                                            value={data.whatsapp_number}
                                            onChange={(event) => {
                                                setData(
                                                    "whatsapp_number",
                                                    event.target.value,
                                                );
                                                clearErrors("whatsapp_number");
                                            }}
                                            className="checkout-input"
                                            placeholder="+62 812 3456 7890"
                                            autoComplete="tel"
                                            inputMode="tel"
                                            disabled={formLocked}
                                            aria-invalid={
                                                errors.whatsapp_number
                                                    ? "true"
                                                    : undefined
                                            }
                                            aria-describedby={
                                                errors.whatsapp_number
                                                    ? "checkout-whatsapp-number-error"
                                                    : undefined
                                            }
                                            required
                                        />
                                    </Field>

                                    <div className="checkout-field checkout-field--full">
                                        <span className="checkout-field__label">
                                            Identitas akun
                                        </span>
                                        <div className="checkout-identity">
                                            <div>
                                                <span>Kategori harga</span>
                                                <strong>
                                                    {data.identity_category ===
                                                    "warga_ub"
                                                        ? "Warga UB"
                                                        : "Umum"}
                                                </strong>
                                            </div>
                                            <div>
                                                <span>Status data</span>
                                                <strong>
                                                    Terkunci dan terverifikasi
                                                </strong>
                                            </div>
                                        </div>
                                        <span className="checkout-field__hint">
                                            Harga mengikuti identitas akun.
                                        </span>
                                    </div>

                                    {data.identity_category === "warga_ub" && (
                                        <Field
                                            htmlFor="checkout-identity-number"
                                            label="NIM / NIDN"
                                            error={errors.identity_number}
                                        >
                                            <input
                                                id="checkout-identity-number"
                                                name="identity_number"
                                                value={data.identity_number}
                                                className="checkout-input"
                                                inputMode="numeric"
                                                readOnly
                                                aria-invalid={
                                                    errors.identity_number
                                                        ? "true"
                                                        : undefined
                                                }
                                                aria-describedby={
                                                    errors.identity_number
                                                        ? "checkout-identity-number-error"
                                                        : undefined
                                                }
                                            />
                                        </Field>
                                    )}

                                    <Field
                                        htmlFor="checkout-notes"
                                        label="Catatan"
                                        hint="Opsional — kebutuhan akses atau informasi kedatangan."
                                        error={errors.notes}
                                        full
                                    >
                                        <textarea
                                            id="checkout-notes"
                                            name="notes"
                                            value={data.notes}
                                            onChange={(event) => {
                                                setData(
                                                    "notes",
                                                    event.target.value,
                                                );
                                                clearErrors("notes");
                                            }}
                                            className="checkout-input"
                                            placeholder="Tambahkan catatan bila diperlukan"
                                            disabled={formLocked}
                                            aria-invalid={
                                                errors.notes
                                                    ? "true"
                                                    : undefined
                                            }
                                            aria-describedby={
                                                errors.notes
                                                    ? "checkout-notes-error"
                                                    : "checkout-notes-hint"
                                            }
                                        />
                                    </Field>
                                </div>
                            </CheckoutBlock>

                            <CheckoutBlock
                                index="02"
                                title="Metode pembayaran"
                                description="Pilih satu metode untuk menyelesaikan reservasi."
                            >
                                <div
                                    className="checkout-payment-list"
                                    role="radiogroup"
                                    aria-label="Metode pembayaran"
                                    aria-describedby={
                                        errors.payment_method
                                            ? "checkout-payment-method-error"
                                            : undefined
                                    }
                                >
                                    {paymentMethods.length > 0 ? (
                                        paymentMethods.map((method) => {
                                            const meta =
                                                PAYMENT_METHOD_META[method.id] ??
                                                FALLBACK_PAYMENT_META;
                                            const Icon = meta.icon;
                                            const active =
                                                data.payment_method ===
                                                method.id;

                                            return (
                                                <label
                                                    className="checkout-payment-method"
                                                    data-active={active}
                                                    data-disabled={formLocked}
                                                    key={method.id}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="payment_method"
                                                        value={method.id}
                                                        checked={active}
                                                        onChange={() => {
                                                            setData(
                                                                (current) => ({
                                                                    ...current,
                                                                    payment_method:
                                                                        method.id,
                                                                    idempotency_key:
                                                                        getOrCreatePaymentAttemptKey(
                                                                            paymentIntentScopeFor(
                                                                                method.id,
                                                                            ),
                                                                    ),
                                                                }),
                                                            );
                                                            clearErrors(
                                                                "payment_method",
                                                            );
                                                        }}
                                                        disabled={formLocked}
                                                    />
                                                    <span className="checkout-payment-method__icon">
                                                        <Icon aria-hidden="true" />
                                                    </span>
                                                    <span className="checkout-payment-method__copy">
                                                        <small>
                                                            {meta.eyebrow}
                                                        </small>
                                                        <strong>
                                                            {method.label}
                                                        </strong>
                                                        <span>
                                                            {meta.description}
                                                        </span>
                                                    </span>
                                                    <span
                                                        className="checkout-payment-method__radio"
                                                        aria-hidden="true"
                                                    />
                                                </label>
                                            );
                                        })
                                    ) : (
                                        <p className="checkout-empty">
                                            Metode pembayaran belum tersedia.
                                            Coba muat ulang halaman sebelum
                                            batas reservasi berakhir.
                                        </p>
                                    )}

                                    {errors.payment_method && (
                                        <span
                                            className="checkout-field__error"
                                            id="checkout-payment-method-error"
                                        >
                                            {errors.payment_method}
                                        </span>
                                    )}
                                </div>
                            </CheckoutBlock>
                        </div>

                        <aside
                            className="checkout-summary-column"
                            aria-label="Ringkasan reservasi"
                        >
                            <div className="checkout-summary">
                                <header className="checkout-summary__head">
                                    <div>
                                        <p>Reservasi</p>
                                        <h2>
                                            Ringkasan{" "}
                                            <span>
                                                (
                                                {bookingOrder.bookings.length
                                                    .toString()
                                                    .padStart(2, "0")}
                                                )
                                            </span>
                                        </h2>
                                    </div>
                                </header>

                                {bookingOrder.bookings.length > 0 ? (
                                    <ol className="checkout-order-list">
                                        {bookingOrder.bookings.map(
                                            (booking, index) => (
                                                <li
                                                    className="checkout-order-item"
                                                    key={booking.id}
                                                >
                                                    <span className="checkout-order-item__index">
                                                        {String(index + 1).padStart(
                                                            2,
                                                            "0",
                                                        )}
                                                        /
                                                    </span>
                                                    <figure className="checkout-order-item__media">
                                                        <span aria-hidden="true">
                                                            UB
                                                        </span>
                                                        {booking.image_url && (
                                                            <img
                                                                src={
                                                                    booking.image_url
                                                                }
                                                                alt=""
                                                                loading={
                                                                    index === 0
                                                                        ? "eager"
                                                                        : "lazy"
                                                                }
                                                                decoding="async"
                                                                onError={(
                                                                    event,
                                                                ) => {
                                                                    event.currentTarget.hidden =
                                                                        true;
                                                                }}
                                                            />
                                                        )}
                                                    </figure>
                                                    <div className="checkout-order-item__copy">
                                                        <strong>
                                                            {booking.facility_name ??
                                                                "Fasilitas"}
                                                        </strong>
                                                        <span>
                                                            {booking.facility_unit_name ??
                                                                "Unit utama"}
                                                        </span>
                                                        <time
                                                            dateTime={
                                                                booking.booking_date
                                                                    ? `${booking.booking_date}T${booking.start_time}:00`
                                                                    : undefined
                                                            }
                                                            aria-label={`${formatCompactDate(
                                                                booking.booking_date,
                                                            )}, pukul ${booking.start_time} sampai ${booking.end_time}`}
                                                        >
                                                            <span>
                                                                {formatCompactDate(
                                                                    booking.booking_date,
                                                                )}
                                                            </span>
                                                            <span>
                                                                {
                                                                    booking.start_time
                                                                }
                                                                {"\u2013"}
                                                                {booking.end_time}
                                                            </span>
                                                        </time>
                                                    </div>
                                                    <p
                                                        className="checkout-order-item__price"
                                                        title={rupiah(
                                                            booking.subtotal_price,
                                                        )}
                                                        aria-label={`Harga ${rupiah(
                                                            booking.subtotal_price,
                                                        )}`}
                                                    >
                                                        {rupiah(
                                                            booking.subtotal_price,
                                                        )}
                                                    </p>
                                                </li>
                                            ),
                                        )}
                                    </ol>
                                ) : (
                                    <p
                                        className="checkout-empty checkout-empty--summary"
                                    >
                                        Tidak ada jadwal di dalam reservasi ini.
                                    </p>
                                )}

                                <div className="checkout-price-summary">
                                    <SummaryRow
                                        label={
                                            bookingOrder.discount_amount > 0
                                                ? "Harga reguler"
                                                : "Subtotal"
                                        }
                                        value={rupiah(priceBeforeDiscount)}
                                    />
                                    {bookingOrder.discount_amount > 0 && (
                                        <SummaryRow
                                            label="Potongan harga akun"
                                            value={`-${rupiah(
                                                bookingOrder.discount_amount,
                                            )}`}
                                            tone="success"
                                        />
                                    )}
                                    <SummaryRow
                                        label="Biaya transaksi"
                                        value={rupiah(
                                            bookingOrder.transaction_fee,
                                        )}
                                    />
                                    <div className="checkout-price-total">
                                        <span>Total pembayaran</span>
                                        <strong>
                                            {rupiah(bookingOrder.total_amount)}
                                        </strong>
                                    </div>
                                </div>

                                <div
                                    className="checkout-state"
                                    data-tone={state.tone}
                                >
                                    <span
                                        className="checkout-state__dot"
                                        aria-hidden="true"
                                    />
                                    <span
                                        className="checkout-state__copy"
                                        role="status"
                                        aria-live="polite"
                                    >
                                        <strong>{state.label}</strong>
                                        <span>{state.description}</span>
                                    </span>
                                    <span className="checkout-state__timer">
                                        <small>Sisa waktu pembayaran</small>
                                        <time
                                            dateTime={
                                                bookingOrder.expires_at ??
                                                undefined
                                            }
                                        >
                                            {expiry.label}
                                        </time>
                                    </span>
                                </div>

                                <div className="checkout-action">
                                    {state.key === "paid" ? (
                                        <Link
                                            href={route(
                                                "checkout.booking.success",
                                                bookingOrder.id,
                                            )}
                                            className="checkout-action__primary"
                                        >
                                            <span>{state.action}</span>
                                            <ArrowRight aria-hidden="true" />
                                        </Link>
                                    ) : (
                                        <button
                                            type="submit"
                                            className="checkout-action__primary"
                                            disabled={!canSubmit}
                                        >
                                            <span>
                                                 {processing
                                                     ? "Memproses pembayaran"
                                                     : !submissionWindowOpen &&
                                                         state.key === "payable"
                                                       ? "Waktu pembayaran berakhir"
                                                     : state.key === "payable" &&
                                                         !customerDataComplete
                                                      ? "Lengkapi data pemesan"
                                                    : state.action}
                                            </span>
                                            {processing ? (
                                                <Loader2
                                                    className="checkout-action__spinner"
                                                    aria-hidden="true"
                                                />
                                            ) : (
                                                <ArrowRight aria-hidden="true" />
                                            )}
                                        </button>
                                    )}

                                    <p className="checkout-action__support">
                                        <ShieldCheck aria-hidden="true" />
                                        <span>
                                            {state.key === "payable" &&
                                            !customerDataComplete
                                                ? "Nama lengkap dan nomor WhatsApp aktif wajib diisi sebelum pembayaran."
                                                : "Harga dan ketersediaan diperiksa kembali sebelum transaksi dikonfirmasi."}
                                        </span>
                                    </p>

                                    {["expired", "cancelled", "failed"].includes(
                                        state.key,
                                    ) && (
                                        <Link
                                            href={route("booking")}
                                            className="checkout-action__secondary"
                                        >
                                            Pilih jadwal baru
                                            <ArrowRight aria-hidden="true" />
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </aside>
                    </form>

                    <footer className="checkout-footnote">
                        <span>
                            UB Sport Center · Sistem reservasi fasilitas
                        </span>
                        <span>
                            Perlu kepastian sebelum melanjutkan?{" "}
                            <a
                                href={whatsappSupportHref}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Bicara langsung dengan tim reservasi
                            </a>
                        </span>
                    </footer>
                </section>
            </main>
        </>
    );
}

function CheckoutBlock({
    index,
    title,
    description,
    children,
}: {
    index: string;
    title: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <section className="checkout-block">
            <header className="checkout-block__head">
                <span className="checkout-block__index">({index})</span>
                <h2>{title}</h2>
                <p>{description}</p>
            </header>
            {children}
        </section>
    );
}

function Field({
    htmlFor,
    label,
    hint,
    error,
    required = false,
    full = false,
    children,
}: {
    htmlFor: string;
    label: string;
    hint?: string;
    error?: string;
    required?: boolean;
    full?: boolean;
    children: ReactNode;
}) {
    return (
        <label
            className={`checkout-field ${
                full ? "checkout-field--full" : ""
            }`}
            htmlFor={htmlFor}
        >
            <span className="checkout-field__label">
                {label}
                {required && <small>Wajib</small>}
            </span>
            {children}
            {hint && !error && (
                <span
                    className="checkout-field__hint"
                    id={`${htmlFor}-hint`}
                >
                    {hint}
                </span>
            )}
            {error && (
                <span
                    className="checkout-field__error"
                    id={`${htmlFor}-error`}
                >
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
        <div className="checkout-price-row" data-tone={tone}>
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}
