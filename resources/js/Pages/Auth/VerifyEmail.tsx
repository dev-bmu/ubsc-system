import { Head, Link, useForm } from "@inertiajs/react";
import type { FormEventHandler } from "react";
import { CheckCircle, Mail, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export default function VerifyEmail({ status }: { status?: string }) {
    const { post, processing } = useForm({});

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route("verification.send"));
    };

    const resent = status === "verification-link-sent";

    return (
        <>
            <Head title="Verifikasi Email — UBSC" />

            <div className="min-h-screen bg-[#0b1221] flex flex-col items-center justify-center p-4">
                {/* Background grid */}
                <div
                    className="pointer-events-none fixed inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage:
                            "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
                        backgroundSize: "48px 48px",
                    }}
                />

                <div className="relative z-10 w-full max-w-[420px]">
                    {/* Icon + brand */}
                    <div className="mb-8 flex flex-col items-center gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#002244] to-[#15678D] shadow-[0_0_40px_rgba(21,103,141,0.4)]">
                            <Mail className="h-7 w-7 text-white" strokeWidth={1.75} />
                        </div>
                        <div className="text-center">
                            <p className="font-bdo text-[11px] font-bold uppercase tracking-[0.2em] text-[#15678D]">
                                Verifikasi Email
                            </p>
                            <h1 className="mt-1 font-clash text-2xl font-semibold text-white">
                                UB Sport Center
                            </h1>
                        </div>
                    </div>

                    {/* Card */}
                    <div className="overflow-hidden rounded-[24px] border border-white/[0.07] bg-white/[0.04] shadow-2xl backdrop-blur-sm">
                        <div className="border-b border-white/[0.07] px-7 py-5">
                            <h2 className="font-clash text-[15px] font-medium text-white/90">
                                Cek Kotak Masuk Anda
                            </h2>
                            <p className="mt-0.5 font-bdo text-[12px] text-white/40">
                                Tautan verifikasi telah dikirim ke email Anda
                            </p>
                        </div>

                        <div className="flex flex-col gap-5 px-7 py-6">
                            <p className="font-bdo text-[13px] leading-relaxed text-white/60">
                                Terima kasih telah mendaftar! Sebelum melanjutkan,
                                silakan verifikasi alamat email Anda dengan mengklik
                                tautan yang telah kami kirimkan.
                            </p>

                            {/* Resent success notice */}
                            {resent && (
                                <div className="flex items-start gap-3 rounded-xl bg-emerald-500/10 px-4 py-3 ring-1 ring-emerald-500/20">
                                    <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
                                    <p className="font-bdo text-[12px] text-emerald-400">
                                        Tautan verifikasi baru telah dikirim ke alamat email Anda.
                                    </p>
                                </div>
                            )}

                            {/* Resend button */}
                            <form onSubmit={submit}>
                                <button
                                    type="submit"
                                    disabled={processing}
                                    className={cn(
                                        "flex w-full items-center justify-center gap-2 rounded-xl py-3.5",
                                        "font-clash text-[14px] font-semibold text-white transition-all",
                                        "bg-gradient-to-br from-[#002244] to-[#15678D]",
                                        "shadow-[inset_0_-6px_12px_-4px_rgba(0,0,0,0.3),0_0_30px_rgba(21,103,141,0.2)]",
                                        "hover:opacity-90 hover:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:scale-100",
                                    )}
                                >
                                    {processing ? (
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                                    ) : (
                                        <RefreshCw className="h-4 w-4" strokeWidth={2} />
                                    )}
                                    {processing ? "Mengirim…" : "Kirim Ulang Email Verifikasi"}
                                </button>
                            </form>

                            {/* Logout */}
                            <div className="flex justify-center">
                                <Link
                                    href={route("logout")}
                                    method="post"
                                    as="button"
                                    className="font-bdo text-[12px] text-white/30 transition-colors hover:text-white/60"
                                >
                                    Keluar dari akun
                                </Link>
                            </div>
                        </div>
                    </div>

                    <p className="mt-6 text-center font-bdo text-[11px] text-white/20">
                        Sudah verifikasi? <Link href="/" className="text-white/40 hover:text-white/60 transition-colors">Kembali ke beranda</Link>
                    </p>
                </div>
            </div>
        </>
    );
}
