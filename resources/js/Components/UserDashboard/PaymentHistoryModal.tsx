import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ChevronDown,
    CircleAlert,
    FileDown,
    ReceiptText,
    RefreshCw,
} from "lucide-react";
import axios from "axios";
import { cn } from "@/lib/utils";
import AccountModalShell, { AccountCtaArrow } from "./AccountModalShell";
import "./PaymentHistoryModal.css";

interface Props {
    onClose: () => void;
}

type PaymentStatus = "UNPAID" | "PAID" | "EXPIRED" | "FAILED";

interface BookingItem {
    id: number | null;
    kind: "facility" | "class";
    facility_name: string;
    image_url?: string | null;
    facility_unit_name: string | null;
    location: string | null;
    booking_date: string | null;
    start_time: string | null;
    end_time: string | null;
    subtotal: number;
    status: string;
    next_transition_at: string | null;
}

interface MembershipItem {
    id: number | null;
    plan_name: string;
    image_url?: string | null;
    status: string;
    start_date: string | null;
    end_date: string | null;
    days_remaining: number;
    next_transition_at: string | null;
}

interface TransactionItem {
    id: number;
    receipt_number: string;
    amount: number;
    payment_status: PaymentStatus;
    payment_method: string | null;
    checkout_url: string | null;
    invoice_url: string | null;
    paid_at: string | null;
    created_at: string;
    type: "booking" | "membership";
    service_kind: "facility" | "class" | "mixed" | "membership";
    service_status: string;
    title: string;
    items_count: number;
    items: BookingItem[];
    membership: MembershipItem | null;
    next_transition_at: string | null;
}

interface HistoryMeta {
    total: number;
    paid_count: number;
    paid_total: number;
    awaiting_payment: number;
    has_more: boolean;
    next_cursor: string | null;
    server_now: string;
}

const PAYMENT_STATUS: Record<
    PaymentStatus,
    { label: string; state: string }
> = {
    PAID: { label: "Lunas", state: "is-paid" },
    UNPAID: { label: "Menunggu", state: "is-waiting" },
    EXPIRED: { label: "Berakhir", state: "is-expired" },
    FAILED: { label: "Gagal", state: "is-failed" },
};

const SERVICE_STATUS: Record<string, { label: string; tone: string }> = {
    awaiting_payment: {
        label: "Menunggu pembayaran",
        tone: "is-waiting",
    },
    payment_expired: { label: "Tidak dibayar", tone: "is-expired" },
    payment_failed: { label: "Pembayaran gagal", tone: "is-failed" },
    scheduled: { label: "Terjadwal", tone: "is-blue" },
    ongoing: { label: "Sedang berlangsung", tone: "is-live" },
    active: { label: "Aktif", tone: "is-live" },
    completed: { label: "Selesai", tone: "is-muted" },
    expired: { label: "Masa aktif selesai", tone: "is-expired" },
    cancelled: { label: "Dibatalkan", tone: "is-failed" },
    archived: { label: "Selesai dicatat", tone: "is-muted" },
};

const MEMBERSHIP_FALLBACK =
    "/assets/images/poster-gym-konten-program-ub-sport-center.avif";
const FACILITY_FALLBACK =
    "/assets/images/ub-sport-center-kantor-pusat-malang.avif";

function formatRupiah(amount: number) {
    return `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;
}

function formatDate(value: string | null) {
    if (!value) return "-";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T12:00:00`)
        : new Date(value);

    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function kindLabel(kind: TransactionItem["service_kind"]) {
    if (kind === "class") return "Kelas";
    if (kind === "mixed") return "Reservasi gabungan";
    if (kind === "membership") return "Membership gym";
    return "Reservasi fasilitas";
}

function membershipPeriodCopy(transaction: TransactionItem) {
    if (!transaction.membership) return "Dokumen tersimpan";
    if (transaction.payment_status === "UNPAID")
        return "Aktif setelah pembayaran";
    if (transaction.payment_status === "FAILED")
        return "Pembayaran perlu diperiksa";
    if (transaction.payment_status === "EXPIRED")
        return "Masa pembayaran selesai";
    if (["expired", "cancelled"].includes(transaction.service_status))
        return "Masa aktif selesai";
    if (transaction.service_status === "archived") return "Dokumen tersimpan";

    return transaction.membership.days_remaining > 0
        ? `${transaction.membership.days_remaining} hari tersisa`
        : transaction.service_status === "active"
          ? "Berakhir hari ini"
          : "Periode terverifikasi";
}

function invoiceDownload(url: string) {
    return `${url}${url.includes("?") ? "&" : "?"}download=1`;
}

function fallbackImage(name: string, isMembership = false) {
    if (isMembership) return MEMBERSHIP_FALLBACK;

    const normalized = name.toLocaleLowerCase("id-ID");
    const matches: Array<[string[], string]> = [
        [
            ["tenis meja", "tennis meja"],
            "/assets/images/fasilitas-tennis-meja-ub-sport-center.avif",
        ],
        [
            ["bulu tangkis", "bulutangkis", "badminton"],
            "/assets/images/fasilitas-bulutangkis-ub-sport-center.avif",
        ],
        [
            ["sepak bola", "sepakbola"],
            "/assets/images/fasilitas-sepak-bola-ub-sport-center.avif",
        ],
        [
            ["futsal dieng"],
            "/assets/images/fasilitas-futsal-dieng-ub-sport-center.avif",
        ],
        [["futsal"], "/assets/images/fasilitas-futsal-ub-sport-center.avif"],
        [
            ["tenis", "tennis"],
            "/assets/images/fasilitas-tenis-ub-sport-center.avif",
        ],
        [["basket"], "/assets/images/fasilitas-basket-akurasi-ub-sport-center.avif"],
        [["voli", "volley"], "/assets/images/fasilitas-voli-ub-sport-center.avif"],
        [["yoga"], "/assets/images/fasilitas-yoga-ub-sport-center.avif"],
        [["zumba"], "/assets/images/fasilitas-zumba-ub-sport-center.avif"],
        [["aerobik", "aerobic"], "/assets/images/fasilitas-aerobik-ub-sport-center.avif"],
        [["beladiri", "bela diri"], "/assets/images/fasilitas-beladiri-ub-sport-center.avif"],
        [["gym", "fitness"], MEMBERSHIP_FALLBACK],
    ];

    return (
        matches.find(([keywords]) =>
            keywords.some((keyword) => normalized.includes(keyword)),
        )?.[1] ?? FACILITY_FALLBACK
    );
}

function ServiceImage({
    src,
    fallback,
    alt,
    eager = false,
}: {
    src?: string | null;
    fallback: string;
    alt: string;
    eager?: boolean;
}) {
    const [imageSrc, setImageSrc] = useState(src || fallback);

    useEffect(() => {
        setImageSrc(src || fallback);
    }, [fallback, src]);

    return (
        <img
            src={imageSrc}
            alt={alt}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            referrerPolicy="no-referrer"
            onError={(event) => {
                if (imageSrc !== fallback) {
                    setImageSrc(fallback);
                    return;
                }
                event.currentTarget.hidden = true;
            }}
        />
    );
}

function SkeletonTransaction() {
    return (
        <div className="acc-ledger-skeleton" aria-hidden="true">
            <span className="account-skeleton" />
            <div>
                <i className="account-skeleton" />
                <i className="account-skeleton" />
                <i className="account-skeleton" />
            </div>
            <i className="account-skeleton" />
        </div>
    );
}

export default function PaymentHistoryModal({ onClose }: Props) {
    const [transactions, setTransactions] = useState<TransactionItem[]>([]);
    const [meta, setMeta] = useState<HistoryMeta | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
    const requestSequence = useRef(0);
    const lastRevalidationAt = useRef(0);
    const hasLoaded = useRef(false);

    const loadHistory = useCallback(
        async (cursor: string | null = null, append = false) => {
            const sequence = ++requestSequence.current;

            if (append) {
                setLoadingMore(true);
                setLoadMoreError(null);
            } else if (!hasLoaded.current) {
                setLoading(true);
                setError(null);
            }

            try {
                const response = await axios.get<{
                    data: TransactionItem[];
                    meta: HistoryMeta;
                }>("/user/transactions", {
                    params: {
                        per_page: 12,
                        ...(cursor ? { cursor } : {}),
                    },
                });

                if (sequence !== requestSequence.current) return;

                setTransactions((current) =>
                    append
                        ? [
                              ...current,
                              ...response.data.data.filter(
                                  (item) =>
                                      !current.some((old) => old.id === item.id),
                              ),
                          ]
                        : response.data.data,
                );
                setMeta(response.data.meta);
                setError(null);
                hasLoaded.current = true;
            } catch {
                if (sequence !== requestSequence.current) return;

                if (append) {
                    setLoadMoreError(
                        "Transaksi berikutnya belum dapat dimuat. Coba lagi.",
                    );
                } else if (!hasLoaded.current) {
                    setError(
                        "Riwayat pembayaran belum dapat dimuat. Data Anda tetap aman.",
                    );
                }
            } finally {
                if (sequence === requestSequence.current) {
                    setLoading(false);
                    setLoadingMore(false);
                }
            }
        },
        [],
    );

    useEffect(() => void loadHistory(), [loadHistory, reloadKey]);

    useEffect(() => {
        const revalidate = () => {
            if (
                document.visibilityState !== "visible" ||
                Date.now() - lastRevalidationAt.current < 750
            ) {
                return;
            }

            lastRevalidationAt.current = Date.now();
            setReloadKey((value) => value + 1);
        };

        document.addEventListener("visibilitychange", revalidate);
        window.addEventListener("focus", revalidate);

        return () => {
            document.removeEventListener("visibilitychange", revalidate);
            window.removeEventListener("focus", revalidate);
        };
    }, []);

    useEffect(() => {
        const next = transactions
            .flatMap((transaction) => [
                transaction.next_transition_at,
                ...transaction.items.map((item) => item.next_transition_at),
                transaction.membership?.next_transition_at ?? null,
            ])
            .filter((value): value is string => Boolean(value))
            .map((value) => new Date(value).getTime())
            .filter((value) => Number.isFinite(value) && value > Date.now())
            .sort((a, b) => a - b)[0];

        if (!next) return;

        const timer = window.setTimeout(
            () => setReloadKey((value) => value + 1),
            Math.min(Math.max(1_000, next - Date.now() + 350), 2_147_000_000),
        );

        return () => window.clearTimeout(timer);
    }, [transactions]);

    const summary = useMemo(
        () => ({
            count: meta?.total ?? transactions.length,
            paidCount:
                meta?.paid_count ??
                transactions.filter((item) => item.payment_status === "PAID")
                    .length,
            totalPaid:
                meta?.paid_total ??
                transactions
                    .filter((item) => item.payment_status === "PAID")
                    .reduce((total, item) => total + item.amount, 0),
            awaiting:
                meta?.awaiting_payment ??
                transactions.filter((item) => item.payment_status === "UNPAID")
                    .length,
        }),
        [meta, transactions],
    );

    const toggleExpanded = (id: number) =>
        setExpanded((current) => {
            const next = new Set(current);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });

    return (
        <AccountModalShell
            bannerGradient="ledger"
            eyebrow="Riwayat Pembayaran"
            title="Transaksi dan Dokumen"
            subtitle="Pantau transaksi, layanan, status pembayaran, dan invoice dalam satu tampilan."
            wordmark="Riwayat"
            index="02"
            accent="#0f5f80"
            maxWidthClass="sm:max-w-[960px]"
            onClose={onClose}
        >
            <div
                className="acc-ledger"
                aria-busy={loading || loadingMore}
                aria-live="polite"
            >
                {!loading && !error && summary.count > 0 && (
                    <section
                        className="acc-ledger-summary"
                        aria-labelledby="payment-summary-title"
                    >
                        <div>
                            <p className="acc-ledger-summary__eyebrow">
                                Total pembayaran lunas
                            </p>
                            <h3 id="payment-summary-title">
                                {formatRupiah(summary.totalPaid)}
                            </h3>
                        </div>
                        <div className="acc-ledger-summary__facts">
                            <span>
                                <strong>{summary.count}</strong> transaksi
                            </span>
                            <span>
                                <strong>{summary.paidCount}</strong> lunas
                            </span>
                            <span>
                                <strong>{summary.awaiting}</strong> menunggu
                            </span>
                        </div>
                    </section>
                )}

                <header className="acc-ledger-heading">
                    <div>
                        <p className="acc-ledger-heading__eyebrow">
                            Riwayat pembayaran
                        </p>
                        <h3>Arsip Tiket</h3>
                    </div>
                    <span className="acc-ledger-heading__count">
                        {summary.count
                            ? `${String(summary.count).padStart(2, "0")} transaksi`
                            : "Belum ada transaksi"}
                    </span>
                </header>

                {loading && (
                    <div
                        className="acc-ledger-skeletons"
                        role="status"
                        aria-label="Memuat riwayat pembayaran"
                    >
                        <SkeletonTransaction />
                        <SkeletonTransaction />
                        <SkeletonTransaction />
                    </div>
                )}

                {!loading && error && (
                    <section className="acc-ledger-message is-error" role="alert">
                        <div>
                            <span
                                className="acc-ledger-message__icon"
                                aria-hidden="true"
                            >
                                <CircleAlert />
                            </span>
                            <h3>Riwayat Belum Dapat Dimuat</h3>
                            <p>{error}</p>
                            <button
                                type="button"
                                onClick={() =>
                                    setReloadKey((value) => value + 1)
                                }
                            >
                                <RefreshCw /> Coba Lagi
                            </button>
                        </div>
                    </section>
                )}

                {!loading && !error && transactions.length === 0 && (
                    <section className="acc-ledger-message">
                        <div>
                            <span
                                className="acc-ledger-message__icon"
                                aria-hidden="true"
                            >
                                <ReceiptText />
                            </span>
                            <h3>Belum Ada Transaksi</h3>
                            <p>
                                Reservasi, kelas, atau membership pertama Anda akan
                                tercatat otomatis di sini.
                            </p>
                        </div>
                    </section>
                )}

                {!loading && !error && transactions.length > 0 && (
                    <div className="acc-ledger-list">
                        {transactions.map((transaction, transactionIndex) => {
                            const payment =
                                PAYMENT_STATUS[transaction.payment_status];
                            const service =
                                SERVICE_STATUS[transaction.service_status] ??
                                SERVICE_STATUS.archived;
                            const isMembership =
                                transaction.service_kind === "membership";
                            const isExpanded = expanded.has(transaction.id);
                            const visibleItems = isExpanded
                                ? transaction.items
                                : transaction.items.slice(0, 1);
                            const detailsId = `payment-details-${transaction.id}`;
                            const hasDetailToggle =
                                !isMembership && transaction.items_count > 1;
                            const hasActions =
                                hasDetailToggle ||
                                Boolean(transaction.checkout_url) ||
                                Boolean(transaction.invoice_url);
                            const firstItem = transaction.items[0] ?? null;
                            const imageName = isMembership
                                ? (transaction.membership?.plan_name ??
                                  transaction.title)
                                : (firstItem?.facility_name ?? transaction.title);
                            const primaryImage = isMembership
                                ? transaction.membership?.image_url
                                : firstItem?.image_url;
                            const primaryFallback = fallbackImage(
                                imageName,
                                isMembership,
                            );

                            return (
                                <article
                                    key={transaction.id}
                                    className="acc-ledger-transaction"
                                    data-payment={transaction.payment_status.toLowerCase()}
                                    data-kind={transaction.service_kind}
                                >
                                    <figure className="acc-ledger-transaction__media">
                                        <ServiceImage
                                            src={primaryImage}
                                            fallback={primaryFallback}
                                            alt={`Visual ${imageName}`}
                                            eager={transactionIndex === 0}
                                        />
                                        <figcaption>
                                            <span>
                                                UBSC /{" "}
                                                {kindLabel(
                                                    transaction.service_kind,
                                                )}
                                            </span>
                                            <strong>
                                                {transaction.items_count > 1
                                                    ? `${imageName} +${transaction.items_count - 1}`
                                                    : imageName}
                                            </strong>
                                        </figcaption>
                                    </figure>

                                    <div className="acc-ledger-transaction__body">
                                        <header className="acc-ledger-transaction__identity">
                                            <p className="acc-ledger-transaction__kicker">
                                                {kindLabel(
                                                    transaction.service_kind,
                                                )}
                                            </p>
                                            <h3>{transaction.title}</h3>
                                            <p className="acc-ledger-transaction__receipt">
                                                {transaction.receipt_number}
                                            </p>
                                        </header>

                                        <div className="acc-ledger-transaction__meta">
                                            <span
                                                className={cn(
                                                    "acc-ledger-service-state",
                                                    service.tone,
                                                )}
                                            >
                                                {service.label}
                                            </span>
                                            <span>
                                                {transaction.paid_at
                                                    ? "Dibayar"
                                                    : "Dibuat"}{" "}
                                                {formatDate(
                                                    transaction.paid_at ??
                                                        transaction.created_at,
                                                )}
                                            </span>
                                            {transaction.payment_method && (
                                                <span>
                                                    {transaction.payment_method}
                                                </span>
                                            )}
                                            {transaction.payment_status ===
                                                "PAID" && <span>Terverifikasi</span>}
                                        </div>

                                        {isMembership &&
                                            transaction.membership && (
                                                <dl
                                                    className="acc-ledger-membership"
                                                    id={detailsId}
                                                >
                                                    <div className="acc-ledger-membership__cell">
                                                        <small>Mulai</small>
                                                        <strong>
                                                            {formatDate(
                                                                transaction
                                                                    .membership
                                                                    .start_date,
                                                            )}
                                                        </strong>
                                                    </div>
                                                    <div className="acc-ledger-membership__cell">
                                                        <small>Berakhir</small>
                                                        <strong>
                                                            {formatDate(
                                                                transaction
                                                                    .membership
                                                                    .end_date,
                                                            )}
                                                        </strong>
                                                    </div>
                                                    <div className="acc-ledger-membership__cell">
                                                        <small>Status periode</small>
                                                        <strong>
                                                            {membershipPeriodCopy(
                                                                transaction,
                                                            )}
                                                        </strong>
                                                    </div>
                                                </dl>
                                            )}

                                        {!isMembership &&
                                            visibleItems.length > 0 && (
                                                <div
                                                    className="acc-ledger-booking-details"
                                                    id={detailsId}
                                                >
                                                    {visibleItems.map(
                                                        (item, itemIndex) => {
                                                            const itemStatus =
                                                                SERVICE_STATUS[
                                                                    item.status
                                                                ] ??
                                                                SERVICE_STATUS.archived;
                                                            const itemFallback =
                                                                fallbackImage(
                                                                    item.facility_name,
                                                                );

                                                            return (
                                                                <div
                                                                    className="acc-ledger-booking"
                                                                    key={`${transaction.id}-${item.id ?? `${item.booking_date}-${item.start_time}`}`}
                                                                >
                                                                    <figure className="acc-ledger-booking__visual">
                                                                        <ServiceImage
                                                                            src={
                                                                                item.image_url
                                                                            }
                                                                            fallback={
                                                                                itemFallback
                                                                            }
                                                                            alt={`Visual ${item.facility_name}`}
                                                                        />
                                                                        <span className="acc-ledger-booking__index">
                                                                            {String(
                                                                                itemIndex +
                                                                                    1,
                                                                            ).padStart(
                                                                                2,
                                                                                "0",
                                                                            )}
                                                                        </span>
                                                                    </figure>
                                                                    <div className="acc-ledger-booking__name">
                                                                        <h4>
                                                                            {
                                                                                item.facility_name
                                                                            }
                                                                        </h4>
                                                                        <p>
                                                                            {item.kind ===
                                                                            "class"
                                                                                ? "Kelas"
                                                                                : "Fasilitas"}
                                                                            {item.facility_unit_name
                                                                                ? ` · ${item.facility_unit_name}`
                                                                                : ""}
                                                                            {item.location
                                                                                ? ` · ${item.location}`
                                                                                : ""}
                                                                        </p>
                                                                    </div>
                                                                    <div className="acc-ledger-booking__schedule">
                                                                        <span>
                                                                            {formatDate(
                                                                                item.booking_date,
                                                                            )}
                                                                        </span>
                                                                        <span>
                                                                            {item.start_time ??
                                                                                "-"}
                                                                            –
                                                                            {item.end_time ??
                                                                                "-"}
                                                                        </span>
                                                                    </div>
                                                                    <div className="acc-ledger-booking__price">
                                                                        <span>
                                                                            {
                                                                                itemStatus.label
                                                                            }
                                                                        </span>
                                                                        <strong>
                                                                            {formatRupiah(
                                                                                item.subtotal,
                                                                            )}
                                                                        </strong>
                                                                    </div>
                                                                </div>
                                                            );
                                                        },
                                                    )}
                                                </div>
                                            )}
                                    </div>

                                    <aside
                                        className="acc-ledger-transaction__stub"
                                        aria-label={`Nilai transaksi ${transaction.receipt_number}`}
                                    >
                                        <div>
                                            <p className="acc-ledger-stub__label">
                                                Status pembayaran
                                            </p>
                                            <span
                                                className={cn(
                                                    "acc-ledger-stub__status",
                                                    payment.state,
                                                )}
                                            >
                                                {payment.label}
                                            </span>
                                            <strong className="acc-ledger-stub__amount">
                                                {formatRupiah(transaction.amount)}
                                            </strong>
                                        </div>

                                        <p className="acc-ledger-stub__serial">
                                            Nomor bukti
                                            <b>{transaction.receipt_number}</b>
                                        </p>

                                        {hasActions ? (
                                            <footer className="acc-ledger-transaction__actions">
                                                {hasDetailToggle && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            toggleExpanded(
                                                                transaction.id,
                                                            )
                                                        }
                                                        className="acc-ledger-action"
                                                        aria-expanded={isExpanded}
                                                        aria-controls={detailsId}
                                                    >
                                                        {isExpanded
                                                            ? "Ringkas Jadwal"
                                                            : `Lihat ${transaction.items_count} Jadwal`}
                                                        <ChevronDown
                                                            className={cn(
                                                                isExpanded &&
                                                                    "is-open",
                                                            )}
                                                        />
                                                    </button>
                                                )}
                                                {transaction.checkout_url && (
                                                    <a
                                                        href={
                                                            transaction.checkout_url
                                                        }
                                                        className="acc-ledger-action is-primary"
                                                    >
                                                        Bayar Sekarang{" "}
                                                        <AccountCtaArrow />
                                                    </a>
                                                )}
                                                {transaction.invoice_url && (
                                                    <a
                                                        href={invoiceDownload(
                                                            transaction.invoice_url,
                                                        )}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="acc-ledger-action"
                                                        aria-label="Unduh invoice di tab baru"
                                                    >
                                                        <FileDown /> Unduh Invoice
                                                    </a>
                                                )}
                                            </footer>
                                        ) : (
                                            <p className="acc-ledger-archive-note">
                                                Tersimpan di arsip akun
                                            </p>
                                        )}
                                    </aside>
                                </article>
                            );
                        })}
                    </div>
                )}

                {meta?.has_more && meta.next_cursor && (
                    <div className="acc-ledger-more">
                        {loadMoreError && <p role="alert">{loadMoreError}</p>}
                        <button
                            type="button"
                            disabled={loadingMore}
                            onClick={() =>
                                void loadHistory(meta.next_cursor, true)
                            }
                        >
                            <RefreshCw
                                className={cn(loadingMore && "animate-spin")}
                            />
                            {loadingMore
                                ? "Memuat Transaksi..."
                                : loadMoreError
                                  ? "Coba Lagi"
                                  : "Muat Transaksi Berikutnya"}
                        </button>
                    </div>
                )}
            </div>
        </AccountModalShell>
    );
}
