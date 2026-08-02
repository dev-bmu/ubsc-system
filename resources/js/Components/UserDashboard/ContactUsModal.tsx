import {
    AtSign,
    Clock3,
    MapPinned,
    MessageCircleMore,
    ShieldCheck,
} from "lucide-react";
import AccountModalShell, { AccountCtaArrow, PrimaryButton } from "./AccountModalShell";

interface Props { onClose: () => void; }

const message = "Halo tim UB Sport Center, saya membutuhkan bantuan terkait akun atau layanan saya.";
const whatsappUrl = `https://wa.me/6285280809080?text=${encodeURIComponent(message)}`;
const locationUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("UB Sport Center, Jl. Terusan Cibogo No.1, Malang")}`;

const contactOptions = [
    {
        number: "01",
        title: "WhatsApp",
        value: "+62 852 8080 9080",
        note: "Pilihan tercepat untuk reservasi, kelas, pembayaran, dan membership.",
        href: whatsappUrl,
        icon: MessageCircleMore,
        tone: "blue",
        action: "Mulai chat",
    },
    {
        number: "02",
        title: "Email resmi",
        value: "contact@ubsportcenter.co.id",
        note: "Gunakan untuk invoice, dokumen, dan kebutuhan administratif.",
        href: "mailto:contact@ubsportcenter.co.id",
        icon: AtSign,
        tone: "red",
        action: "Tulis email",
    },
    {
        number: "03",
        title: "Lokasi layanan",
        value: "Jl. Terusan Cibogo No.1, Malang",
        note: "Buka navigasi menuju pusat layanan UB Sport Center.",
        href: locationUrl,
        icon: MapPinned,
        tone: "blue",
        action: "Buka peta",
    },
] as const;

const SUPPORT_CSS = String.raw`
    .acc-support {
        --support-ink: var(--ae-ink);
        --support-blue: var(--ae-blue);
        --support-red: var(--ae-red);
        display: grid;
        gap: 14px;
        color: var(--support-ink);
        font-family: "BDO Grotesk", sans-serif;
    }
    .acc-support,
    .acc-support * { box-sizing: border-box; }
    .acc-support__availability {
        position: relative;
        min-height: 210px;
        overflow: hidden;
        padding: 19px;
        border-radius: 15px;
        color: var(--support-ink);
        background:
            linear-gradient(135deg, rgba(21,103,141,.075), transparent 42%),
            rgba(255,255,255,.72);
        box-shadow: inset 0 0 0 1px rgba(16,21,28,.055), inset 0 1px rgba(255,255,255,.92);
    }
    .acc-support__availability::before {
        position: absolute;
        top: 0;
        right: 19px;
        width: 54px;
        height: 3px;
        content: "";
        background: linear-gradient(90deg, var(--support-blue), var(--support-red));
    }
    .acc-support__availability::after {
        position: absolute;
        top: 20px;
        right: 19px;
        bottom: 20px;
        width: 1px;
        content: "";
        background: linear-gradient(to bottom, transparent, rgba(16,21,28,.07), transparent);
    }
    .acc-support__availability-head {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
    }
    .acc-support__team { display: flex; min-width: 0; align-items: center; gap: 11px; }
    .acc-support__team-icon {
        display: grid;
        width: 38px;
        height: 38px;
        flex: none;
        place-items: center;
        border: 1px solid rgba(16,21,28,.09);
        border-radius: 10px;
        color: var(--support-blue);
        background: rgba(21,103,141,.08);
    }
    .acc-support__team-icon svg { width: 17px; height: 17px; stroke-width: 1.7; }
    .acc-support__team strong { display: block; font-size: 13px; font-weight: 600; line-height: 1.25; }
    .acc-support__team span { display: block; margin-top: 3px; color: rgba(16,21,28,.5); font-size: 11px; line-height: 1.3; }
    .acc-support__online {
        display: inline-flex;
        flex: none;
        align-items: center;
        gap: 7px;
        color: rgba(16,21,28,.6);
        font-size: 11px;
    }
    .acc-support__online i { width: 6px; height: 6px; border-radius: 50%; background: #40ca82; box-shadow: 0 0 0 4px rgba(64,202,130,.09); }
    .acc-support__availability-copy { position: relative; z-index: 1; max-width: 30ch; margin-top: 38px; }
    .acc-support__availability-copy h3 { font-size: 25px; font-weight: 600; line-height: 1.02; letter-spacing: -.03em; text-wrap: balance; }
    .acc-support__availability-copy p { margin-top: 9px; color: rgba(16,21,28,.57); font-size: 12px; line-height: 1.48; }
    .acc-support__hours {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        gap: 9px;
        margin-top: 24px;
        color: rgba(16,21,28,.51);
    }
    .acc-support__hours svg { width: 15px; height: 15px; stroke-width: 1.7; }
    .acc-support__hours span { font-size: 11px; }
    .acc-support__hours strong { color: var(--support-ink); font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .acc-support__channels {
        overflow: hidden;
        border-radius: 15px;
        background: rgba(255,255,255,.62);
        box-shadow: inset 0 0 0 1px rgba(16,21,28,.055), inset 0 1px rgba(255,255,255,.9);
    }
    .acc-support__channels-head {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 16px;
        padding: 17px 17px 14px;
        border-bottom: 1px solid rgba(16,21,28,.09);
    }
    .acc-support__channels-head h3 { font-size: 17px; font-weight: 600; line-height: 1.2; letter-spacing: -.018em; }
    .acc-support__channels-head span { color: rgba(16,21,28,.43); font-size: 11px; }
    .acc-support__channel {
        display: grid;
        grid-template-columns: 26px 38px minmax(0,1fr) auto;
        align-items: center;
        gap: 11px;
        min-height: 86px;
        padding: 13px 15px;
        color: inherit;
        text-decoration: none;
        transition: background .2s ease;
    }
    .acc-support__channel + .acc-support__channel { border-top: 1px solid rgba(16,21,28,.08); }
    .acc-support__channel:hover,
    .acc-support__channel:focus-visible { background: rgba(21,103,141,.055); }
    .acc-support__channel:focus-visible { outline: 2px solid var(--support-blue); outline-offset: -2px; }
    .acc-support__channel-number { align-self: start; padding-top: 5px; color: rgba(16,21,28,.34); font-size: 11px; font-variant-numeric: tabular-nums; }
    .acc-support__channel-icon {
        display: grid;
        width: 38px;
        height: 38px;
        place-items: center;
        border-radius: 10px;
        color: var(--support-blue);
        background: rgba(21,103,141,.09);
    }
    .acc-support__channel[data-tone="red"] .acc-support__channel-icon { color: var(--support-red); background: rgba(255,0,0,.075); }
    .acc-support__channel-icon svg { width: 17px; height: 17px; stroke-width: 1.7; }
    .acc-support__channel-copy { min-width: 0; }
    .acc-support__channel-copy strong { display: block; font-size: 14px; font-weight: 600; line-height: 1.25; }
    .acc-support__channel-copy em { display: block; margin-top: 3px; overflow: hidden; color: rgba(16,21,28,.67); font-size: 12px; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
    .acc-support__channel-copy small { display: block; margin-top: 4px; color: rgba(16,21,28,.46); font-size: 11px; line-height: 1.38; }
    .acc-support__channel-action { display: inline-flex; align-items: center; gap: 6px; color: rgba(16,21,28,.44); font-size: 11px; font-weight: 600; white-space: nowrap; }
    .acc-support__channel-action .ae-cta-arrow { width: 15px; height: 15px; transform: rotate(-45deg); transition: transform .55s cubic-bezier(.76,0,.24,1); }
    .acc-support__channel:hover .acc-support__channel-action { color: var(--support-blue); }
    .acc-support__channel:hover .acc-support__channel-action .ae-cta-arrow,
    .acc-support__channel:focus-visible .acc-support__channel-action .ae-cta-arrow { transform: rotate(0deg); }
    .acc-support__note {
        display: grid;
        grid-template-columns: 34px minmax(0,1fr);
        align-items: center;
        gap: 11px;
        padding: 14px 15px;
        border-radius: 10px;
        color: rgba(16,21,28,.58);
        background: linear-gradient(90deg, rgba(21,103,141,.075), rgba(255,255,255,.58));
    }
    .acc-support__note-icon { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 10px; color: var(--support-blue); background: white; }
    .acc-support__note-icon svg { width: 15px; height: 15px; stroke-width: 1.7; }
    .acc-support__note strong { display: block; color: var(--support-ink); font-size: 12px; font-weight: 600; }
    .acc-support__note p { margin-top: 3px; font-size: 11px; line-height: 1.42; }
    @media (min-width: 760px) {
        .acc-support { grid-template-columns: minmax(0,.78fr) minmax(0,1.22fr); gap: 16px; align-items: stretch; }
        .acc-support__availability { min-height: 100%; }
        .acc-support__channels { grid-column: 2; grid-row: 1; }
        .acc-support__note { grid-column: 1 / -1; }
    }
    @media (max-width: 520px) {
        .acc-support__availability { min-height: 222px; }
        .acc-support__channel { grid-template-columns: 22px 36px minmax(0,1fr) 18px; gap: 9px; padding-inline: 12px; }
        .acc-support__channel-icon { width: 36px; height: 36px; }
        .acc-support__channel-action span { display: none; }
        .acc-support__channel-copy small { max-width: 35ch; }
    }
    @media (prefers-reduced-motion: reduce) {
        .acc-support__channel,
        .acc-support__channel-action svg { transition: none !important; }
    }
`;

export default function ContactUsModal({ onClose }: Props) {
    return (
        <AccountModalShell
            bannerGradient="support"
            eyebrow="Pusat Bantuan"
            title="Bantuan UBSC"
            subtitle="Pilih jalur komunikasi yang sesuai agar kebutuhan Anda ditangani tanpa langkah yang berlebihan."
            wordmark="Bantuan"
            index="04"
            accent="#ff0000"
            maxWidthClass="sm:max-w-[940px]"
            onClose={onClose}
            footer={
                <PrimaryButton type="button" onClick={() => window.open(whatsappUrl, "_blank", "noopener,noreferrer")}>
                    <MessageCircleMore /> Hubungi Tim UBSC
                </PrimaryButton>
            }
        >
            <style>{SUPPORT_CSS}</style>
            <div className="acc-support">
                <section className="acc-support__availability" aria-label="Ketersediaan tim bantuan">
                    <div className="acc-support__availability-head">
                        <div className="acc-support__team">
                            <span className="acc-support__team-icon"><MessageCircleMore aria-hidden="true" /></span>
                            <div><strong>Tim Layanan UBSC</strong><span>Bantuan akun dan layanan</span></div>
                        </div>
                        <span className="acc-support__online"><i aria-hidden="true" /> Setiap hari</span>
                    </div>
                    <div className="acc-support__availability-copy">
                        <h3>Jawaban tepat, tanpa alur yang rumit.</h3>
                        <p>Sertakan nomor transaksi atau nama paket agar tim kami dapat langsung memeriksa konteks Anda.</p>
                    </div>
                    <div className="acc-support__hours"><Clock3 aria-hidden="true" /><span>Setiap hari</span><strong>06.00—22.00</strong></div>
                </section>

                <section className="acc-support__channels" aria-labelledby="support-channel-title">
                    <header className="acc-support__channels-head">
                        <h3 id="support-channel-title">Pilih cara menghubungi kami</h3>
                        <span>03 jalur resmi</span>
                    </header>
                    {contactOptions.map((option) => (
                        <a
                            key={option.number}
                            href={option.href}
                            target={option.href.startsWith("http") ? "_blank" : undefined}
                            rel={option.href.startsWith("http") ? "noopener noreferrer" : undefined}
                            className="acc-support__channel"
                            data-tone={option.tone}
                        >
                            <span className="acc-support__channel-number">{option.number}</span>
                            <span className="acc-support__channel-icon"><option.icon aria-hidden="true" /></span>
                            <span className="acc-support__channel-copy"><strong>{option.title}</strong><em>{option.value}</em><small>{option.note}</small></span>
                            <span className="acc-support__channel-action"><span>{option.action}</span><AccountCtaArrow /></span>
                        </a>
                    ))}
                </section>

                <div className="acc-support__note">
                    <span className="acc-support__note-icon"><ShieldCheck aria-hidden="true" /></span>
                    <div><strong>Gunakan jalur resmi UB Sport Center.</strong><p>Jangan pernah membagikan kata sandi atau kode verifikasi kepada siapa pun.</p></div>
                </div>
            </div>
        </AccountModalShell>
    );
}
