import { cn } from "@/lib/utils";
import { ChevronDown, Dumbbell, X } from "lucide-react";
import {
    useEffect,
    useState,
    type CSSProperties,
    type FormEventHandler,
} from "react";
import left from "../../../assets/images/membership.jpg";

interface MembershipModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const brandLogo = "/ubsc-blue.svg";

const labelCls =
    "mb-[7px] block font-bdo text-[13px] font-medium leading-none text-[#1f2937] [@media(max-height:760px)]:lg:mb-[6px] [@media(max-height:760px)]:lg:text-[12px]";
const inputCls =
    "h-[42px] w-full rounded-[7px] border-0 bg-[#f7f7f7] px-[13px] font-bdo text-[15px] font-normal text-[#1f2937] shadow-none outline-none transition-[background-color,box-shadow,transform] duration-200 placeholder:text-[#8d8d8d] hover:bg-[#f3f5f6] focus:bg-white focus:ring-2 focus:ring-[#15678D]/25 lg:h-[40px] lg:text-[14px] [@media(max-height:760px)]:lg:h-[34px] [@media(max-height:760px)]:lg:text-[13px]";

const motionDelay = (ms: number) =>
    ({ "--auth-delay": `${ms}ms` }) as CSSProperties;

function SelectChevron() {
    return (
        <span className="pointer-events-none absolute right-[12px] top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-[#6b7280]">
            <ChevronDown className="h-[15px] w-[15px]" />
        </span>
    );
}

function VisualPanel() {
    return (
        <div className="auth-modal-visual relative hidden h-full basis-[55.41%] shrink-0 overflow-hidden bg-[#151515] lg:block">
            <img
                src={left}
                alt="Membership UB Sport Center"
                className="absolute inset-0 h-full w-full object-cover"
                draggable={false}
            />
            <div className="auth-visual-vignette absolute inset-0" />
            <div className="absolute bottom-8 left-8 right-8 rounded-[18px] border border-white/15 bg-black/28 p-5 text-white backdrop-blur-md">
                <p className="font-bdo text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">
                    UBSC Membership
                </p>
                <p className="mt-2 max-w-[360px] font-bdo text-[clamp(1.3rem,1.56vw,1.9rem)] font-semibold leading-[1.05] tracking-[-0.04em]">
                    Mulai rutinitas olahraga yang lebih konsisten.
                </p>
            </div>
        </div>
    );
}

function MembershipForm({ onClose }: { onClose: () => void }) {
    const [form, setForm] = useState({
        fullName: "",
        email: "",
        gender: "",
        whatsapp: "",
        category: "",
    });

    const submit: FormEventHandler = (event) => {
        event.preventDefault();
        onClose();
    };

    const setField = (key: keyof typeof form, value: string) => {
        setForm((current) => ({ ...current, [key]: value }));
    };

    return (
        <form
            onSubmit={submit}
            className="mt-[25px] w-full [@media(max-height:860px)]:lg:mt-[20px] [@media(max-height:760px)]:lg:mt-[14px]"
        >
            <div className="auth-stagger" style={motionDelay(250)}>
                <label className={labelCls}>Nama Lengkap</label>
                <input
                    type="text"
                    value={form.fullName}
                    onChange={(event) => setField("fullName", event.target.value)}
                    placeholder="Masukkan nama lengkap"
                    autoComplete="name"
                    required
                    className={inputCls}
                />
            </div>

            <div
                className="auth-stagger mt-[14px] [@media(max-height:760px)]:lg:mt-[9px]"
                style={motionDelay(310)}
            >
                <label className={labelCls}>Email</label>
                <input
                    type="email"
                    value={form.email}
                    onChange={(event) => setField("email", event.target.value)}
                    placeholder="Masukkan email"
                    autoComplete="email"
                    required
                    className={inputCls}
                />
            </div>

            <div
                className="auth-stagger mt-[14px] [@media(max-height:760px)]:lg:mt-[9px]"
                style={motionDelay(360)}
            >
                <label className={labelCls}>Jenis Kelamin</label>
                <div className="relative">
                    <select
                        value={form.gender}
                        onChange={(event) => setField("gender", event.target.value)}
                        required
                        className={cn(inputCls, "appearance-none pr-10")}
                    >
                        <option value="" disabled>
                            Pilih jenis kelamin
                        </option>
                        <option value="L">Laki-laki</option>
                        <option value="P">Perempuan</option>
                    </select>
                    <SelectChevron />
                </div>
            </div>

            <div
                className="auth-stagger mt-[14px] [@media(max-height:760px)]:lg:mt-[9px]"
                style={motionDelay(410)}
            >
                <label className={labelCls}>No. Whatsapp</label>
                <input
                    type="tel"
                    value={form.whatsapp}
                    onChange={(event) => setField("whatsapp", event.target.value)}
                    placeholder="Masukkan nomor whatsapp"
                    autoComplete="tel"
                    required
                    className={inputCls}
                />
            </div>

            <div
                className="auth-stagger mt-[14px] [@media(max-height:760px)]:lg:mt-[9px]"
                style={motionDelay(460)}
            >
                <label className={labelCls}>Kategori</label>
                <div className="relative">
                    <select
                        value={form.category}
                        onChange={(event) => setField("category", event.target.value)}
                        required
                        className={cn(inputCls, "appearance-none pr-10")}
                    >
                        <option value="" disabled>
                            Pilih kategori
                        </option>
                        <option value="warga-ub">Warga UB</option>
                        <option value="umum">Umum</option>
                    </select>
                    <SelectChevron />
                </div>
            </div>

            <button
                type="submit"
                className="auth-stagger mt-[24px] flex h-[48px] w-full items-center justify-center gap-2 rounded-[11px] bg-gradient-to-r from-[#002244] to-[#15678D] font-bdo text-[15px] font-medium text-white shadow-[0_14px_24px_rgba(0,34,68,0.24)] transition-[transform,box-shadow,opacity] duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_30px_rgba(0,34,68,0.28)] hover:opacity-95 [@media(max-height:860px)]:lg:mt-[20px] [@media(max-height:760px)]:lg:mt-[14px] [@media(max-height:760px)]:lg:h-[41px] [@media(max-height:760px)]:lg:text-[14px]"
                style={motionDelay(520)}
            >
                <Dumbbell className="h-[16px] w-[16px]" />
                Daftar Sekarang
            </button>
        </form>
    );
}

export default function MembershipModal({
    isOpen,
    onClose,
}: MembershipModalProps) {
    const [openCount, setOpenCount] = useState(0);

    useEffect(() => {
        if (isOpen) setOpenCount((current) => current + 1);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };

        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [isOpen, onClose]);

    useEffect(() => {
        if (!isOpen) return;

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
    }, [isOpen]);

    return (
        <div
            className={cn(
                "fixed inset-0 z-[200] flex items-center justify-center overflow-hidden px-3 py-4 transition-opacity duration-150",
                isOpen
                    ? "pointer-events-auto opacity-100"
                    : "pointer-events-none opacity-0",
            )}
        >
            <div
                className={cn(
                    "absolute inset-0 bg-black/10",
                    isOpen && "auth-modal-backdrop-open",
                )}
                onClick={onClose}
            />

            <div
                className={cn(
                    "relative z-10 flex max-h-[calc(100vh_-_32px)] w-full max-w-[520px] flex-col overflow-hidden rounded-none bg-white shadow-[0_28px_80px_rgba(0,0,0,0.45)] lg:aspect-[1220/763] lg:h-auto lg:max-h-none lg:w-[min(1220px,calc(100vw_-_72px),calc((100vh_-_72px)*1.599))] lg:max-w-none lg:flex-row xl:w-[min(1220px,calc(100vw_-_96px),calc((100vh_-_72px)*1.599))] [@media(max-height:760px)]:lg:w-[min(1126px,calc(100vw_-_56px),calc((100vh_-_56px)*1.599))]",
                    isOpen && "auth-modal-open",
                )}
            >
                <VisualPanel />

                <section className="auth-form-panel auth-form-scroll relative flex min-h-0 min-w-0 flex-1 justify-center overflow-y-auto overscroll-contain px-6 py-8 sm:px-10 lg:items-center lg:px-[46px] lg:py-[38px] xl:px-[50px] [@media(max-height:760px)]:lg:py-[24px]">
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Tutup modal"
                        className="auth-close absolute right-5 top-5 z-10 flex h-[25px] w-[25px] items-center justify-center rounded-full bg-white/90 text-[#4c585b] shadow-[0_8px_22px_rgba(0,34,68,0.10)] ring-1 ring-black/5 transition-[transform,background-color,color,box-shadow] duration-200 hover:scale-105 hover:bg-white hover:text-black hover:shadow-[0_10px_26px_rgba(0,34,68,0.16)] lg:right-[27px] lg:top-[25px]"
                    >
                        <X className="h-[17px] w-[17px]" />
                    </button>

                    <div className="auth-modal-content relative z-[1] my-auto w-full max-w-[430px] py-8 sm:py-10 lg:max-w-none lg:py-0">
                        <div
                            key={`membership-${openCount}`}
                            className="auth-modal-form-flow"
                        >
                            <img
                                src={brandLogo}
                                alt="UB Sport Center"
                                className="auth-stagger mx-auto h-[43px] w-[86px] object-contain [@media(max-height:760px)]:lg:h-[35px] [@media(max-height:760px)]:lg:w-[72px]"
                                style={motionDelay(80)}
                            />
                            <h1
                                className="auth-stagger mt-[23px] font-bdo text-[23px] font-semibold leading-[1.2] tracking-normal text-black [@media(max-height:860px)]:lg:mt-[19px] [@media(max-height:760px)]:lg:mt-[14px] [@media(max-height:760px)]:lg:text-[20px]"
                                style={motionDelay(140)}
                            >
                                Bergabung Sekarang Juga Untuk
                                <br />
                                Menjadi Member Resmi Kami
                            </h1>
                            <p
                                className="auth-stagger mt-[9px] font-bdo text-[14px] font-normal leading-none text-[#777777] [@media(max-height:760px)]:lg:text-[12px]"
                                style={motionDelay(200)}
                            >
                                Fokus konsisten raih target sehat kamu.
                            </p>

                            <MembershipForm onClose={onClose} />
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}