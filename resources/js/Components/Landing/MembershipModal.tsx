import {
    authFormErrorRingClass,
    authFormInputClass,
    authFormLabelClass,
} from "@/Components/Landing/AuthModal";
import { useAuthFlow } from "@/Components/Landing/AuthFlowProvider";
import AuthVisualPanel from "@/Components/Landing/AuthVisualPanel";
import useModalFocusTrap from "@/Components/Landing/useModalFocusTrap";
import { cn } from "@/lib/utils";
import type {
    MembershipPlanItem,
    MembershipPlanTier,
    PageProps,
} from "@/types";
import {
    Listbox,
    ListboxButton,
    ListboxOption,
    ListboxOptions,
} from "@headlessui/react";
import { usePage } from "@inertiajs/react";
import axios from "axios";
import {
    ArrowUpRight,
    Check,
    ChevronDown,
    Crown,
    LoaderCircle,
    LockKeyhole,
    X,
} from "lucide-react";
import {
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type FormEventHandler,
    type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import "./MembershipModal.css";

interface MembershipModalProps {
    isOpen: boolean;
    onClose: () => void;
    plans?: MembershipPlanItem[];
    selectedPlanId?: number | null;
    onSelectedPlanChange?: (plan: MembershipPlanItem) => void;
    onRequestOpen?: () => void;
}

type RegistrationForm = {
    full_name: string;
    email: string;
    gender: "" | "L" | "P";
    whatsapp: string;
    category: "" | "warga_ub" | "umum";
    membership_plan_id: number | null;
};

type FormErrors = Partial<Record<keyof RegistrationForm | "form", string>>;
type PaymentMethod = "bca_va" | "qris" | "card";

interface MembershipRegistrationDraft {
    planId: number | null;
    fullName: string;
    whatsapp: string;
    gender: RegistrationForm["gender"];
    category: RegistrationForm["category"];
    userId: number | null;
}

export const MEMBERSHIP_DRAFT_STORAGE_KEY =
    "ubsc:membership-registration-draft";

function asNullablePositiveInteger(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;

    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function readMembershipRegistrationDraft(): MembershipRegistrationDraft | null {
    if (typeof window === "undefined") return null;
    try {
        const parsed = JSON.parse(
            window.sessionStorage.getItem(MEMBERSHIP_DRAFT_STORAGE_KEY) ?? "null",
        ) as Partial<MembershipRegistrationDraft> | null;

        if (!parsed || typeof parsed !== "object") return null;
        return {
            planId: asNullablePositiveInteger(parsed.planId),
            fullName: typeof parsed.fullName === "string" ? parsed.fullName : "",
            whatsapp: typeof parsed.whatsapp === "string" ? parsed.whatsapp : "",
            gender:
                parsed.gender === "L" || parsed.gender === "P"
                    ? parsed.gender
                    : "",
            category:
                parsed.category === "warga_ub" || parsed.category === "umum"
                    ? parsed.category
                    : "",
            userId: asNullablePositiveInteger(parsed.userId),
        };
    } catch {
        return null;
    }
}

interface RegistrationPayload {
    id: number;
    status?: string;
    plan?: {
        id: number;
        name: string;
        tier?: MembershipPlanTier | string;
        tier_label?: string;
        price?: number;
        duration_months?: number;
        duration_label?: string;
    };
    transaction?: {
        id?: number;
        receipt_number?: string;
        amount?: number;
        payment_status?: string;
        checkout_url?: string | null;
    };
    payment?: {
        payable?: boolean;
        action?: string | null;
        methods?: Array<PaymentMethod | { id: PaymentMethod; label?: string }>;
        mock_enabled?: boolean;
        checkout_url?: string | null;
        poll_url?: string | null;
        expires_at?: string | null;
        server_now?: string | null;
    };
    replayed?: boolean;
    checkout_url?: string | null;
}

function membershipCheckoutPath(
    payload: RegistrationPayload,
): string | null {
    const candidate =
        payload.transaction?.checkout_url ??
        payload.payment?.checkout_url ??
        payload.checkout_url;

    if (!candidate || typeof window === "undefined") return null;

    try {
        const target = new URL(candidate, window.location.origin);

        if (
            target.origin !== window.location.origin ||
            !/^\/checkout\/membership\/\d+\/?$/.test(target.pathname)
        ) {
            return null;
        }

        return `${target.pathname}${target.search}${target.hash}`;
    } catch {
        return null;
    }
}

const brandLogo = "/ubsc-blue.svg";

const tierLabels: Record<MembershipPlanTier, string> = {
    hemat: "Hemat",
    favorit: "Favorit",
    performa: "Performa",
    eksklusif: "Eksklusif",
};

const tierRank: Record<MembershipPlanTier, number> = {
    hemat: 0,
    favorit: 1,
    performa: 2,
    eksklusif: 3,
};

const methodLabels: Record<PaymentMethod, string> = {
    bca_va: "BCA virtual account",
    qris: "QRIS",
    card: "Kartu",
};

type GenderValue = Exclude<RegistrationForm["gender"], "">;
type CategoryValue = Exclude<RegistrationForm["category"], "">;

interface CompactSelectOption<Value extends string> {
    value: Value;
    label: string;
}

const genderOptions: readonly CompactSelectOption<GenderValue>[] = [
    { value: "L", label: "Laki-laki" },
    { value: "P", label: "Perempuan" },
];

const generalCategoryOptions: readonly CompactSelectOption<CategoryValue>[] = [
    { value: "umum", label: "Umum" },
];

const verifiedCategoryOptions: readonly CompactSelectOption<CategoryValue>[] = [
    { value: "warga_ub", label: "Warga UB terverifikasi" },
    ...generalCategoryOptions,
];

const labelCls = authFormLabelClass;
const inputCls = cn(authFormInputClass, "membership-registration-input");

const motionDelay = (ms: number) =>
    ({ "--auth-delay": `${ms}ms` }) as CSSProperties;

function normalizeTier(plan?: MembershipPlanItem | RegistrationPayload["plan"] | null) {
    const tier = String(plan?.tier ?? "favorit").toLocaleLowerCase("id-ID");

    return tier === "hemat" ||
        tier === "favorit" ||
        tier === "performa" ||
        tier === "eksklusif"
        ? tier
        : "favorit";
}

function formatPrice(value?: number | null) {
    return new Intl.NumberFormat("id-ID").format(Number(value ?? 0));
}

function planDurationLabel(plan: MembershipPlanItem) {
    if (plan.duration_label) return plan.duration_label;
    if (plan.duration_months === 12) return "1 tahun";
    if (plan.duration_months === 1) return "1 bulan";
    return `${plan.duration_months} bulan`;
}

function durationLabelFromMonths(months?: number | null) {
    if (months === 12) return "1 tahun";
    if (months === 1) return "1 bulan";
    return months && months > 0 ? `${months} bulan` : null;
}

function formatRemainingTime(totalSeconds: number) {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;

    return [hours, minutes, seconds]
        .map((value) => String(value).padStart(2, "0"))
        .join(":");
}

function newIdempotencyKey() {
    const cryptoApi = globalThis.crypto;

    if (typeof cryptoApi?.randomUUID === "function") {
        return cryptoApi.randomUUID();
    }

    if (typeof cryptoApi?.getRandomValues === "function") {
        const bytes = new Uint8Array(16);
        cryptoApi.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const value = Array.from(bytes, (byte) =>
            byte.toString(16).padStart(2, "0"),
        ).join("");

        return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
    }

    const bytes = Array.from({ length: 16 }, () =>
        Math.floor(Math.random() * 256),
    );
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const value = bytes
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");

    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function unwrapRegistration(response: unknown): RegistrationPayload | null {
    if (!response || typeof response !== "object") return null;
    const outer = response as { data?: unknown };
    const candidate = outer.data ?? response;

    if (!candidate || typeof candidate !== "object") return null;
    const payload = candidate as RegistrationPayload;
    return Number.isFinite(Number(payload.id)) ? payload : null;
}

function registrationStage(
    payload: RegistrationPayload,
): "payment" | "complete" | "expired" {
    const paymentStatus = String(
        payload.transaction?.payment_status ?? "",
    ).toUpperCase();
    const membershipStatus = String(payload.status ?? "").toLowerCase();

    if (paymentStatus === "PAID" || membershipStatus === "active") {
        return "complete";
    }
    if (
        paymentStatus === "EXPIRED" ||
        paymentStatus === "FAILED" ||
        membershipStatus === "cancelled" ||
        membershipStatus === "expired" ||
        payload.payment?.payable === false
    ) {
        return "expired";
    }
    return "payment";
}

function firstValidationErrors(error: unknown): FormErrors {
    if (!axios.isAxiosError(error)) return {};
    const response = error.response?.data as
        | { message?: string; errors?: Record<string, string[] | string> }
        | undefined;
    const output: FormErrors = {};

    Object.entries(response?.errors ?? {}).forEach(([key, value]) => {
        const normalizedKey = key as keyof RegistrationForm;
        output[normalizedKey] = Array.isArray(value) ? value[0] : value;
    });

    if (Object.keys(output).length === 0 && response?.message) {
        output.form = response.message;
    }

    return output;
}

function FieldError({ message }: { message?: string }) {
    if (!message) return null;
    return (
        <p className="mt-1 font-bdo text-[10px] font-medium leading-tight text-[#e00000]">
            {message}
        </p>
    );
}

function SelectChevron({ open = false }: { open?: boolean }) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                "membership-select-chevron",
                open && "is-open",
            )}
        >
            <ChevronDown className="h-[14px] w-[14px]" />
        </span>
    );
}

function CompactSelect<Value extends string>({
    value,
    options,
    placeholder,
    ariaLabel,
    error,
    onChange,
}: {
    value: Value | "";
    options: readonly CompactSelectOption<Value>[];
    placeholder: string;
    ariaLabel: string;
    error?: string;
    onChange: (value: Value) => void;
}) {
    const selected =
        options.find((option) => option.value === value) ?? null;
    const selectValue = (nextValue: Value | "") => {
        if (nextValue !== "") onChange(nextValue);
    };

    return (
        <Listbox value={value} onChange={selectValue}>
            {({ open }) => (
                <div
                    data-membership-dropdown-open={open ? "true" : undefined}
                    className={cn(
                        "membership-compact-select relative",
                        open && "z-[90]",
                    )}
                >
                    <ListboxButton
                        aria-label={ariaLabel}
                        aria-required="true"
                        aria-invalid={Boolean(error)}
                        className={cn(
                            inputCls,
                            "membership-select-trigger",
                            !selected && "is-placeholder",
                            error && authFormErrorRingClass,
                        )}
                    >
                        <span className="min-w-0 flex-1 truncate">
                            {selected?.label ?? placeholder}
                        </span>
                        <SelectChevron open={open} />
                    </ListboxButton>

                    <ListboxOptions
                        modal={false}
                        transition
                        className="membership-compact-options absolute bottom-[calc(100%+6px)] left-0 z-30 w-full sm:bottom-auto sm:top-[calc(100%+6px)]"
                    >
                        {options.map((option, index) => (
                            <ListboxOption
                                key={option.value}
                                value={option.value}
                                className="membership-compact-option"
                            >
                                <span
                                    className="membership-compact-option__index"
                                    aria-hidden="true"
                                >
                                    {String(index + 1).padStart(2, "0")}
                                </span>
                                <span className="min-w-0 flex-1 truncate">
                                    {option.label}
                                </span>
                                <Check
                                    aria-hidden="true"
                                    className="membership-compact-option__check"
                                />
                            </ListboxOption>
                        ))}
                    </ListboxOptions>
                </div>
            )}
        </Listbox>
    );
}

function PlanSelector({
    plans,
    value,
    error,
    onChange,
    onOpenChange,
}: {
    plans: MembershipPlanItem[];
    value: number | null;
    error?: string;
    onChange: (plan: MembershipPlanItem) => void;
    onOpenChange?: (open: boolean) => void;
}) {
    const [open, setOpen] = useState(false);
    const shellRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const listboxRef = useRef<HTMLDivElement>(null);
    const selected = plans.find((plan) => plan.id === value) ?? null;
    const selectedTier = normalizeTier(selected);
    const selectedPlanIndex = plans.findIndex(
        (plan) => plan.id === selected?.id,
    );
    const selectedIndex = Math.max(0, selectedPlanIndex);
    const [activeIndex, setActiveIndex] = useState(selectedIndex);
    const listboxId = useId();

    useEffect(() => {
        if (!open) setActiveIndex(selectedIndex);
    }, [open, selectedIndex]);

    useEffect(() => {
        if (!open) return;

        const frame = window.requestAnimationFrame(() => {
            const menu = listboxRef.current;
            const option = document.getElementById(
                `${listboxId}-option-${activeIndex}`,
            );

            if (!menu || !option || !menu.contains(option)) return;

            const optionTop = option.offsetTop;
            const optionBottom = optionTop + option.offsetHeight;

            if (optionTop < menu.scrollTop) {
                menu.scrollTop = optionTop;
            } else if (optionBottom > menu.scrollTop + menu.clientHeight) {
                menu.scrollTop = optionBottom - menu.clientHeight;
            }
        });

        return () => window.cancelAnimationFrame(frame);
    }, [activeIndex, listboxId, open]);

    useEffect(() => {
        onOpenChange?.(open);
    }, [onOpenChange, open]);

    const choosePlan = (index: number) => {
        const plan = plans[index];
        if (!plan) return;
        onChange(plan);
        setActiveIndex(index);
        setOpen(false);
        window.requestAnimationFrame(() =>
            triggerRef.current?.focus({ preventScroll: true }),
        );
    };

    const handleKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (plans.length === 0) return;
        if (event.key === "Tab") {
            setOpen(false);
            return;
        }
        if (event.key === "Escape") {
            if (open) event.preventDefault();
            setOpen(false);
            return;
        }
        if (
            event.key === "Home" ||
            event.key === "End" ||
            event.key === "PageUp" ||
            event.key === "PageDown"
        ) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex(
                event.key === "Home" || event.key === "PageUp"
                    ? 0
                    : plans.length - 1,
            );
            return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => {
                const direction = event.key === "ArrowDown" ? 1 : -1;
                return (current + direction + plans.length) % plans.length;
            });
            return;
        }
        if ((event.key === "Enter" || event.key === " ") && open) {
            event.preventDefault();
            choosePlan(activeIndex);
        }
    };

    useEffect(() => {
        if (!open) return;

        const close = (event: PointerEvent) => {
            if (!shellRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const closeWithEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };

        document.addEventListener("pointerdown", close);
        document.addEventListener("keydown", closeWithEscape);
        return () => {
            document.removeEventListener("pointerdown", close);
            document.removeEventListener("keydown", closeWithEscape);
        };
    }, [open]);

    return (
        <div
            ref={shellRef}
            data-membership-dropdown-open={open ? "true" : undefined}
            className={cn("relative", open && "z-[90]")}
        >
            <button
                ref={triggerRef}
                type="button"
                role="combobox"
                aria-label="Paket membership"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listboxId}
                aria-activedescendant={
                    open ? `${listboxId}-option-${activeIndex}` : undefined
                }
                disabled={plans.length === 0}
                onClick={() => {
                    setActiveIndex(selectedIndex);
                    setOpen((current) => !current);
                }}
                onKeyDown={handleKeyboard}
                aria-required="true"
                aria-invalid={Boolean(error)}
                className={cn(
                    inputCls,
                    "membership-plan-select membership-select-trigger flex items-center gap-2 text-left",
                    !selected && "is-placeholder",
                    error && authFormErrorRingClass,
                )}
                data-tier={selectedTier}
            >
                <span className="membership-plan-select__index" aria-hidden="true">
                    {selected
                        ? `${String(selectedIndex + 1).padStart(2, "0")}/`
                        : "--/"}
                </span>
                <span className="min-w-0 flex-1 truncate">
                    {selected ? selected.name : "Pilih paket membership"}
                </span>
                {selected && (
                    <span className="membership-plan-select__price hidden shrink-0 sm:inline">
                        Rp {formatPrice(selected.price)}
                    </span>
                )}
                <SelectChevron open={open} />
            </button>

            {open && (
                <div
                    ref={listboxRef}
                    id={listboxId}
                    role="listbox"
                    aria-label="Pilih paket membership"
                    data-scrollable={plans.length > 4 ? "true" : undefined}
                    className="membership-plan-options absolute bottom-[calc(100%+6px)] left-0 z-30 w-full sm:bottom-auto sm:top-[calc(100%+6px)]"
                >
                    {plans.map((plan, index) => {
                        const tier = normalizeTier(plan);
                        const active = plan.id === selected?.id;

                        return (
                            <button
                                key={plan.id}
                                id={`${listboxId}-option-${index}`}
                                type="button"
                                role="option"
                                tabIndex={-1}
                                aria-selected={active}
                                data-tier={tier}
                                className={cn(
                                    "membership-plan-option group grid w-full grid-cols-[1.65rem_minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2 text-left transition-colors",
                                    active && "is-selected",
                                    activeIndex === index && !active && "is-focused",
                                )}
                                onPointerEnter={() => setActiveIndex(index)}
                                onClick={() => choosePlan(index)}
                            >
                                <span className="membership-plan-option__index font-bdo text-[9px] font-medium" aria-hidden="true">
                                    {String(index + 1).padStart(2, "0")}/
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="membership-plan-option__name block truncate font-bdo text-[11px] font-medium">
                                        {plan.name}
                                    </span>
                                    <span className="membership-plan-option__meta mt-px block font-bdo text-[9px]">
                                        {tierLabels[tier]} · {planDurationLabel(plan)}
                                    </span>
                                </span>
                                <span className="membership-plan-option__value flex items-center gap-1.5 font-bdo text-[9px] font-medium">
                                    Rp {formatPrice(plan.price)}
                                    {active && <Check className="h-3 w-3 shrink-0" />}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function PaymentStage({
    registration,
    onComplete,
    onExpired,
}: {
    registration: RegistrationPayload;
    onComplete: () => void;
    onExpired: (registration: RegistrationPayload) => void;
}) {
    const rawMethods = registration.payment?.methods ?? ["bca_va", "qris"];
    const methods = rawMethods
        .map((method) =>
            typeof method === "string"
                ? { id: method, label: methodLabels[method] }
                : {
                      id: method.id,
                      label: method.label || methodLabels[method.id],
                  },
        )
        .filter(
            (method): method is { id: PaymentMethod; label: string } =>
                method.id in methodLabels,
        );
    const [method, setMethod] = useState<PaymentMethod>(
        methods[0]?.id ?? "bca_va",
    );
    const [processing, setProcessing] = useState(false);
    const processingRef = useRef(false);
    const [error, setError] = useState<string | null>(null);
    const action = registration.payment?.action;
    const checkoutUrl =
        registration.payment?.checkout_url ??
        registration.transaction?.checkout_url ??
        registration.checkout_url;
    const registrationDuration =
        registration.plan?.duration_label ??
        durationLabelFromMonths(registration.plan?.duration_months);
    const pollUrl = registration.payment?.poll_url;
    const expiresAt = registration.payment?.expires_at;
    const serverNow = registration.payment?.server_now;
    const serverClockOffset = useMemo(() => {
        const serverTimestamp = Date.parse(serverNow ?? "");

        return Number.isFinite(serverTimestamp)
            ? serverTimestamp - Date.now()
            : 0;
    }, [serverNow]);
    const calculateRemaining = useCallback(() => {
        const expiryTimestamp = Date.parse(expiresAt ?? "");
        if (!Number.isFinite(expiryTimestamp)) return null;

        return Math.max(
            0,
            Math.ceil(
                (expiryTimestamp - (Date.now() + serverClockOffset)) / 1000,
            ),
        );
    }, [expiresAt, serverClockOffset]);
    const [remainingSeconds, setRemainingSeconds] = useState<number | null>(
        calculateRemaining,
    );
    const externalCheckoutUrl = (() => {
        if (!checkoutUrl) return null;
        try {
            const target = new URL(checkoutUrl, window.location.origin);
            const isContinuation =
                target.origin === window.location.origin &&
                target.pathname === window.location.pathname &&
                target.searchParams.get("membership_registration") ===
                    String(registration.id);

            return isContinuation ? null : target.toString();
        } catch {
            return null;
        }
    })();

    const pay = async () => {
        if (processingRef.current) return;
        if (!action) {
            if (externalCheckoutUrl) window.location.assign(externalCheckoutUrl);
            return;
        }

        processingRef.current = true;
        setProcessing(true);
        setError(null);
        try {
            const response = await axios.post(action, {
                payment_method: method,
            });
            const payload = unwrapRegistration(response.data);
            const redirect =
                payload?.payment?.checkout_url ??
                payload?.transaction?.checkout_url ??
                payload?.checkout_url;

            if (redirect && !registration.payment?.mock_enabled) {
                window.location.assign(redirect);
                return;
            }

            if (payload && registrationStage(payload) === "complete") {
                onComplete();
                return;
            }

            if (payload && registrationStage(payload) === "expired") {
                onExpired(payload);
                return;
            }

            setError(
                "Pembayaran belum dikonfirmasi. Silakan periksa kembali metode pembayaran atau coba beberapa saat lagi.",
            );
        } catch (requestError) {
            const response = axios.isAxiosError(requestError)
                ? (requestError.response?.data as { message?: string } | undefined)
                : undefined;
            const responseRegistration = unwrapRegistration(response);
            if (
                responseRegistration &&
                registrationStage(responseRegistration) === "expired"
            ) {
                onExpired(responseRegistration);
                return;
            }
            setError(
                response?.message ??
                    "Pembayaran belum dapat diproses. Data pendaftaran tetap aman; silakan coba kembali.",
            );
        } finally {
            processingRef.current = false;
            setProcessing(false);
        }
    };

    useEffect(() => {
        setRemainingSeconds(calculateRemaining());

        if (!expiresAt) return;
        const timer = window.setInterval(() => {
            setRemainingSeconds(calculateRemaining());
        }, 1000);

        return () => window.clearInterval(timer);
    }, [calculateRemaining, expiresAt]);

    useEffect(() => {
        if (!pollUrl) return;

        let cancelled = false;
        let timer = 0;
        let failureCount = 0;

        const poll = async () => {
            if (cancelled) return;
            if (document.visibilityState === "hidden") {
                schedule();
                return;
            }

            try {
                const response = await axios.get(pollUrl);
                const payload = unwrapRegistration(response.data);
                failureCount = 0;

                if (!payload) {
                    failureCount += 1;
                    schedule();
                    return;
                }

                const nextStage = registrationStage(payload);
                if (nextStage === "complete") {
                    onComplete();
                    return;
                }
                if (nextStage === "expired") {
                    onExpired(payload);
                    return;
                }
            } catch {
                failureCount += 1;
            }

            schedule();
        };

        const schedule = () => {
            if (cancelled) return;
            const delay = Math.min(20_000, 8_000 + failureCount * 4_000);
            timer = window.setTimeout(() => void poll(), delay);
        };

        const handleVisibility = () => {
            if (document.visibilityState !== "visible" || cancelled) return;
            window.clearTimeout(timer);
            void poll();
        };

        document.addEventListener("visibilitychange", handleVisibility);
        schedule();

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [onComplete, onExpired, pollUrl]);

    return (
        <div className="membership-payment-stage auth-modal-form-flow">
            <div className="membership-payment-stage__eyebrow">
                <span /> Pendaftaran tercatat
            </div>
            <h1 className="membership-modal-heading section-two-headline-weight mt-4">
                Selesaikan aktivasi membership Anda
            </h1>
            <p className="mt-2 font-bdo text-[12px] leading-[1.35] text-black/52">
                Paket telah masuk ke sistem admin. Pilih metode pembayaran untuk
                mengaktifkan periodenya.
            </p>

            <div className="membership-payment-summary mt-6" data-tier={normalizeTier(registration.plan)}>
                <span className="membership-payment-summary__signal" />
                <div className="min-w-0 flex-1">
                    <p className="truncate font-bdo text-[13px] font-medium text-black">
                        {registration.plan?.name ?? "Membership UBSC"}
                    </p>
                    <p className="mt-1 font-bdo text-[10px] text-black/45">
                        {registration.plan?.tier_label ?? tierLabels[normalizeTier(registration.plan)]}
                        {registrationDuration ? ` · ${registrationDuration}` : ""}
                    </p>
                </div>
                <p className="font-bdo text-[14px] font-semibold text-black">
                    Rp {formatPrice(registration.transaction?.amount ?? registration.plan?.price)}
                </p>
            </div>

            {remainingSeconds !== null && (
                <div
                    className="mt-4 flex items-center justify-between border-y border-black/10 py-2.5 font-bdo"
                    aria-live="polite"
                >
                    <span className="text-[10px] font-medium text-black/48">
                        Batas aktivasi
                    </span>
                    <span className="font-mono text-[12px] font-semibold tabular-nums tracking-[-0.02em] text-black">
                        {formatRemainingTime(remainingSeconds)}
                    </span>
                </div>
            )}

            {registration.payment?.mock_enabled && methods.length > 0 ? (
                <div className="mt-5">
                    <p className={labelCls}>Metode pembayaran</p>
                    <div className="grid grid-cols-3 gap-1.5">
                        {methods.map((item) => (
                            <button
                                key={item.id}
                                data-modal-autofocus={
                                    item.id === methods[0]?.id
                                        ? true
                                        : undefined
                                }
                                type="button"
                                onClick={() => setMethod(item.id)}
                                className={cn(
                                    "membership-payment-method h-10 rounded-[5px] border px-2 font-bdo text-[10px] font-medium transition-colors",
                                    method === item.id
                                        ? "border-black bg-black text-white"
                                        : "border-black/10 bg-[#f5f5f4] text-black/64 hover:border-black/25",
                                )}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            {error && (
                <p role="alert" className="mt-3 font-bdo text-[11px] leading-snug text-[#d80000]">
                    {error}
                </p>
            )}

            {action || externalCheckoutUrl ? (
                <button
                    type="button"
                    disabled={processing}
                    onClick={pay}
                    className="membership-registration-submit mt-6"
                >
                    {processing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
                    {processing ? "Memproses pembayaran" : "Lanjutkan pembayaran"}
                </button>
            ) : (
                <p className="mt-5 border-t border-black/10 pt-4 font-bdo text-[11px] leading-[1.45] text-black/52">
                    Pendaftaran tersimpan dengan aman. Instruksi pembayaran akan
                    tersedia setelah kanal pembayaran diaktifkan.
                </p>
            )}
        </div>
    );
}

function CompletedStage({ onClose }: { onClose: () => void }) {
    return (
        <div className="auth-modal-form-flow text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#daf5dc] text-[#16833a]">
                <Check className="h-5 w-5" strokeWidth={2.2} />
            </span>
            <h1 className="membership-modal-heading section-two-headline-weight mx-auto mt-5 max-w-[360px]">
                Membership Anda berhasil diaktifkan
            </h1>
            <p className="mx-auto mt-3 max-w-[350px] font-bdo text-[12px] leading-[1.45] text-black/50">
                Status, masa berlaku, dan transaksi kini dapat dilihat dari menu
                membership pada profil Anda.
            </p>
            <button data-modal-autofocus type="button" onClick={onClose} className="membership-registration-submit mt-7">
                Selesai
            </button>
        </div>
    );
}

function ExpiredStage({ onRestart }: { onRestart: () => void }) {
    return (
        <div className="auth-modal-form-flow text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#fff0dd] text-[#d96c00]">
                <LockKeyhole className="h-5 w-5" strokeWidth={2} />
            </span>
            <h1 className="membership-modal-heading section-two-headline-weight mx-auto mt-5 max-w-[360px]">
                Sesi pembayaran ini sudah berakhir
            </h1>
            <p className="mx-auto mt-3 max-w-[350px] font-bdo text-[12px] leading-[1.45] text-black/50">
                Tidak ada tagihan yang diproses. Buat pendaftaran baru untuk
                mendapatkan periode pembayaran yang aktif.
            </p>
            <button
                data-modal-autofocus
                type="button"
                onClick={onRestart}
                className="membership-registration-submit mt-7"
            >
                Pilih paket kembali
            </button>
        </div>
    );
}

export default function MembershipModal({
    isOpen,
    onClose,
    plans = [],
    selectedPlanId = null,
    onSelectedPlanChange,
    onRequestOpen,
}: MembershipModalProps) {
    const { auth } = usePage<PageProps>().props;
    const user = auth.user;
    const { openAuth, isOpen: authFlowOpen } = useAuthFlow();
    const orderedPlans = useMemo(
        () =>
            [...plans]
                .filter((plan) => plan.is_active !== false)
                .sort(
                    (a, b) =>
                        tierRank[normalizeTier(a)] - tierRank[normalizeTier(b)] ||
                        a.sort_order - b.sort_order ||
                        a.id - b.id,
                ),
        [plans],
    );
    const preferredPlan = useMemo(
        () =>
            orderedPlans.find((plan) => plan.id === selectedPlanId) ??
            orderedPlans.find((plan) => plan.is_primary) ??
            orderedPlans[0] ??
            null,
        [orderedPlans, selectedPlanId],
    );
    const [mounted, setMounted] = useState(false);
    const [openCount, setOpenCount] = useState(0);
    const [animationSettled, setAnimationSettled] = useState(false);
    const [planSelectorOpen, setPlanSelectorOpen] = useState(false);
    const dialogRef = useRef<HTMLDivElement>(null);
    useModalFocusTrap(dialogRef, isOpen && !authFlowOpen, isOpen);
    const [stage, setStage] = useState<
        "form" | "loading" | "payment" | "complete" | "expired"
    >("form");
    const [registration, setRegistration] = useState<RegistrationPayload | null>(null);
    const [processing, setProcessing] = useState(false);
    const processingRef = useRef(false);
    const [errors, setErrors] = useState<FormErrors>({});
    const idempotencyKey = useRef(newIdempotencyKey());
    const [form, setForm] = useState<RegistrationForm>({
        full_name: "",
        email: "",
        gender: "",
        whatsapp: "",
        category: "",
        membership_plan_id: null,
    });

    const clearContinuationUrl = useCallback(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("membership_registration");
        url.searchParams.delete("plan");
        window.history.replaceState(
            window.history.state,
            "",
            `${url.pathname}${url.search}${url.hash}`,
        );
    }, []);

    const persistDraft = useCallback(() => {
        const draft: MembershipRegistrationDraft = {
            planId: form.membership_plan_id,
            fullName: form.full_name,
            whatsapp: form.whatsapp,
            gender: form.gender,
            category: form.category,
            userId: user?.id ?? null,
        };
        window.sessionStorage.setItem(
            MEMBERSHIP_DRAFT_STORAGE_KEY,
            JSON.stringify(draft),
        );
    }, [form, user?.id]);

    const requestAuthentication = useCallback(() => {
        persistDraft();
        const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        openAuth({
            view: "login",
            returnTo,
            stacked: true,
        });
    }, [openAuth, persistDraft]);

    const closeModal = useCallback(() => {
        window.sessionStorage.removeItem(MEMBERSHIP_DRAFT_STORAGE_KEY);
        clearContinuationUrl();
        onClose();
    }, [clearContinuationUrl, onClose]);

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (isOpen) {
            setOpenCount((current) => current + 1);
            setAnimationSettled(false);
            setErrors({});
        } else {
            setAnimationSettled(false);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!user) return;
        const draft = readMembershipRegistrationDraft();
        const ownsDraft =
            draft !== null &&
            (draft.userId === null || draft.userId === user.id);
        const verifiedCampusUser =
            user.identity_category === "warga_kampus" &&
            user.identity_status === "verified";
        const draftPlan = ownsDraft
            ? orderedPlans.find((plan) => plan.id === draft.planId)
            : null;

        if (draft && !ownsDraft) {
            window.sessionStorage.removeItem(MEMBERSHIP_DRAFT_STORAGE_KEY);
        }

        setForm({
            full_name: ownsDraft && draft.fullName ? draft.fullName : user.name || "",
            email: user.email || "",
            gender: ownsDraft ? draft.gender : "",
            whatsapp:
                ownsDraft && draft.whatsapp
                    ? draft.whatsapp
                    : user.phone_number || "",
            category:
                ownsDraft &&
                (draft.category === "umum" ||
                    (draft.category === "warga_ub" && verifiedCampusUser))
                    ? draft.category
                    : verifiedCampusUser
                      ? "warga_ub"
                      : "umum",
            membership_plan_id:
                draftPlan?.id ?? preferredPlan?.id ?? null,
        });

        if (draftPlan) onSelectedPlanChange?.(draftPlan);
        if (ownsDraft) onRequestOpen?.();
    }, [user?.id]);

    useEffect(() => {
        if (!preferredPlan) return;
        setForm((current) => ({
            ...current,
            membership_plan_id: preferredPlan.id,
        }));
    }, [preferredPlan]);

    useEffect(() => {
        if (!isOpen || !user) return;
        const registrationId = new URLSearchParams(window.location.search).get(
            "membership_registration",
        );

        if (!registrationId || !/^\d+$/.test(registrationId)) {
            setStage("form");
            setRegistration(null);
            return;
        }

        let cancelled = false;
        setStage("loading");
        axios
            .get(`/membership/registrations/${registrationId}`)
            .then((response) => {
                if (cancelled) return;
                const payload = unwrapRegistration(response.data);
                if (!payload) throw new Error("Invalid membership response");

                const checkoutPath = membershipCheckoutPath(payload);
                if (checkoutPath) {
                    window.location.assign(checkoutPath);
                    return;
                }

                setRegistration(payload);
                setStage(registrationStage(payload));
            })
            .catch(() => {
                if (cancelled) return;
                setErrors({ form: "Pendaftaran tidak dapat dimuat. Silakan buka kembali dari riwayat pembayaran." });
                setStage("form");
            });

        return () => {
            cancelled = true;
        };
    }, [isOpen, user]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !authFlowOpen) closeModal();
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [authFlowOpen, closeModal, isOpen]);

    useEffect(() => {
        if (!isOpen || authFlowOpen) return;
        const scrollY = window.scrollY;
        const previous = {
            position: document.body.style.position,
            top: document.body.style.top,
            left: document.body.style.left,
            right: document.body.style.right,
            width: document.body.style.width,
            overflow: document.body.style.overflow,
        };
        const previousHtmlOverflow = document.documentElement.style.overflow;

        document.documentElement.style.overflow = "hidden";
        document.body.style.position = "fixed";
        document.body.style.top = `-${scrollY}px`;
        document.body.style.left = "0";
        document.body.style.right = "0";
        document.body.style.width = "100%";
        document.body.style.overflow = "hidden";

        return () => {
            document.documentElement.style.overflow = previousHtmlOverflow;
            document.body.style.position = previous.position;
            document.body.style.top = previous.top;
            document.body.style.left = previous.left;
            document.body.style.right = previous.right;
            document.body.style.width = previous.width;
            document.body.style.overflow = previous.overflow;
            window.scrollTo(0, scrollY);
        };
    }, [authFlowOpen, isOpen]);

    const setField = <Key extends keyof RegistrationForm>(
        key: Key,
        value: RegistrationForm[Key],
    ) => {
        setForm((current) => ({ ...current, [key]: value }));
        setErrors((current) => ({ ...current, [key]: undefined, form: undefined }));
    };

    const selectPlan = useCallback(
        (plan: MembershipPlanItem) => {
            setField("membership_plan_id", plan.id);
            onSelectedPlanChange?.(plan);
        },
        [onSelectedPlanChange],
    );

    const submit: FormEventHandler = async (event) => {
        event.preventDefault();
        if (!user) {
            requestAuthentication();
            return;
        }
        if (processing || processingRef.current) return;

        const requiredErrors: FormErrors = {};
        if (!form.gender) {
            requiredErrors.gender = "Pilih jenis kelamin.";
        }
        if (!form.membership_plan_id) {
            requiredErrors.membership_plan_id = "Pilih paket membership.";
        }
        if (!form.category) {
            requiredErrors.category = "Pilih kategori pengguna.";
        }
        if (Object.keys(requiredErrors).length > 0) {
            setErrors(requiredErrors);
            return;
        }

        processingRef.current = true;
        setProcessing(true);
        setErrors({});
        try {
            const response = await axios.post("/membership/registrations", {
                ...form,
                idempotency_key: idempotencyKey.current,
            });
            const payload = unwrapRegistration(response.data);
            if (!payload) throw new Error("Invalid membership response");

            const checkoutPath = membershipCheckoutPath(payload);
            if (checkoutPath) {
                window.sessionStorage.removeItem(
                    MEMBERSHIP_DRAFT_STORAGE_KEY,
                );
                window.location.assign(checkoutPath);
                return;
            }

            setRegistration(payload);
            setStage(registrationStage(payload));
        } catch (requestError) {
            if (
                axios.isAxiosError(requestError) &&
                requestError.response?.status === 401
            ) {
                requestAuthentication();
            } else if (
                axios.isAxiosError(requestError) &&
                requestError.response?.status === 419
            ) {
                persistDraft();
                window.location.reload();
            } else {
                if (
                    axios.isAxiosError(requestError) &&
                    requestError.response?.status === 422
                ) {
                    idempotencyKey.current = newIdempotencyKey();
                }
                const validationErrors = firstValidationErrors(requestError);
                setErrors(
                    Object.keys(validationErrors).length > 0
                        ? validationErrors
                        : {
                              form: "Pendaftaran belum dapat diproses. Data Anda tetap aman; silakan coba kembali.",
                          },
                );
            }
        } finally {
            processingRef.current = false;
            setProcessing(false);
        }
    };

    const completePayment = () => {
        setStage("complete");
        idempotencyKey.current = newIdempotencyKey();
        window.sessionStorage.removeItem(MEMBERSHIP_DRAFT_STORAGE_KEY);
        clearContinuationUrl();
    };

    const restartRegistration = () => {
        setRegistration(null);
        setErrors({});
        setStage("form");
        idempotencyKey.current = newIdempotencyKey();
        clearContinuationUrl();
    };

    if (!mounted) return null;

    const content = (() => {
        if (!user) {
            return (
                <div className="auth-modal-form-flow">
                    <img src={brandLogo} alt="UB Sport Center" className="mx-auto h-[40px] w-[80px] object-contain" />
                    <h1 className="membership-modal-heading section-two-headline-weight mt-6">
                        Masuk Untuk Melanjutkan Membership Pilihan Anda
                    </h1>
                    <p className="mt-3 font-bdo text-[12px] leading-[1.45] text-black/50">
                        Akun diperlukan agar paket, pembayaran, dan masa berlaku
                        tersimpan aman serta dapat dipantau dari profil Anda.
                    </p>
                    {preferredPlan && (
                        <div className="membership-payment-summary mt-6" data-tier={normalizeTier(preferredPlan)}>
                            <span className="membership-payment-summary__signal" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-bdo text-[13px] font-medium">{preferredPlan.name}</p>
                                <p className="mt-1 font-bdo text-[10px] text-black/45">
                                    {tierLabels[normalizeTier(preferredPlan)]} · {planDurationLabel(preferredPlan)}
                                </p>
                            </div>
                            <span className="font-bdo text-[13px] font-semibold">Rp {formatPrice(preferredPlan.price)}</span>
                        </div>
                    )}
                    <button data-modal-autofocus type="button" onClick={requestAuthentication} className="membership-registration-submit mt-7">
                        <LockKeyhole className="h-4 w-4" /> Masuk untuk melanjutkan
                    </button>
                </div>
            );
        }

        if (!user.email_verified_at) {
            return (
                <div className="auth-modal-form-flow">
                    <img
                        src={brandLogo}
                        alt="UB Sport Center"
                        className="mx-auto h-[40px] w-[80px] object-contain"
                    />
                    <h1 className="membership-modal-heading section-two-headline-weight mt-6">
                        Verifikasi Email Sebelum Memilih Membership
                    </h1>
                    <p className="mt-3 font-bdo text-[12px] leading-[1.45] text-black/50">
                        Langkah singkat ini melindungi transaksi dan memastikan
                        status membership terhubung ke akun yang benar.
                    </p>
                    <a
                        data-modal-autofocus
                        href="/verify-email"
                        className="membership-registration-submit mt-7"
                    >
                        <LockKeyhole className="h-4 w-4" /> Verifikasi email
                    </a>
                </div>
            );
        }

        if (orderedPlans.length === 0) {
            return (
                <div className="auth-modal-form-flow">
                    <img
                        src={brandLogo}
                        alt="UB Sport Center"
                        className="mx-auto h-[40px] w-[80px] object-contain"
                    />
                    <h1 className="membership-modal-heading section-two-headline-weight mt-6">
                        Paket Membership Sedang Disiapkan
                    </h1>
                    <p className="mt-3 font-bdo text-[12px] leading-[1.45] text-black/50">
                        Belum ada paket aktif yang dapat didaftarkan. Tim UB
                        Sport Center sedang menyiapkan penawaran terbaru.
                    </p>
                    <button
                        data-modal-autofocus
                        type="button"
                        onClick={closeModal}
                        className="membership-registration-submit mt-7"
                    >
                        Tutup
                    </button>
                </div>
            );
        }

        if (stage === "loading") {
            return (
                <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
                    <LoaderCircle className="h-5 w-5 animate-spin text-black/55" />
                    <p className="mt-3 font-bdo text-[12px] text-black/45">Memuat pendaftaran membership</p>
                </div>
            );
        }

        if (stage === "payment" && registration) {
            return (
                <PaymentStage
                    key={registration.id}
                    registration={registration}
                    onComplete={completePayment}
                    onExpired={(payload) => {
                        setRegistration(payload);
                        setStage("expired");
                    }}
                />
            );
        }

        if (stage === "complete") {
            return <CompletedStage onClose={closeModal} />;
        }

        if (stage === "expired") {
            return <ExpiredStage onRestart={restartRegistration} />;
        }

        return (
            <div key={`membership-${openCount}`} className="auth-modal-form-flow">
                <img
                    src={brandLogo}
                    alt="UB Sport Center"
                    className="auth-stagger mx-auto h-[39px] w-[78px] object-contain"
                    style={motionDelay(60)}
                />
                <h1 className="auth-stagger membership-modal-heading membership-registration-heading section-two-headline-weight mt-[18px]" style={motionDelay(110)}>
                    Selamat Datang, Silahkan Temukan Membership Pilihan Anda
                </h1>
                <p className="auth-stagger mt-[7px] font-bdo text-[12px] font-normal leading-[1.25] text-[#6f7275]" style={motionDelay(160)}>
                    Paket pilihan terhubung langsung ke akun Anda.
                </p>

                <form onSubmit={submit} className="mt-[18px] w-full">
                    <div className="grid grid-cols-1 gap-x-3 gap-y-[11px] sm:grid-cols-2">
                        <div className="auth-stagger" style={motionDelay(210)}>
                            <label className={labelCls}>Nama lengkap</label>
                            <input
                                data-modal-autofocus
                                type="text"
                                value={form.full_name}
                                onChange={(event) => setField("full_name", event.target.value)}
                                placeholder="Nama lengkap"
                                autoComplete="name"
                                required
                                className={cn(inputCls, errors.full_name && authFormErrorRingClass)}
                            />
                            <FieldError message={errors.full_name} />
                        </div>
                        <div className="auth-stagger" style={motionDelay(250)}>
                            <label className={labelCls}>Email akun</label>
                            <input
                                type="email"
                                value={form.email}
                                readOnly
                                aria-readonly="true"
                                className={cn(inputCls, "cursor-not-allowed bg-[#eeeeec] text-black/56", errors.email && authFormErrorRingClass)}
                            />
                            <FieldError message={errors.email} />
                        </div>
                        <div className="auth-stagger" style={motionDelay(290)}>
                            <label className={labelCls}>No. WhatsApp</label>
                            <input
                                type="tel"
                                value={form.whatsapp}
                                onChange={(event) => setField("whatsapp", event.target.value)}
                                placeholder="08xxxxxxxxxx"
                                autoComplete="tel"
                                inputMode="tel"
                                required
                                className={cn(inputCls, errors.whatsapp && authFormErrorRingClass)}
                            />
                            <FieldError message={errors.whatsapp} />
                        </div>
                        <div
                            className="auth-stagger membership-form-field"
                            style={motionDelay(330)}
                        >
                            <label className={labelCls}>Jenis kelamin</label>
                            <CompactSelect
                                value={form.gender}
                                options={genderOptions}
                                placeholder="Pilih jenis kelamin"
                                ariaLabel="Jenis kelamin"
                                error={errors.gender}
                                onChange={(value) => setField("gender", value)}
                            />
                            <FieldError message={errors.gender} />
                        </div>
                        <div
                            className={cn(
                                "auth-stagger membership-form-field relative sm:col-span-2",
                                planSelectorOpen && "z-[90]",
                            )}
                            style={motionDelay(370)}
                        >
                            <label className={labelCls}>Paket membership</label>
                            <PlanSelector
                                plans={orderedPlans}
                                value={form.membership_plan_id}
                                error={errors.membership_plan_id}
                                onChange={selectPlan}
                                onOpenChange={setPlanSelectorOpen}
                            />
                            <FieldError message={errors.membership_plan_id} />
                        </div>
                        <div
                            className="auth-stagger membership-form-field sm:col-span-2"
                            style={motionDelay(410)}
                        >
                            <label className={labelCls}>Kategori pengguna</label>
                            <CompactSelect
                                value={form.category}
                                options={
                                    user.identity_category === "warga_kampus" &&
                                    user.identity_status === "verified"
                                        ? verifiedCategoryOptions
                                        : generalCategoryOptions
                                }
                                placeholder="Pilih kategori pengguna"
                                ariaLabel="Kategori pengguna"
                                error={errors.category}
                                onChange={(value) => setField("category", value)}
                            />
                            <FieldError message={errors.category} />
                        </div>
                    </div>

                    {errors.form && (
                        <p role="alert" className="mt-3 font-bdo text-[11px] leading-snug text-[#d80000]">{errors.form}</p>
                    )}

                    <button
                        type="submit"
                        disabled={processing || orderedPlans.length === 0}
                        className="auth-stagger membership-registration-submit membership-registration-submit--checkout mt-[17px]"
                        style={motionDelay(460)}
                    >
                        <span className="membership-registration-submit__label">
                            {processing
                                ? "Menyimpan pendaftaran"
                                : "Lanjutkan ke pembayaran"}
                        </span>
                        <span
                            aria-hidden="true"
                            className="membership-registration-submit__icon"
                        >
                            {processing ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                            ) : (
                                <ArrowUpRight
                                    className="h-4 w-4"
                                    strokeWidth={1.8}
                                />
                            )}
                        </span>
                    </button>
                </form>
            </div>
        );
    })();

    return createPortal(
        <>
            <div
                data-membership-modal
                aria-hidden={!isOpen || authFlowOpen}
                className={cn(
                    "fixed inset-0 z-[100000] flex items-center justify-center overflow-hidden px-3 py-4 transition-opacity duration-150",
                    isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
                    authFlowOpen && "pointer-events-none",
                )}
            >
                <div aria-hidden="true" className={cn("absolute inset-0 bg-black/16", isOpen && "auth-modal-backdrop-open")} onClick={closeModal} />
                <div
                    ref={dialogRef}
                    tabIndex={-1}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Pendaftaran membership UB Sport Center"
                    className={cn(
                        "membership-registration-modal relative z-10 flex max-h-[calc(100dvh_-_24px)] w-full max-w-[520px] flex-col overflow-hidden rounded-none bg-white shadow-[0_28px_80px_rgba(0,0,0,0.38)] lg:aspect-[1220/700] lg:h-auto lg:max-h-none lg:w-[min(1220px,calc(100vw_-_72px),calc((100dvh_-_64px)*1.743))] lg:max-w-none lg:flex-row",
                        isOpen && "auth-modal-open",
                        animationSettled && "auth-modal-settled",
                    )}
                    onAnimationEnd={(event) => {
                        if (event.currentTarget === event.target) setAnimationSettled(true);
                    }}
                >
                    <AuthVisualPanel active={isOpen} />
                    <section
                        data-lenis-prevent
                        className="auth-form-panel auth-form-scroll membership-registration-panel relative flex min-h-0 min-w-0 flex-1 justify-center overflow-y-auto overscroll-contain px-5 py-6 sm:px-8 lg:items-center lg:px-[38px] lg:py-[28px]"
                    >
                        <button
                            type="button"
                            onClick={closeModal}
                            aria-label="Tutup modal"
                            className="auth-close absolute right-4 top-4 z-40 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#4c585b] shadow-[0_8px_22px_rgba(0,34,68,0.10)] ring-1 ring-black/[0.06] transition hover:scale-105 hover:text-black lg:right-5 lg:top-5"
                        >
                            <X className="h-4 w-4" />
                        </button>
                        <div className="auth-modal-content relative z-[1] my-auto w-full max-w-[430px] py-6 sm:py-7 lg:max-w-none lg:py-0">
                            {content}
                        </div>
                    </section>
                </div>
            </div>

        </>,
        document.body,
    );
}
