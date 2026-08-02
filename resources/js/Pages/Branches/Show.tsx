import Navbar from "@/Components/Landing/Navbar";
import Footer from "@/Components/Landing/Footer";
import SeoHead from "@/Components/SeoHead";
import { Link, usePage } from "@inertiajs/react";
import type { PageProps } from "@/types";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import ig from "../../../assets/icons/ig.svg";
import x from "../../../assets/icons/x.svg";
import tiktok from "../../../assets/icons/tiktok.svg";
import facebook from "../../../assets/icons/fb.svg";

interface SocialLink {
    label: string;
    href: string;
}

interface BranchDetailItem {
    id: number;
    slug: string;
    title: string;
    category: string;
    category_badge: string;
    description: string;
    gmaps_embed_url: string;
    address: string;
    contact: string;
    operating_hours: string;
    images_array: string[];
    cover_image?: string | null;
    map_url?: string;
    social_links?: SocialLink[];
}

type BranchShowPageProps = PageProps<{
    branchItem: BranchDetailItem;
    otherBranches: BranchDetailItem[];
}>;

const FALLBACK_IMAGE = "/assets/images/ub-sport-center-kantor-pusat-malang.avif";
const socialIconMap: Record<string, string> = {
    instagram: ig,
    "twitter/x": x,
    tiktok,
    facebook,
};

function isHtml(value: string): boolean {
    return /<\/?[a-z][\s\S]*>/i.test(value);
}

function textToHtml(value: string): string {
    return value
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
        .join("");
}

function DetailHero({ branchItem }: { branchItem: BranchDetailItem }) {
    const image = branchItem.images_array?.[0] || branchItem.cover_image || FALLBACK_IMAGE;

    return (
        <section className="relative h-[clamp(560px,45.45vw,698px)] min-h-[560px] overflow-hidden bg-black text-white">
            <div className="absolute inset-0 overflow-hidden">
                <img
                    src={image}
                    alt={branchItem.title}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="eager"
                    draggable={false}
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.28)_0%,rgba(0,0,0,0.08)_40%,rgba(0,0,0,0.72)_100%)]" />
            </div>

            <Navbar activeSection="About" />

            <div className="relative z-10 flex h-full items-end">
                <div className="w-full px-[clamp(1.5rem,4.5vw,5.5rem)] pb-[clamp(2.2rem,4.2vw,4.8rem)]">
                    <div className="max-w-[980px]">
                        <h1 className="max-w-[1060px] font-bdo text-[clamp(2.2rem,3.3vw,4rem)] font-semibold leading-[1.08] tracking-[-0.045em] text-white">
                            {branchItem.title}
                        </h1>
                        {branchItem.description && (
                            <p className="mt-6 max-w-[760px] font-bdo text-[clamp(0.95rem,1.04vw,1.22rem)] font-normal leading-[1.45] text-white/70 line-clamp-2">
                                {branchItem.description}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}

function MetaCard({
    label,
    children,
    clamp = false,
}: {
    label: string;
    children: ReactNode;
    clamp?: boolean;
}) {
    return (
        <article className="min-h-[88px] rounded-xl border border-black/5 bg-[#F7F7F7] p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
                <span className="font-bdo text-[0.78rem] font-medium text-black/45">
                    {label}
                </span>
                <span className="font-bdo text-sm leading-none text-black/20">..</span>
            </div>
            <div className={clamp ? "line-clamp-2" : ""}>{children}</div>
        </article>
    );
}

function SocialLinksRow({ links = [] }: { links?: SocialLink[] }) {
    return (
        <div className="flex items-center gap-3">
            {links.slice(0, 4).map((link) => {
                const icon = socialIconMap[link.label.toLowerCase()];

                return (
                    <a
                        key={link.label}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={link.label}
                        className="flex size-8 items-center justify-center rounded-full bg-white text-black ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:bg-black hover:[&>img]:invert"
                    >
                        {icon ? (
                            <img
                                src={icon}
                                alt=""
                                className="size-3.5 transition"
                                draggable={false}
                            />
                        ) : (
                            <span className="font-bdo text-[0.65rem] font-semibold">
                                {link.label.slice(0, 1)}
                            </span>
                        )}
                    </a>
                );
            })}
        </div>
    );
}

function BranchRecommendationCard({ item }: { item: BranchDetailItem }) {
    return (
        <article className="group block">
            <Link href={route("branches.show", item.slug)} className="block">
                <div className="relative mb-4 aspect-[16/11] w-full overflow-hidden rounded-2xl bg-[#F7F7F7]">
                    <img
                        src={item.cover_image || item.images_array?.[0] || FALLBACK_IMAGE}
                        alt={item.title}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                        loading="lazy"
                        draggable={false}
                    />
                </div>
                <h3 className="line-clamp-2 font-bdo text-lg font-semibold leading-tight tracking-[-0.025em] text-black">
                    {item.title}
                </h3>
            </Link>
            <a
                href={item.map_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.title)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block line-clamp-2 font-bdo text-sm font-normal leading-relaxed text-gray-500 transition hover:text-black"
            >
                {item.address}
            </a>
        </article>
    );
}

export default function BranchShow() {
    const { branchItem, otherBranches } = usePage<BranchShowPageProps>().props;
    const contentHtml = isHtml(branchItem.description)
        ? branchItem.description
        : textToHtml(branchItem.description);
    const recommendations = otherBranches.slice(0, 6);

    return (
        <>
            <SeoHead />

            <main className="bg-white text-black">
                <DetailHero branchItem={branchItem} />

                <section className="mx-auto max-w-[1200px] px-6 pt-12 xl:px-0">
                    <h2 className="max-w-[760px] font-bdo text-[clamp(2rem,2.35vw,3rem)] font-semibold leading-[1.08] tracking-[-0.045em] text-black">
                        {branchItem.title}
                    </h2>
                </section>

                <section className="mx-auto mt-10 grid max-w-[720px] grid-cols-1 gap-4 px-6 md:grid-cols-3 xl:gap-6 xl:px-0">
                    <MetaCard label="Category">
                        <p className="font-bdo text-[0.9rem] font-medium leading-tight text-black">
                            {branchItem.category || "Indoor, Outdoor, & Hybrid"}
                        </p>
                    </MetaCard>
                    <MetaCard label="Sosmed">
                        <SocialLinksRow links={branchItem.social_links} />
                    </MetaCard>
                    <MetaCard label="Address" clamp>
                        <a
                            href={branchItem.map_url || "https://maps.app.goo.gl/X7uRTbmnwqKAGfXr8"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bdo text-[0.9rem] font-medium leading-tight text-black transition hover:text-gray-500"
                        >
                            {branchItem.address}
                        </a>
                    </MetaCard>
                </section>

                <section className="mx-auto mt-16 w-full max-w-[1200px] rounded-[24px] bg-[#F7F7F7] p-6 sm:p-12 xl:p-16">
                    <div
                        className="news-detail-prose max-w-none font-bdo text-sm font-normal leading-relaxed text-gray-600 sm:text-base"
                        dangerouslySetInnerHTML={{ __html: contentHtml }}
                    />
                </section>

                {recommendations.length > 0 && (
                    <section className="mx-auto mt-10 max-w-[1200px] px-6 pb-24 xl:px-0">
                        <div className="flex items-center justify-between gap-6">
                            <h2 className="font-bdo text-[clamp(1.65rem,1.95vw,2.4rem)] font-medium leading-none tracking-[-0.045em] text-black">
                                Cabang Lainnya
                            </h2>
                            <Link
                                href="/branches"
                                className="inline-flex h-9 items-center gap-2 rounded-full bg-[#EFEFEF] px-5 font-bdo text-[0.62rem] font-semibold uppercase tracking-[0.32em] text-black transition hover:bg-black hover:text-white"
                            >
                                Lihat semua
                                <ArrowUpRight className="size-3.5" />
                            </Link>
                        </div>

                        <div className="mt-12 grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
                            {recommendations.map((item) => (
                                <BranchRecommendationCard key={item.id} item={item} />
                            ))}
                        </div>
                    </section>
                )}
            </main>

            <Footer />
        </>
    );
}
