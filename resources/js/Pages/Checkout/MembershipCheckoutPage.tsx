import Navbar from "@/Components/Landing/Navbar";
import {
    clearPaymentAttemptKey,
    getOrCreatePaymentAttemptKey,
    paymentAttemptIntentScope,
} from "@/lib/paymentAttemptIntent";
import type { MembershipPlanTier, PageProps } from "@/types";
import { Head, Link, router, useForm, usePage } from "@inertiajs/react";
import axios from "axios";
import {
    ArrowLeft,
    ArrowRight,
    Banknote,
    CreditCard,
    Landmark,
    Loader2,
    QrCode,
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
import CheckoutMasthead from "./CheckoutMasthead";

type CheckoutTone = "active" | "paid" | "neutral";
type RegistrationCategory = "warga_ub" | "umum" | string;

interface MembershipPlan {
    id?: number | null;
    name?: string | null;
    tier?: MembershipPlanTier | string | null;
    tier_label?: string | null;
    price?: number | null;
    compare_at_price?: number | null;
    discount_amount?: number | null;
    duration_months?: number | null;
    duration_label?: string | null;
    card_image_url?: string | null;
    image_url?: string | null;
}

interface MembershipTransaction {
    id?: number | null;
    receipt_number?: string | null;
    amount?: number | null;
    payment_status?: string | null;
    payment_method?: string | null;
    checkout_url?: string | null;
    gateway_url?: string | null;
    paid_at?: string | null;
}

interface MembershipRegistration {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    gender?: string | null;
    category?: RegistrationCategory | null;
    expires_at?: string | null;
}

interface PaymentMethod {
    id: string;
    label: string;
}

interface MembershipPayment {
    payable?: boolean;
    action?: string | null;
    pay_url?: string | null;
    methods?: Array<PaymentMethod | string> | null;
    mock_enabled?: boolean;
    checkout_url?: string | null;
    gateway_url?: string | null;
    poll_url?: string | null;
    expires_at?: string | null;
    server_now?: string | null;
    success_url?: string | null;
    unavailable_reason?: string | null;
}

interface CheckoutMembership {
    id: number;
    status?: string | null;
    customer_name?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    registration_email?: string | null;
    registration_phone?: string | null;
    registration_gender?: string | null;
    registration_category?: RegistrationCategory | null;
    registration_expires_at?: string | null;
    plan?: MembershipPlan | null;
    transaction?: MembershipTransaction | null;
    registration?: MembershipRegistration | null;
    payment?: MembershipPayment | null;
    poll_url?: string | null;
    success_url?: string | null;
}

type MembershipCheckoutProps = PageProps<{
    membership: CheckoutMembership;
    paymentMethods?: PaymentMethod[];
    mockPayment?: boolean;
    serverNow?: string | null;
    paymentAction?: string | null;
    actionUrl?: string | null;
    pollUrl?: string | null;
    successUrl?: string | null;
    invoiceUrl?: string | null;
    completed?: boolean;
}>;

interface PaymentForm {
    customer_name: string;
    whatsapp_number: string;
    payment_method: string;
    idempotency_key: string;
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

function parseDate(value: string | null | undefined): number | null {
    if (!value) return null;

    const parsed = Date.parse(
        value.includes("T") ? value : value.replace(" ", "T"),
    );

    return Number.isFinite(parsed) ? parsed : null;
}

function compactDate(value: string | null | undefined): string {
    const parsed = parseDate(value);
    if (parsed === null) return "Belum ditentukan";

    return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(new Date(parsed));
}

function normalizeTier(value: string | null | undefined): MembershipPlanTier {
    const tier = String(value ?? "hemat").toLocaleLowerCase("id-ID");

    return tier === "hemat" ||
        tier === "favorit" ||
        tier === "performa" ||
        tier === "eksklusif"
        ? tier
        : "hemat";
}

function durationLabel(plan: MembershipPlan | null | undefined): string {
    if (plan?.duration_label) return plan.duration_label;

    const months = Number(plan?.duration_months ?? 0);
    if (months === 12) return "1 tahun";
    if (months === 1) return "1 bulan";
    if (months > 1) return `${months} bulan`;

    return "Periode membership";
}

function categoryLabel(value: RegistrationCategory | null | undefined): string {
    if (value === "warga_ub") return "Warga UB";
    if (value === "umum") return "Umum";

    return value ? String(value) : "Akun terverifikasi";
}

function genderLabel(value: string | null | undefined): string {
    if (value === "L") return "Laki-laki";
    if (value === "P") return "Perempuan";

    return "Tidak dicantumkan";
}

function normalizePaymentMethods(
    direct: PaymentMethod[] | undefined,
    nested: MembershipPayment["methods"],
): PaymentMethod[] {
    const source = direct?.length ? direct : nested ?? [];

    return source
        .map((method) =>
            typeof method === "string"
                ? { id: method, label: method.toUpperCase() }
                : method,
        )
        .filter(
            (method): method is PaymentMethod =>
                Boolean(method?.id && method?.label),
        );
}

function useExpiry(
    expiresAt: string | null | undefined,
    serverNow: string | null | undefined,
) {
    const target = useMemo(() => parseDate(expiresAt), [expiresAt]);
    const serverOffset = useMemo(() => {
        const timestamp = parseDate(serverNow);
        return timestamp === null ? 0 : timestamp - Date.now();
    }, [serverNow]);
    const calculateRemaining = useCallback(
        () =>
            target === null
                ? null
                : Math.max(0, target - (Date.now() + serverOffset)),
        [serverOffset, target],
    );
    const [remaining, setRemaining] = useState<number | null>(
        calculateRemaining,
    );

    useEffect(() => {
        setRemaining(calculateRemaining());
        if (target === null) return;

        const timer = window.setInterval(
            () => setRemaining(calculateRemaining()),
            1_000,
        );

        return () => window.clearInterval(timer);
    }, [calculateRemaining, target]);

    const label = useMemo(() => {
        if (remaining === null) return "—";
        if (remaining <= 0) return "00:00";

        const totalSeconds = Math.floor(remaining / 1_000);
        const hours = Math.floor(totalSeconds / 3_600);
        const minutes = Math.floor((totalSeconds % 3_600) / 60);
        const seconds = totalSeconds % 60;

        return hours > 0
            ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
                  2,
                  "0",
              )}:${String(seconds).padStart(2, "0")}`
            : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
                  2,
                  "0",
              )}`;
    }, [remaining]);

    return {
        isExpired: remaining !== null && remaining <= 0,
        label,
    };
}

function resolveCheckoutState(
    membership: CheckoutMembership,
    expiredByClock: boolean,
    gatewayReady: boolean,
    hasPaymentMethods: boolean,
) {
    const membershipStatus = String(
        membership.status ?? "",
    ).toLocaleLowerCase("id-ID");
    const transactionStatus = String(
        membership.transaction?.payment_status ?? "",
    ).toUpperCase();
    const paid =
        membershipStatus === "active" && transactionStatus === "PAID";

    if (paid) {
        return {
            key: "paid",
            tone: "paid" as CheckoutTone,
            label: "Pembayaran selesai",
            description: "Membership aktif dan telah tercatat di akun Anda.",
            action: "Lihat bukti pembayaran",
            serverPayable: false,
        };
    }

    if (
        membershipStatus === "expired" ||
        (membershipStatus === "pending_payment" && expiredByClock)
    ) {
        return {
            key: "expired",
            tone: "neutral" as CheckoutTone,
            label: "Waktu pembayaran berakhir",
            description: "Paket dilepas dan tidak lagi menunggu pembayaran.",
            action: "Pendaftaran tidak lagi aktif",
            serverPayable: false,
        };
    }

    if (membershipStatus === "cancelled") {
        return {
            key: "cancelled",
            tone: "neutral" as CheckoutTone,
            label: "Pendaftaran dibatalkan",
            description: "Tidak ada pembayaran yang dapat diproses.",
            action: "Pendaftaran telah dibatalkan",
            serverPayable: false,
        };
    }

    if (["FAILED", "EXPIRED"].includes(transactionStatus)) {
        return {
            key: "failed",
            tone: "neutral" as CheckoutTone,
            label: "Transaksi tidak dapat dilanjutkan",
            description: "Pilih kembali paket untuk membuat transaksi baru.",
            action: "Transaksi telah berakhir",
            serverPayable: false,
        };
    }

    if (!membership.transaction) {
        return {
            key: "missing",
            tone: "neutral" as CheckoutTone,
            label: "Transaksi belum tersedia",
            description: "Muat ulang halaman atau hubungi tim membership.",
            action: "Transaksi belum tersedia",
            serverPayable: false,
        };
    }

    const serverPayable =
        membershipStatus === "pending_payment" &&
        transactionStatus === "UNPAID" &&
        membership.payment?.payable !== false;

    if (serverPayable && !gatewayReady) {
        return {
            key: "gateway",
            tone: "neutral" as CheckoutTone,
            label: "Gerbang pembayaran belum aktif",
            description: "Pendaftaran tetap tersimpan selama waktu berlaku.",
            action: "Pembayaran belum tersedia",
            serverPayable: true,
        };
    }

    if (serverPayable && !hasPaymentMethods) {
        return {
            key: "method",
            tone: "neutral" as CheckoutTone,
            label: "Metode pembayaran belum tersedia",
            description: "Coba lagi sebelum waktu pembayaran berakhir.",
            action: "Pilih metode pembayaran",
            serverPayable: true,
        };
    }

    if (serverPayable) {
        return {
            key: "payable",
            tone: "active" as CheckoutTone,
            label: "Menunggu pembayaran",
            description: "Paket ditahan khusus untuk pendaftaran ini.",
            action: "Bayar dan aktifkan",
            serverPayable: true,
        };
    }

    return {
        key: "unavailable",
        tone: "neutral" as CheckoutTone,
        label: membership.payment?.unavailable_reason
            ? "Pembayaran tidak tersedia"
            : "Status sedang disinkronkan",
        description:
            membership.payment?.unavailable_reason?.trim() ||
            "Pembayaran dinonaktifkan sementara agar tetap aman.",
        action: "Pembayaran tidak tersedia",
        serverPayable: false,
    };
}

function mergeMembership(
    previous: CheckoutMembership,
    next: Partial<CheckoutMembership>,
): CheckoutMembership {
    return {
        ...previous,
        ...next,
        plan: next.plan === undefined ? previous.plan : next.plan,
        registration:
            next.registration === undefined
                ? previous.registration
                : next.registration,
        transaction:
            next.transaction === undefined
                ? previous.transaction
                : next.transaction,
        payment:
            next.payment === undefined
                ? previous.payment
                : {
                      ...(previous.payment ?? {}),
                      ...(next.payment ?? {}),
                  },
    };
}

export default function MembershipCheckoutPage() {
    const page = usePage<MembershipCheckoutProps>();
    const {
        membership: initialMembership,
        paymentMethods: directPaymentMethods,
        mockPayment = false,
        serverNow: directServerNow,
        paymentAction,
        actionUrl: legacyActionUrl,
        pollUrl: directPollUrl,
        successUrl: directSuccessUrl,
        auth,
    } = page.props;
    const [membership, setMembership] =
        useState<CheckoutMembership>(initialMembership);

    useEffect(() => {
        setMembership(initialMembership);
    }, [initialMembership]);

    const paymentMethods = useMemo(
        () =>
            normalizePaymentMethods(
                directPaymentMethods,
                membership.payment?.methods,
            ),
        [directPaymentMethods, membership.payment?.methods],
    );
    const actionUrl =
        paymentAction ??
        legacyActionUrl ??
        membership.payment?.pay_url ??
        null;
    const pollUrl =
        directPollUrl ??
        membership.poll_url ??
        membership.payment?.poll_url ??
        null;
    const successUrl =
        directSuccessUrl ??
        membership.success_url ??
        membership.payment?.success_url ??
        route("checkout.membership.success", membership.id);
    const gatewayUrl =
        membership.payment?.gateway_url ??
        membership.transaction?.gateway_url ??
        null;
    const expiresAt =
        membership.payment?.expires_at ??
        membership.registration?.expires_at ??
        membership.registration_expires_at ??
        null;
    const serverNow =
        membership.payment?.server_now ?? directServerNow ?? null;
    const expiry = useExpiry(expiresAt, serverNow);
    const gatewayReady = Boolean(
        (mockPayment && actionUrl) || gatewayUrl,
    );
    const state = resolveCheckoutState(
        membership,
        expiry.isExpired,
        gatewayReady,
        paymentMethods.length > 0,
    );
    const initialMethod =
        membership.transaction?.payment_method ??
        paymentMethods[0]?.id ??
        "";
    const plan = membership.plan;
    const tier = normalizeTier(plan?.tier);
    const tierLabel =
        plan?.tier_label ?? TIER_LABELS[tier] ?? TIER_LABELS.hemat;
    const amount =
        membership.transaction?.amount ?? plan?.price ?? 0;
    const compareAt = Math.max(Number(plan?.compare_at_price ?? 0), amount);
    const receiptNumber =
        membership.transaction?.receipt_number ??
        `MEM-${membership.id.toString().padStart(6, "0")}`;
    const registration = membership.registration;
    const customerName =
        membership.customer_name ??
        registration?.full_name ??
        auth.user?.name ??
        "Member UBSC";
    const customerEmail =
        registration?.email ??
        membership.registration_email ??
        auth.user?.email ??
        "Email akun";
    const customerPhone =
        registration?.whatsapp ??
        registration?.phone ??
        membership.registration_phone ??
        auth.user?.phone_number ??
        "Nomor belum tersedia";
    const initialAttemptScope = paymentAttemptIntentScope([
        "membership",
        auth.user?.id ?? "anonymous",
        membership.id,
        membership.transaction?.id ?? "transaction-pending",
        initialMethod,
    ]);
    const attemptScope = useRef(initialAttemptScope);
    const { data, setData, post, processing, errors } = useForm<PaymentForm>({
        customer_name: customerName,
        whatsapp_number:
            customerPhone === "Nomor belum tersedia" ? "+62" : customerPhone,
        payment_method: initialMethod,
        idempotency_key: getOrCreatePaymentAttemptKey(initialAttemptScope),
    });

    useEffect(() => {
        if (
            !data.payment_method ||
            !paymentMethods.some(
                (method) => method.id === data.payment_method,
            )
        ) {
            setData("payment_method", paymentMethods[0]?.id ?? "");
        }
    }, [data.payment_method, paymentMethods, setData]);

    useEffect(() => {
        if (!data.payment_method) return;

        const nextScope = paymentAttemptIntentScope([
            "membership",
            auth.user?.id ?? "anonymous",
            membership.id,
            membership.transaction?.id ?? "transaction-pending",
            data.payment_method,
        ]);

        if (attemptScope.current === nextScope) return;

        attemptScope.current = nextScope;
        setData(
            "idempotency_key",
            getOrCreatePaymentAttemptKey(nextScope),
        );
    }, [
        auth.user?.id,
        data.payment_method,
        membership.id,
        membership.transaction?.id,
        setData,
    ]);

    const customerDataComplete =
        data.customer_name.trim().length >= 2 &&
        data.whatsapp_number.replace(/\D/g, "").length >= 10;
    const isExternalOnly = Boolean(gatewayUrl && !actionUrl);
    const canSubmit =
        state.key === "payable" &&
        state.serverPayable &&
        customerDataComplete &&
        Boolean(data.payment_method) &&
        !processing &&
        (Boolean(mockPayment && actionUrl) || isExternalOnly);
    const formLocked = state.key !== "payable";
    const registrationCategory =
        registration?.category ?? membership.registration_category;
    const registrationGender =
        registration?.gender ?? membership.registration_gender;
    const checkoutStage = [
        "paid",
        "expired",
        "cancelled",
        "failed",
    ].includes(state.key)
        ? 3
        : customerDataComplete
          ? 2
          : 1;
    const pollingTerminal = ["paid", "expired", "cancelled", "failed"].includes(
        state.key,
    );
    const pollFailureCount = useRef(0);

    useEffect(() => {
        if (!pollUrl || pollingTerminal) return;
        const activePollUrl = pollUrl;

        let disposed = false;
        let timer: number | null = null;
        let requestInFlight = false;

        const schedule = (delay: number) => {
            if (disposed) return;
            if (timer !== null) window.clearTimeout(timer);
            timer = window.setTimeout(poll, delay);
        };

        const applyPayload = (payload: unknown) => {
            if (!payload || typeof payload !== "object") return;

            const body = payload as {
                data?: Partial<CheckoutMembership>;
                membership?: Partial<CheckoutMembership>;
            };
            const next =
                body.data && typeof body.data === "object"
                    ? body.data
                    : body.membership && typeof body.membership === "object"
                      ? body.membership
                      : (payload as Partial<CheckoutMembership>);

            setMembership((current) => mergeMembership(current, next));

            const nextStatus = String(next.status ?? "").toLowerCase();
            const nextPaymentStatus = String(
                next.transaction?.payment_status ?? "",
            ).toUpperCase();

            if (nextStatus === "active" && nextPaymentStatus === "PAID") {
                disposed = true;
                window.location.assign(successUrl);
                return;
            }

            if (
                ["expired", "cancelled"].includes(nextStatus) ||
                ["FAILED", "EXPIRED"].includes(nextPaymentStatus)
            ) {
                disposed = true;
                router.reload({
                    only: [
                        "membership",
                        "paymentMethods",
                        "mockPayment",
                        "serverNow",
                        "paymentAction",
                        "pollUrl",
                        "successUrl",
                    ],
                });
            }
        };

        async function poll() {
            if (disposed || requestInFlight) return;
            if (document.visibilityState === "hidden") {
                schedule(8_000);
                return;
            }

            requestInFlight = true;
            try {
                const response = await axios.get(activePollUrl, {
                    headers: {
                        Accept: "application/json",
                        "Cache-Control": "no-cache",
                    },
                });

                if (disposed) return;
                pollFailureCount.current = 0;
                applyPayload(response.data);
                if (!disposed) schedule(8_000);
            } catch {
                pollFailureCount.current += 1;
                const delay = Math.min(
                    20_000,
                    8_000 + pollFailureCount.current * 3_000,
                );
                schedule(delay);
            } finally {
                requestInFlight = false;
            }
        }

        const handleVisibility = () => {
            if (document.visibilityState === "visible") {
                schedule(150);
            }
        };

        document.addEventListener("visibilitychange", handleVisibility);
        schedule(8_000);

        return () => {
            disposed = true;
            if (timer !== null) window.clearTimeout(timer);
            document.removeEventListener(
                "visibilitychange",
                handleVisibility,
            );
        };
    }, [pollUrl, pollingTerminal, successUrl]);

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canSubmit) return;

        if (isExternalOnly && gatewayUrl) {
            window.location.assign(gatewayUrl);
            return;
        }

        if (!actionUrl) return;

        post(actionUrl, {
            preserveScroll: true,
            headers: {
                "Idempotency-Key": data.idempotency_key,
            },
            onSuccess: () => clearPaymentAttemptKey(attemptScope.current),
        });
    };

    const supportRequest = (() => {
        if (state.key === "paid") {
            return "Mohon bantu memastikan membership dan bukti pembayaran saya sudah tercatat dengan benar.";
        }
        if (state.key === "expired") {
            return "Waktu pembayaran saya telah berakhir. Mohon bantu memilih paket kembali dengan aman.";
        }
        if (["cancelled", "failed"].includes(state.key)) {
            return "Transaksi saya tidak dapat dilanjutkan. Mohon bantu periksa status dan pilihan berikutnya.";
        }

        return "Mohon bantu saya menyelesaikan pembayaran membership ini.";
    })();
    const supportMessage = [
        "Halo tim membership UB Sport Center, saya membutuhkan bantuan terkait pendaftaran berikut.",
        `Nomor transaksi: ${receiptNumber}`,
        `Paket: ${plan?.name ?? "Membership Gym"} (${tierLabel})`,
        `Masa aktif: ${durationLabel(plan)}`,
        `Total pembayaran: ${rupiah(amount)}`,
        `Status saat ini: ${state.label}`,
        supportRequest,
        "Terima kasih.",
    ].join("\n");
    const supportHref = `https://wa.me/6285280809080?text=${encodeURIComponent(
        supportMessage,
    )}`;

    return (
        <>
            <Head>
                <title>Checkout Membership | UB Sport Center</title>
                <meta
                    name="description"
                    content="Konfirmasi paket dan selesaikan pembayaran membership UB Sport Center."
                />
            </Head>

            <main className="booking-checkout">
                <Navbar activeSection="Pricing" surface="media" />
                <CheckoutMasthead />

                <section
                    className="checkout-canvas"
                    data-section
                    aria-labelledby="membership-checkout-title"
                >
                    <header className="checkout-lead">
                        <Link
                            href={route("pricing")}
                            className="checkout-lead__back"
                        >
                            <ArrowLeft aria-hidden="true" />
                            Kembali ke pricing
                        </Link>

                        <div className="checkout-lead__rail">
                            <div className="checkout-lead__folio">
                                <span>Checkout / 05</span>
                                <strong>Membership gym</strong>
                            </div>
                            <h1 id="membership-checkout-title">
                                Aktifkan membership
                            </h1>
                            <dl className="checkout-lead__meta">
                                <div>
                                    <dt>Paket dipilih</dt>
                                    <dd>
                                        <strong>01</strong> membership
                                    </dd>
                                </div>
                                <div>
                                    <dt>Nomor transaksi</dt>
                                    <dd title={receiptNumber}>
                                        {receiptNumber}
                                    </dd>
                                </div>
                            </dl>
                        </div>
                    </header>

                    <nav
                        className="checkout-journey"
                        aria-label={`Progres checkout membership, tahap ${checkoutStage} dari 3`}
                    >
                        <ol className="checkout-journey__route">
                            {(
                                [
                                    [1, "Informasi", "Data member"],
                                    [2, "Pembayaran", "Pilih metode"],
                                    [3, "Selesai", "Status aktivasi"],
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
                        <div className="checkout-form-column">
                            <CheckoutBlock
                                index="01"
                                title="Informasi member"
                                description="Pastikan identitas penerima membership sudah tepat sebelum pembayaran."
                            >
                                <div className="checkout-field-grid">
                                    <label
                                        className="checkout-field"
                                        htmlFor="membership-customer-name"
                                    >
                                        <span className="checkout-field__label">
                                            Nama lengkap
                                        </span>
                                        <input
                                            id="membership-customer-name"
                                            className="checkout-input"
                                            name="customer_name"
                                            value={data.customer_name}
                                            onChange={(event) =>
                                                setData(
                                                    "customer_name",
                                                    event.target.value,
                                                )
                                            }
                                            autoComplete="name"
                                            placeholder="Nama sesuai identitas"
                                            disabled={formLocked}
                                            aria-invalid={
                                                errors.customer_name
                                                    ? "true"
                                                    : undefined
                                            }
                                            aria-describedby={
                                                errors.customer_name
                                                    ? "membership-customer-name-error"
                                                    : undefined
                                            }
                                            required
                                        />
                                        {errors.customer_name && (
                                            <span
                                                className="checkout-field__error"
                                                id="membership-customer-name-error"
                                            >
                                                {errors.customer_name}
                                            </span>
                                        )}
                                    </label>

                                    <label
                                        className="checkout-field"
                                        htmlFor="membership-whatsapp-number"
                                    >
                                        <span className="checkout-field__label">
                                            Nomor WhatsApp
                                        </span>
                                        <input
                                            id="membership-whatsapp-number"
                                            className="checkout-input"
                                            name="whatsapp_number"
                                            value={data.whatsapp_number}
                                            onChange={(event) =>
                                                setData(
                                                    "whatsapp_number",
                                                    event.target.value,
                                                )
                                            }
                                            autoComplete="tel"
                                            inputMode="tel"
                                            placeholder="+62 812 3456 7890"
                                            disabled={formLocked}
                                            aria-invalid={
                                                errors.whatsapp_number
                                                    ? "true"
                                                    : undefined
                                            }
                                            aria-describedby={
                                                errors.whatsapp_number
                                                    ? "membership-whatsapp-number-error"
                                                    : undefined
                                            }
                                            required
                                        />
                                        {errors.whatsapp_number && (
                                            <span
                                                className="checkout-field__error"
                                                id="membership-whatsapp-number-error"
                                            >
                                                {errors.whatsapp_number}
                                            </span>
                                        )}
                                    </label>

                                    <div className="checkout-field checkout-field--full">
                                        <span className="checkout-field__label">
                                            Identitas akun
                                        </span>
                                        <div className="checkout-identity">
                                            <div>
                                                <span>Email akun</span>
                                                <strong title={customerEmail}>
                                                    {customerEmail}
                                                </strong>
                                            </div>
                                            <div>
                                                <span>Kategori member</span>
                                                <strong>
                                                    {categoryLabel(
                                                        registrationCategory,
                                                    )}
                                                </strong>
                                            </div>
                                        </div>
                                        <div className="checkout-identity">
                                            <div>
                                                <span>Jenis kelamin</span>
                                                <strong>
                                                    {genderLabel(
                                                        registrationGender,
                                                    )}
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
                                            Data mengikuti pendaftaran dan akun
                                            yang sedang masuk.
                                        </span>
                                    </div>
                                </div>
                            </CheckoutBlock>

                            <CheckoutBlock
                                index="02"
                                title="Metode pembayaran"
                                description="Pilih satu metode untuk mengaktifkan membership."
                            >
                                <div
                                    className="checkout-payment-list"
                                    role="radiogroup"
                                    aria-label="Metode pembayaran membership"
                                    aria-describedby={
                                        errors.payment_method
                                            ? "membership-payment-method-error"
                                            : undefined
                                    }
                                >
                                    {paymentMethods.length > 0 ? (
                                        paymentMethods.map((method) => {
                                            const meta =
                                                PAYMENT_METHOD_META[
                                                    method.id
                                                ] ?? FALLBACK_PAYMENT_META;
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
                                                        onChange={() =>
                                                            setData(
                                                                "payment_method",
                                                                method.id,
                                                            )
                                                        }
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
                                            waktu pembayaran berakhir.
                                        </p>
                                    )}

                                    {errors.payment_method && (
                                        <span
                                            className="checkout-field__error"
                                            id="membership-payment-method-error"
                                        >
                                            {errors.payment_method}
                                        </span>
                                    )}
                                </div>
                            </CheckoutBlock>
                        </div>

                        <aside
                            className="checkout-summary-column"
                            aria-label="Ringkasan membership"
                        >
                            <div className="checkout-summary">
                                <header className="checkout-summary__head">
                                    <div>
                                        <p>Paket membership</p>
                                        <h2>
                                            Ringkasan <span>(01)</span>
                                        </h2>
                                    </div>
                                </header>

                                <ol className="checkout-order-list">
                                    <li className="checkout-order-item">
                                        <span className="checkout-order-item__index">
                                            01/
                                        </span>
                                        <figure className="checkout-order-item__media">
                                            <span aria-hidden="true">UB</span>
                                            {(
                                                plan?.card_image_url ??
                                                plan?.image_url
                                            ) && (
                                                <img
                                                    src={
                                                        plan?.card_image_url ??
                                                        plan?.image_url ??
                                                        undefined
                                                    }
                                                    alt=""
                                                    loading="eager"
                                                    decoding="async"
                                                    onError={(event) => {
                                                        event.currentTarget.hidden =
                                                            true;
                                                    }}
                                                />
                                            )}
                                        </figure>
                                        <div className="checkout-order-item__copy">
                                            <strong>
                                                {plan?.name ??
                                                    "Membership Gym"}
                                            </strong>
                                            <span>
                                                {tierLabel} ·{" "}
                                                {durationLabel(plan)}
                                            </span>
                                            <time
                                                aria-label={`Masa aktif ${compactDate(
                                                    membership.start_date,
                                                )} sampai ${compactDate(
                                                    membership.end_date,
                                                )}`}
                                            >
                                                <span>
                                                    {compactDate(
                                                        membership.start_date,
                                                    )}
                                                </span>
                                                <span>
                                                    {compactDate(
                                                        membership.end_date,
                                                    )}
                                                </span>
                                            </time>
                                        </div>
                                        <p
                                            className="checkout-order-item__price"
                                            title={rupiah(amount)}
                                        >
                                            {rupiah(amount)}
                                        </p>
                                    </li>
                                </ol>

                                <div className="checkout-price-summary">
                                    <SummaryRow
                                        label={
                                            compareAt > amount
                                                ? "Harga reguler"
                                                : "Harga paket"
                                        }
                                        value={rupiah(compareAt)}
                                    />
                                    {compareAt > amount && (
                                        <SummaryRow
                                            label="Hemat membership"
                                            value={`-${rupiah(
                                                compareAt - amount,
                                            )}`}
                                            tone="success"
                                        />
                                    )}
                                    <SummaryRow
                                        label="Durasi aktif"
                                        value={durationLabel(plan)}
                                    />
                                    <div className="checkout-price-total">
                                        <span>Total pembayaran</span>
                                        <strong>{rupiah(amount)}</strong>
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
                                        <time dateTime={expiresAt ?? undefined}>
                                            {expiry.label}
                                        </time>
                                    </span>
                                </div>

                                <div className="checkout-action">
                                    {state.key === "paid" ? (
                                        <Link
                                            href={successUrl}
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
                                            Paket, harga, dan masa aktif
                                            diperiksa kembali sebelum
                                            transaksi dikonfirmasi.
                                        </span>
                                    </p>

                                    {[
                                        "expired",
                                        "cancelled",
                                        "failed",
                                    ].includes(state.key) && (
                                        <Link
                                            href={route("pricing")}
                                            className="checkout-action__secondary"
                                        >
                                            Pilih paket baru
                                            <ArrowRight aria-hidden="true" />
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </aside>
                    </form>

                    <footer className="checkout-footnote">
                        <span>
                            UB Sport Center · Sistem membership terintegrasi
                        </span>
                        <span>
                            Perlu kepastian sebelum melanjutkan?{" "}
                            <a
                                href={supportHref}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Bicara langsung dengan tim membership
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
