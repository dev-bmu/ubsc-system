import { Head, Link, usePage } from "@inertiajs/react";
import {
    ArrowLeft,
    Home,
    LockKeyhole,
    ShieldAlert,
    ShieldCheck,
} from "lucide-react";
import AdminLayout from "@/Layouts/AdminLayout";
import type { PageProps } from "@/types";

const STAFF_ROLES = [
    "Administrator",
    "Manager",
    "Finance",
    "Staff Central",
    "Staff Front Office",
];

function ForbiddenContent() {
    const { auth } = usePage<PageProps>().props;
    const role = auth.user?.role ?? "Guest";
    const isStaff = Boolean(auth.user?.role && STAFF_ROLES.includes(auth.user.role));

    return (
        <>
            <Head title="Access Restricted" />

            <div className="relative flex min-h-[calc(100dvh-120px)] items-center justify-center overflow-hidden px-4 py-10">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(249,115,22,0.12),transparent_34%),radial-gradient(circle_at_78%_72%,rgba(14,165,233,0.10),transparent_32%)]" />
                <div className="pointer-events-none absolute inset-x-8 top-10 h-px bg-gradient-to-r from-transparent via-orange-200 to-transparent" />

                <section className="relative w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/80 bg-white/[0.92] shadow-[0_30px_100px_rgba(15,23,42,0.18)] ring-1 ring-slate-950/5 backdrop-blur-2xl">
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-slate-950 via-orange-500 to-sky-500" />

                    <div className="grid gap-0 lg:grid-cols-[0.85fr_1.15fr]">
                        <div className="relative overflow-hidden bg-slate-950 p-8 text-white">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(249,115,22,0.36),transparent_34%),radial-gradient(circle_at_80%_78%,rgba(14,165,233,0.26),transparent_38%)]" />
                            <div className="relative">
                                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10 ring-1 ring-white/15">
                                    <ShieldAlert className="h-7 w-7 text-orange-300" />
                                </div>

                                <p className="mt-10 font-bdo text-[11px] font-bold uppercase tracking-[0.24em] text-orange-200">
                                    Status 403
                                </p>
                                <h1 className="mt-3 font-clash text-5xl font-semibold tracking-tight">
                                    Access
                                    <span className="block text-white/45">
                                        Restricted
                                    </span>
                                </h1>

                                <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.08] p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/[0.12] text-emerald-300 ring-1 ring-emerald-300/20">
                                            <ShieldCheck size={18} />
                                        </div>
                                        <div>
                                            <p className="font-clash text-sm font-semibold">
                                                {role}
                                            </p>
                                            <p className="mt-0.5 text-xs font-medium text-white/50">
                                                Permission controlled by Administrator
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-7 sm:p-9">
                            <div className="inline-flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-700">
                                <LockKeyhole size={14} />
                                Akses belum aktif
                            </div>

                            <h2 className="mt-5 font-clash text-3xl font-semibold tracking-tight text-slate-950">
                                Halaman ini belum tersedia untuk role Anda.
                            </h2>
                            <p className="mt-3 max-w-xl text-sm font-medium leading-6 text-slate-500">
                                Administrator belum memberikan izin untuk membuka halaman atau menjalankan aksi ini. Menu yang tidak tersedia akan terlihat redup di sidebar agar alur kerja tetap jelas.
                            </p>

                            <div className="mt-7 grid gap-3 sm:grid-cols-3">
                                {[
                                    ["Scope", "Role based"],
                                    ["Signal", "Read only"],
                                    ["Next", "Ask admin"],
                                ].map(([label, value]) => (
                                    <div
                                        key={label}
                                        className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                                    >
                                        <p className="font-bdo text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                            {label}
                                        </p>
                                        <p className="mt-2 font-clash text-sm font-semibold text-slate-900">
                                            {value}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-8 flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => window.history.back()}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-clash text-sm font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-200 hover:text-orange-700"
                                >
                                    <ArrowLeft size={16} />
                                    Kembali
                                </button>
                                {isStaff ? (
                                    <>
                                        <Link
                                            href={route("admin.dashboard")}
                                            className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 font-clash text-sm font-semibold text-white shadow-[0_12px_30px_rgba(15,23,42,0.22)] transition-all hover:-translate-y-0.5 hover:bg-orange-600"
                                        >
                                            <Home size={16} />
                                            Dashboard
                                        </Link>
                                        <Link
                                            href={route("admin.settings.roles")}
                                            className="inline-flex items-center gap-2 rounded-2xl bg-orange-50 px-4 py-3 font-clash text-sm font-semibold text-orange-700 ring-1 ring-orange-100 transition-all hover:-translate-y-0.5 hover:bg-orange-100"
                                        >
                                            <ShieldCheck size={16} />
                                            Lihat akses saya
                                        </Link>
                                    </>
                                ) : (
                                    <Link
                                        href="/"
                                        className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 font-clash text-sm font-semibold text-white shadow-[0_12px_30px_rgba(15,23,42,0.22)] transition-all hover:-translate-y-0.5 hover:bg-orange-600"
                                    >
                                        <Home size={16} />
                                        Beranda
                                    </Link>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </>
    );
}

export default function Forbidden() {
    const { auth } = usePage<PageProps>().props;
    const isStaff = Boolean(auth.user?.role && STAFF_ROLES.includes(auth.user.role));

    if (isStaff) {
        return (
            <AdminLayout>
                <ForbiddenContent />
            </AdminLayout>
        );
    }

    return <ForbiddenContent />;
}
