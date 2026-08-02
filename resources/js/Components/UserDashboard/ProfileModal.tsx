import { ChangeEvent, FormEventHandler, ReactNode, useEffect, useRef, useState } from "react";
import { BadgeCheck, CalendarDays, Camera, CheckCircle2, Eye, EyeOff, Fingerprint, KeyRound, LocateFixed, ScanFace, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { useForm, usePage } from "@inertiajs/react";
import { cn } from "@/lib/utils";
import type { PageProps } from "@/types";
import AccountModalShell, { PrimaryButton, SecondaryButton } from "./AccountModalShell";
import { GoogleIcon } from "../Landing/AuthModal";

interface Props { onClose: () => void; }
const PROFILE_UI_CSS = String.raw`
    /* Editorial profile workspace */
    .acc-profile{
        --ap-paper:#faf8f3;--ap-surface:#f2efe8;--ap-control:#fffefd;
        --ap-ink:#10161c;--ap-muted:#687078;--ap-line:rgba(16,22,28,.11);
        --ap-blue:var(--ae-blue);--ap-red:var(--ae-red);--ap-success:#197554;
        max-width:840px;margin:0 auto;padding:2px 0 5px;color:var(--ap-ink);font-family:"BDO Grotesk";
    }
    .acc-profile,.acc-profile *{box-sizing:border-box;font-family:"BDO Grotesk"!important}
    .acc-profile-identity{position:relative;display:grid;grid-template-columns:104px minmax(0,1fr) minmax(150px,190px);align-items:center;gap:24px;margin:0 0 28px;padding:20px;overflow:hidden;border:1px solid rgba(16,22,28,.08);border-radius:15px;background:linear-gradient(112deg,#fffefa 0%,#f6f2ea 68%,#edf3f4 100%);box-shadow:0 18px 42px -38px rgba(16,22,28,.48),inset 0 1px rgba(255,255,255,.95)}
    .acc-profile-identity::before{position:absolute;top:0;bottom:0;left:0;width:4px;content:"";background:linear-gradient(180deg,var(--ap-blue) 0 66%,var(--ap-red) 66%)}
    .acc-profile-identity::after{display:none}
    .acc-profile-avatar-wrap{position:relative;display:block;width:96px;height:96px;min-height:0}
    .acc-profile-avatar-wrap::before,.acc-profile-avatar-wrap::after{display:none}
    .acc-profile-avatar,.acc-profile-avatar:hover{position:relative;display:block;width:96px;height:96px;overflow:hidden;border:1px solid rgba(16,22,28,.12);border-radius:15px;color:#fff;background:linear-gradient(145deg,#194b62,#10161c);box-shadow:0 14px 30px -24px rgba(16,22,28,.86);transform:none;transition:border-color .25s ease,transform .25s ease}
    .acc-profile-avatar:hover{border-color:rgba(21,103,141,.42);transform:translateY(-1px)}
    .acc-profile-avatar:focus-visible{outline:3px solid rgba(21,103,141,.2);outline-offset:3px}
    .acc-profile-avatar img{display:block;width:100%;height:100%;object-fit:cover;transition:transform .4s ease}
    .acc-profile-avatar:hover img{transform:scale(1.025)}
    .acc-profile-avatar__fallback{display:grid;width:100%;height:100%;place-items:center;font-size:27px;font-weight:600}
    .acc-profile-avatar__edit{position:absolute;right:6px;bottom:6px;left:6px;display:flex;height:31px;align-items:center;justify-content:center;gap:6px;border:1px solid rgba(255,255,255,.28);border-radius:10px;color:#fff;background:linear-gradient(135deg,rgba(8,14,19,.32),rgba(21,103,141,.30));box-shadow:0 9px 22px -14px rgba(0,0,0,.78),inset 0 1px rgba(255,255,255,.17);opacity:.34;backdrop-filter:blur(12px) saturate(145%);-webkit-backdrop-filter:blur(12px) saturate(145%);transform:translateY(5px);transition:opacity .22s ease,transform .28s cubic-bezier(.16,1,.3,1),background .22s ease}
    .acc-profile-avatar:hover .acc-profile-avatar__edit,.acc-profile-avatar:focus-visible .acc-profile-avatar__edit{opacity:1;transform:translateY(0);background:linear-gradient(135deg,rgba(8,14,19,.50),rgba(21,103,141,.42))}
    .acc-profile-avatar__edit svg{width:14px;height:14px;flex:none;stroke-width:1.7}
    .acc-profile-avatar__edit span{font-size:11px;font-weight:600;line-height:1;white-space:nowrap}
    .acc-profile-person{min-width:0;align-self:center}
    .acc-profile-verification{display:flex;align-items:center;gap:8px;color:var(--ap-blue);font-size:11px;font-weight:600;line-height:1.2;letter-spacing:.015em;text-transform:none}
    .acc-profile-verification i{position:relative;width:8px;height:8px;flex:none;border-radius:0;background:var(--ap-blue);box-shadow:none;clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)}
    .acc-profile-person h3{margin:9px 0 0;overflow:hidden;color:var(--ap-ink);font-size:clamp(25px,3.7vw,34px);font-weight:600;line-height:.98;letter-spacing:-.04em;text-overflow:ellipsis;white-space:nowrap}
    .acc-profile-person__email{margin:7px 0 0!important;overflow:hidden;color:var(--ap-muted);font-size:12px!important;line-height:1.3!important;text-overflow:ellipsis;white-space:nowrap}
    .acc-profile-ledger{display:grid;align-self:stretch;margin:0;border-left:1px solid var(--ap-line)}
    .acc-profile-ledger__item{display:flex;min-width:0;flex-direction:column;justify-content:center;padding:7px 0 7px 18px}
    .acc-profile-ledger__item+.acc-profile-ledger__item{border-top:1px solid var(--ap-line)}
    .acc-profile-ledger dt{color:var(--ap-muted);font-size:11px;font-weight:400;line-height:1.2}
    .acc-profile-ledger dd{display:flex;align-items:center;gap:7px;margin:5px 0 0;color:var(--ap-ink);font-size:12px;font-weight:600;line-height:1.2;letter-spacing:-.01em}
    .acc-profile-ledger dd svg{width:14px;height:14px;color:var(--ap-blue);stroke-width:1.8}
    .acc-profile-chapter{position:relative;margin-top:32px;padding-top:20px;border-top:1px solid var(--ap-line)}
    .acc-profile-chapter:first-of-type{margin-top:0}
    .acc-profile-chapter__head{display:grid;grid-template-columns:54px minmax(0,1fr) auto;align-items:start;gap:14px;margin-bottom:15px}
    .acc-profile-chapter__index{padding-top:3px;color:var(--ap-blue);font-size:11px!important;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.2;letter-spacing:.02em}
    .acc-profile-chapter__copy{min-width:0}
    .acc-profile-chapter__title{font-size:20px;font-weight:600;line-height:1.05;letter-spacing:-.025em}
    .acc-profile-chapter__note{padding-top:4px;color:var(--ap-muted);font-size:11px!important;line-height:1.2!important;white-space:nowrap}
    .acc-profile-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:0;border-radius:0;background:transparent;box-shadow:none}
    .acc-profile-field,.acc-profile-field:nth-child(2n){position:relative;min-width:0;padding:12px 13px 11px;border:1px solid rgba(16,22,28,.09);border-radius:10px;background:var(--ap-control);transition:border-color .2s ease,box-shadow .2s ease,background .2s ease}
    .acc-profile-field:focus-within{z-index:1;border-color:rgba(21,103,141,.46);border-radius:10px;background:#fff;box-shadow:0 0 0 3px rgba(21,103,141,.08);transform:none}
    .acc-profile-field--wide{grid-column:1/-1}
    .acc-profile-field__label{display:flex;align-items:center;gap:7px;margin-bottom:7px;color:var(--ap-muted);font-size:11px!important;font-weight:500;line-height:1.2!important;letter-spacing:0;text-transform:none}
    .acc-profile-field__label svg{width:14px;height:14px;flex:none;color:var(--ap-blue);stroke-width:1.7}
    .acc-profile-field__control{position:relative;display:block}
    .acc-profile-input{display:block;width:100%;height:34px;padding:0;border:0;border-radius:0!important;outline:0;color:var(--ap-ink);background:transparent;font-size:14px;font-weight:500;line-height:34px;box-shadow:none}
    .acc-profile-input::placeholder{color:rgba(16,22,28,.32)}
    .acc-profile-input:hover,.acc-profile-input:focus{border:0;box-shadow:none}
    .acc-profile-input:disabled{cursor:not-allowed;color:rgba(16,22,28,.52);-webkit-text-fill-color:rgba(16,22,28,.52)}
    .acc-profile-input--password{padding-right:38px}
    .acc-profile-reveal{position:absolute;top:50%;right:0;display:grid;width:30px;height:30px;place-items:center;border:1px solid rgba(16,22,28,.08);border-radius:10px;color:var(--ap-muted);background:var(--ap-surface);transform:translateY(-50%);transition:color .2s ease,background .2s ease,border-color .2s ease}
    .acc-profile-reveal:hover{border-color:rgba(21,103,141,.22);color:#fff;background:var(--ap-blue)}
    .acc-profile-reveal:focus-visible{outline:3px solid rgba(21,103,141,.16);outline-offset:1px}
    .acc-profile-reveal svg{width:15px;height:15px;stroke-width:1.7}
    .acc-profile-error{display:flex;align-items:flex-start;gap:7px;margin:7px 0 0;color:var(--ap-red);font-size:11px!important;line-height:1.35!important}
    .acc-profile-error::before{width:7px;height:7px;flex:none;margin-top:4px;content:"";border-radius:0;background:var(--ap-red);clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)}
    .acc-profile-success{display:flex;align-items:center;gap:9px;margin:10px 0 0!important;padding:10px 12px;border:0;border-left:3px solid var(--ap-success);border-radius:0;color:var(--ap-success);background:rgba(25,117,84,.06);font-size:11px!important;line-height:1.35!important}
    .acc-profile-success svg{width:16px;height:16px;flex:none;stroke-width:1.8}
    .acc-profile-security-intro{display:grid;grid-template-columns:42px minmax(0,1fr);gap:14px;align-items:center;margin-bottom:10px;padding:3px 0 13px;border:0;border-bottom:1px solid var(--ap-line);border-radius:0;background:transparent}
    .acc-profile-security-intro__icon{display:grid;width:40px;height:40px;place-items:center;border-radius:10px;color:#fff;background:var(--ap-ink);box-shadow:none}
    .acc-profile-security-intro__icon svg{width:17px;height:17px;stroke-width:1.65}
    .acc-profile-security-intro h4,.acc-profile-google h4{font-size:14px;font-weight:600;line-height:1.2}
    .acc-profile-security-intro p,.acc-profile-google p{margin:4px 0 0!important;color:var(--ap-muted);font-size:12px!important;line-height:1.45!important}
    .acc-profile-security-action{display:flex;width:100%;min-height:48px;align-items:center;justify-content:space-between;gap:14px;margin-top:10px;padding:7px 7px 7px 15px;border:0;border-radius:10px;color:#fff;background:var(--ap-ink);font-size:13px;font-weight:600;box-shadow:0 14px 28px -24px rgba(16,22,28,.9);transition:background .2s ease,transform .2s ease}
    .acc-profile-security-action:hover{filter:none;background:var(--ap-blue);transform:translateY(-1px)}
    .acc-profile-security-action:focus-visible{outline:3px solid rgba(21,103,141,.2);outline-offset:2px}
    .acc-profile-security-action:disabled{cursor:not-allowed;opacity:.45;transform:none}
    .acc-profile-security-action__mark{display:grid;width:34px;height:34px;place-items:center;border-radius:10px;color:var(--ap-ink);background:#fff}
    .acc-profile-security-action__mark svg{width:15px;height:15px;stroke-width:1.8}
    .acc-profile-google{display:grid;grid-template-columns:48px minmax(0,1fr);gap:15px;align-items:center;padding:15px 0;border-top:1px solid var(--ap-line);border-bottom:1px solid var(--ap-line);border-radius:0;background:transparent;box-shadow:none}
    .acc-profile-google__mark{display:grid;width:44px;height:44px;place-items:center;border:1px solid rgba(16,22,28,.09);border-radius:10px;background:#fff;box-shadow:0 10px 24px -20px rgba(16,22,28,.66)}
    .acc-profile-google__mark svg{width:24px;height:24px}
    .acc-profile-google__status{display:inline-flex;align-items:center;gap:6px;margin-top:7px;color:var(--ap-success);font-size:11px!important;font-weight:500;line-height:1.2!important}
    .acc-profile-google__status svg{width:13px;height:13px;stroke-width:1.8}
    .acc-profile-footer{display:grid;grid-template-columns:minmax(0,1fr) 112px;gap:9px}
    .acc-profile-footer .ae-primary,.acc-profile-footer .ae-secondary{border-radius:10px}
    @media(min-width:640px){
        .ae-root .ae-content-frame{margin-right:18px;margin-left:18px}
        .acc-profile-chapter{margin-top:34px}
    }
    @media(max-width:639px){
        .ae-root .ae-stage{height:122px}
        .ae-root .ae-paper{margin-top:-23px}
        .acc-profile{padding-top:0}
        .acc-profile-identity{grid-template-columns:76px minmax(0,1fr);gap:14px;margin-bottom:22px;padding:14px}
        .acc-profile-avatar-wrap,.acc-profile-avatar,.acc-profile-avatar:hover{width:72px;height:72px}
        .acc-profile-avatar__edit{right:5px;bottom:5px;left:auto;width:29px;height:29px;opacity:1;transform:none}
        .acc-profile-avatar__edit svg{width:13px;height:13px}
        .acc-profile-avatar__edit span{display:none}
        .acc-profile-person h3{margin-top:7px;font-size:22px}
        .acc-profile-person__email{margin-top:5px!important;font-size:11px!important}
        .acc-profile-ledger{grid-column:1/-1;grid-template-columns:repeat(2,minmax(0,1fr));border-top:1px solid var(--ap-line);border-left:0}
        .acc-profile-ledger__item{padding:11px 8px 0 0}
        .acc-profile-ledger__item+.acc-profile-ledger__item{border-top:0;border-left:1px solid var(--ap-line);padding-left:12px}
        .acc-profile-ledger dt,.acc-profile-ledger dd{font-size:11px}
        .acc-profile-chapter{margin-top:25px;padding-top:17px}
        .acc-profile-chapter__head{grid-template-columns:42px minmax(0,1fr);gap:10px;margin-bottom:12px}
        .acc-profile-chapter__note{display:none}
        .acc-profile-chapter__title{font-size:18px}
        .acc-profile-fields{grid-template-columns:1fr;gap:8px}
        .acc-profile-field--wide{grid-column:auto}
        .acc-profile-field,.acc-profile-field:nth-child(2n){padding:11px 12px 10px}
        .acc-profile-security-intro{grid-template-columns:38px minmax(0,1fr);gap:11px}
        .acc-profile-security-intro__icon{width:36px;height:36px}
        .acc-profile-footer{grid-template-columns:1fr}
    }
    @media(prefers-reduced-motion:reduce){.acc-profile *{scroll-behavior:auto!important;transition:none!important}}
    @media(hover:none){.acc-profile-avatar__edit{opacity:1;transform:none}}
`;

function FieldError({ message }: { message?: string }) {
    return message ? <p className="acc-profile-error" role="alert">{message}</p> : null;
}

function Field({ label, icon, error, wide, children }: { label: string; icon: ReactNode; error?: string; wide?: boolean; children: ReactNode }) {
    return (
        <label className={cn("acc-profile-field", wide && "acc-profile-field--wide")}>
            <span className="acc-profile-field__label">{icon}{label}</span>
            <span className="acc-profile-field__control">{children}</span>
            <FieldError message={error} />
        </label>
    );
}

function Chapter({ indexLabel, title, note, children }: { indexLabel: string; title: string; note: string; children: ReactNode }) {
    return (
        <section className="acc-profile-chapter">
            <header className="acc-profile-chapter__head">
                <span className="acc-profile-chapter__index">{indexLabel}</span>
                <div className="acc-profile-chapter__copy">
                    <h3 className="acc-profile-chapter__title">{title}</h3>
                </div>
                <span className="acc-profile-chapter__note">{note}</span>
            </header>
            {children}
        </section>
    );
}

export default function ProfileModal({ onClose }: Props) {
    const { auth } = usePage<PageProps>().props;
    const user = auth.user!;
    const profileForm = useForm<{ _method: "patch"; name: string; birth_place: string; birth_date: string; phone_number: string; avatar: File | null }>({
        _method: "patch", name: user.name, birth_place: user.birth_place ?? "", birth_date: user.birth_date ?? "", phone_number: user.phone_number ?? "", avatar: null,
    });
    const passwordForm = useForm({ current_password: "", password: "", password_confirmation: "" });
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [avatarFailed, setAvatarFailed] = useState(false);
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const avatarInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);
    useEffect(() => setAvatarFailed(false), [avatarPreview, user.avatar_url, user.avatar]);

    const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] ?? null;
        if (!file) return;
        setAvatarPreview((current) => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(file); });
        profileForm.setData("avatar", file);
    };
    const submitProfile: FormEventHandler = (event) => {
        event.preventDefault();
        profileForm.post(route("profile.update"), { forceFormData: true, preserveScroll: true, preserveState: true });
    };
    const submitPassword: FormEventHandler = (event) => {
        event.preventDefault();
        passwordForm.put(route("password.update"), { preserveScroll: true, preserveState: true, onSuccess: () => passwordForm.reset() });
    };

    const initials = user.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
    const displayAvatar = avatarPreview ?? user.avatar_url ?? user.avatar ?? null;

    return (
        <AccountModalShell
            bannerGradient="profile" eyebrow="Profil Member" title="Identitas Dan Keamanan"
            subtitle="Kelola data pribadi, akses, dan keamanan akun dalam satu tempat."
            wordmark="Profil" index="01" accent="#15678d" maxWidthClass="sm:max-w-[920px]" onClose={onClose}
            footer={<div className="acc-profile-footer">
                <PrimaryButton type="submit" form="profile-info-form" disabled={profileForm.processing}>
                    <CheckCircle2 aria-hidden="true" />{profileForm.processing ? "Menyimpan Perubahan..." : "Simpan Perubahan"}
                </PrimaryButton>
                <SecondaryButton type="button" onClick={onClose}>Tutup</SecondaryButton>
            </div>}
        >
            <style>{PROFILE_UI_CSS}</style>
            <div className="acc-profile">
                <section className="acc-profile-identity" aria-label="Identitas pengguna">
                    <div className="acc-profile-avatar-wrap">
                        <button type="button" className="acc-profile-avatar" onClick={() => avatarInputRef.current?.click()} aria-label="Ganti foto profil">
                            {displayAvatar && !avatarFailed
                                ? <img src={displayAvatar} alt="Foto profil" referrerPolicy="no-referrer" onError={() => setAvatarFailed(true)} />
                                : <span className="acc-profile-avatar__fallback">{initials}</span>}
                            <span className="acc-profile-avatar__edit"><Camera aria-hidden="true" /><span>Ganti Foto</span></span>
                        </button>
                    </div>
                    <div className="acc-profile-person">
                        <span className="acc-profile-verification"><i aria-hidden="true" /> Akun Terverifikasi</span>
                        <h3>{user.name}</h3><p className="acc-profile-person__email">{user.email}</p>
                    </div>
                    <dl className="acc-profile-ledger">
                        <div className="acc-profile-ledger__item">
                            <dt>Nomor akun</dt>
                            <dd>UBSC—{String(user.id).padStart(5, "0")}</dd>
                        </div>
                        <div className="acc-profile-ledger__item">
                            <dt>Status data</dt>
                            <dd><BadgeCheck aria-hidden="true" /> Tersinkron</dd>
                        </div>
                    </dl>
                    <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/jpg" aria-label="Unggah foto profil" hidden onChange={handleAvatarChange} />
                </section>
                <FieldError message={profileForm.errors.avatar} />

                <form id="profile-info-form" onSubmit={submitProfile}>
                    <Chapter indexLabel="01 / 02" title="Informasi Pribadi" note="data utama akun">
                        <div className="acc-profile-fields">
                            <Field label="Nama lengkap" icon={<ScanFace />} error={profileForm.errors.name} wide>
                                <input className="acc-profile-input" type="text" value={profileForm.data.name} onChange={(e) => profileForm.setData("name", e.target.value)} placeholder="Nama lengkap Anda" />
                            </Field>
                            <Field label="Tempat lahir" icon={<LocateFixed />} error={profileForm.errors.birth_place}>
                                <input className="acc-profile-input" type="text" value={profileForm.data.birth_place} onChange={(e) => profileForm.setData("birth_place", e.target.value)} placeholder="Kota kelahiran" />
                            </Field>
                            <Field label="Tanggal lahir" icon={<CalendarDays />} error={profileForm.errors.birth_date}>
                                <input className="acc-profile-input" type="date" value={profileForm.data.birth_date} onChange={(e) => profileForm.setData("birth_date", e.target.value)} />
                            </Field>
                            <Field label="Nomor telepon" icon={<Smartphone />} error={profileForm.errors.phone_number}>
                                <input className="acc-profile-input" type="tel" inputMode="tel" value={profileForm.data.phone_number} onChange={(e) => profileForm.setData("phone_number", e.target.value)} placeholder="08xxxxxxxxxx" />
                            </Field>
                            <Field label="Email terverifikasi" icon={<ShieldCheck />}>
                                <input className="acc-profile-input" type="email" value={user.email} disabled readOnly />
                            </Field>
                        </div>
                        {profileForm.recentlySuccessful && <p className="acc-profile-success"><CheckCircle2 /> Identitas berhasil diselaraskan.</p>}
                    </Chapter>
                </form>

                <Chapter indexLabel="02 / 02" title="Keamanan Akun" note="akses akun">
                    {user.is_google ? <div className="acc-profile-google">
                        <span className="acc-profile-google__mark"><GoogleIcon /></span>
                        <div><h4>Akses Google Tertaut</h4><p>Identitas masuk dikelola melalui akun Google yang sama. Kata sandi lokal tidak diperlukan.</p>
                            <span className="acc-profile-google__status"><BadgeCheck /> jalur akses terverifikasi</span></div>
                    </div> : <form onSubmit={submitPassword}>
                        <div className="acc-profile-security-intro">
                            <span className="acc-profile-security-intro__icon"><Fingerprint /></span>
                            <div><h4>Bangun Kunci Akses Baru</h4><p>Konfirmasi kunci saat ini, lalu gunakan kombinasi baru yang hanya Anda kenali.</p></div>
                        </div>
                        <div className="acc-profile-fields">
                            <Field label="Kata sandi saat ini" icon={<KeyRound />} error={passwordForm.errors.current_password} wide>
                                <input className="acc-profile-input acc-profile-input--password" type={showCurrent ? "text" : "password"} value={passwordForm.data.current_password} onChange={(e) => passwordForm.setData("current_password", e.target.value)} />
                                <button type="button" className="acc-profile-reveal" onClick={() => setShowCurrent((value) => !value)} aria-label={showCurrent ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}>{showCurrent ? <EyeOff /> : <Eye />}</button>
                            </Field>
                            <Field label="Kata sandi baru" icon={<Sparkles />} error={passwordForm.errors.password}>
                                <input className="acc-profile-input acc-profile-input--password" type={showNew ? "text" : "password"} value={passwordForm.data.password} onChange={(e) => passwordForm.setData("password", e.target.value)} />
                                <button type="button" className="acc-profile-reveal" onClick={() => setShowNew((value) => !value)} aria-label={showNew ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}>{showNew ? <EyeOff /> : <Eye />}</button>
                            </Field>
                            <Field label="Ulangi kata sandi" icon={<ShieldCheck />} error={passwordForm.errors.password_confirmation}>
                                <input className="acc-profile-input" type="password" value={passwordForm.data.password_confirmation} onChange={(e) => passwordForm.setData("password_confirmation", e.target.value)} />
                            </Field>
                        </div>
                        {passwordForm.recentlySuccessful && <p className="acc-profile-success"><CheckCircle2 /> Kunci akses berhasil diperbarui.</p>}
                        <button type="submit" disabled={passwordForm.processing} className="acc-profile-security-action">
                            <span>{passwordForm.processing ? "Memperbarui Kata Sandi..." : "Perbarui Kata Sandi"}</span>
                            <span className="acc-profile-security-action__mark"><KeyRound /></span>
                        </button>
                    </form>}
                </Chapter>
            </div>
        </AccountModalShell>
    );
}
