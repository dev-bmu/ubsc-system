import { X } from "lucide-react";
import { useEffect } from "react";
import left from "../../../assets/images/membership.jpg";

interface MembershipModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function MembershipModal({
    isOpen,
    onClose,
}: MembershipModalProps) {
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [isOpen, onClose]);

    useEffect(() => {
        document.body.style.overflow = isOpen ? "hidden" : "";
        return () => {
            document.body.style.overflow = "";
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="relative flex h-[85vh] w-full max-w-7xl overflow-hidden rounded-3xl bg-white"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="hidden w-1/2 flex-shrink-0 md:block">
                    <img
                        src={left}
                        className="h-full w-full object-cover"
                        alt="Membership"
                    />
                </div>

                <div className="flex w-full flex-col overflow-y-auto p-8 md:w-1/2 md:p-12">
                    <button
                        type="button"
                        onClick={onClose}
                        className="absolute right-6 top-6 flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-800"
                        aria-label="Tutup modal"
                    >
                        <X size={16} />
                    </button>

                    <div className="flex flex-col  text-left">
                        <img
                            src="/ubsc-blue.svg"
                            alt="UB Sport Center"
                            className="h-10 w-auto"
                        />

                        <h2 className="mt-6 text-[clamp(1rem,1.25vw,24px)] font-semibold leading-tight text-gray-900">
                            Bergabung Sekarang Juga Untuk <br />
                            Menjadi Member Resmi Kami
                        </h2>
                        <p className="mt-2 text-[clamp(0.75rem,0.73vw,14px)] text-left font-normal text-black opacity-60">
                            Fokus Konsisten Raih Target Sehat Kamu
                        </p>
                    </div>

                    <form
                        className="mt-5 flex flex-col gap-4"
                        onSubmit={(e) => e.preventDefault()}
                    >
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[clamp(0.75rem,0.73vw,14px)] font-medium text-gray-700">
                                Nama Lengkap
                            </label>
                            <input
                                type="text"
                                placeholder="Masukkan nama lengkap"
                                className="w-full rounded-lg border border-transparent bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none ring-1 ring-gray-200 transition focus:ring-2 focus:ring-navy-900"
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-[clamp(0.75rem,0.73vw,14px)] font-medium text-gray-700">
                                Email
                            </label>
                            <input
                                type="email"
                                placeholder="Masukkan email"
                                className="w-full rounded-lg border border-transparent bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none ring-1 ring-gray-200 transition focus:ring-2 focus:ring-navy-900"
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-[clamp(0.75rem,0.73vw,14px)] font-medium text-gray-700">
                                Jenis Kelamin
                            </label>
                            <div className="relative">
                                <select className="w-full appearance-none rounded-lg border border-transparent bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none ring-1 ring-gray-200 transition focus:ring-2 focus:ring-navy-900">
                                    <option value="" disabled selected>
                                        Pilih jenis kelamin
                                    </option>
                                    <option value="L">Laki-laki</option>
                                    <option value="P">Perempuan</option>
                                </select>
                                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                                    <svg
                                        width="16"
                                        height="16"
                                        viewBox="0 0 16 16"
                                        fill="none"
                                    >
                                        <path
                                            d="M4 6l4 4 4-4"
                                            stroke="currentColor"
                                            strokeWidth="1.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-[clamp(0.75rem,0.73vw,14px)] font-medium text-gray-700">
                                No. Whatsapp
                            </label>
                            <input
                                type="tel"
                                placeholder="Masukkan nomor whatsapp"
                                className="w-full rounded-lg border border-transparent bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none ring-1 ring-gray-200 transition focus:ring-2 focus:ring-navy-900"
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-[clamp(0.75rem,0.73vw,14px)] font-medium text-gray-700">
                                Kategori
                            </label>
                            <div className="relative">
                                <select className="w-full appearance-none rounded-lg border border-transparent bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none ring-1 ring-gray-200 transition focus:ring-2 focus:ring-navy-900">
                                    <option value="" disabled selected>
                                        Pilih Kategori
                                    </option>
                                    <option value="warga-ub">Warga UB</option>
                                    <option value="umum">Umum</option>
                                </select>
                                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                                    <svg
                                        width="16"
                                        height="16"
                                        viewBox="0 0 16 16"
                                        fill="none"
                                    >
                                        <path
                                            d="M4 6l4 4 4-4"
                                            stroke="currentColor"
                                            strokeWidth="1.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                </span>
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="mt-4 w-full rounded-xl py-4 text-[clamp(0.875rem,0.83vw,16px)] font-semibold text-white transition-opacity hover:opacity-90"
                            style={{ backgroundColor: "#2D3A5A" }}
                        >
                            Daftar Sekarang
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
