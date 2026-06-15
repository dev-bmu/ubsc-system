import Navbar from "@/Components/Landing/Navbar";
import Footer from "@/Components/Landing/Footer";
import { Head, usePage } from "@inertiajs/react";
import { useState } from "react";
import type { PageProps } from "@/types";

interface BranchItem {
    id: number;
    title: string;
    slug: string;
    category_badge: string;
    description: string;
    gmaps_embed_url: string;
    address: string;
    contact: string;
    operating_hours: string;
    images_array: string[];
}

interface OtherBranch {
    id: number;
    title: string;
    slug: string;
    address: string;
    image: string;
}

type BranchShowProps = PageProps<{
    branchItem: BranchItem;
    otherBranches: OtherBranch[];
}>;

export default function BranchShow() {
    const { branchItem, otherBranches = [] } =
        usePage<BranchShowProps>().props;
    const [currentSlide, setCurrentSlide] = useState(0);
    const slides =
        branchItem.images_array?.length > 0
            ? branchItem.images_array
            : ["/assets/images/comingsoon.avif"];

    return (
        <>
            <Head>
                <title>
                    {branchItem.title} | Cabang | UB Sport Center
                </title>
                <meta
                    name="description"
                    content={`${branchItem.title} — ${branchItem.address}`}
                />
            </Head>

            <main className="relative bg-white">
                <Navbar activeSection="About" />

                {/* ── MODULE 1: Hero Banner ── */}
                <section className="relative h-[60vh] min-h-[420px] w-full overflow-hidden sm:h-[70vh] xl:h-[80vh] xl:min-h-[600px]">
                    {slides.map((img, idx) => (
                        <div
                            key={idx}
                            className="absolute inset-0 transition-opacity duration-700"
                            style={{
                                opacity: idx === currentSlide ? 1 : 0,
                            }}
                        >
                            <img
                                src={img}
                                alt={`${branchItem.title} - ${idx + 1}`}
                                className="h-full w-full object-cover object-center"
                            />
                        </div>
                    ))}
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.18)_0%,rgba(0,0,0,0.06)_40%,rgba(0,0,0,0.55)_100%)]" />
                    <div className="relative z-10 flex h-full flex-col justify-end px-6 pb-12 sm:px-10 sm:pb-16 xl:px-[clamp(2.75rem,4.65vw,5.5rem)] xl:pb-20">
                        <span className="mb-4 inline-flex w-fit rounded-full bg-[#D50000] px-3 py-1 font-bdo text-[10px] font-semibold uppercase tracking-wider text-white sm:px-4 sm:py-1.5 sm:text-xs">
                            {branchItem.category_badge}
                        </span>
                        <h1 className="max-w-[800px] font-bdo text-[clamp(1.75rem,4vw,3.5rem)] font-semibold leading-[1.08] tracking-[-0.04em] text-white">
                            {branchItem.title}
                        </h1>
                        {slides.length > 1 && (
                            <div className="mt-6 flex gap-2">
                                {slides.map((_, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() =>
                                            setCurrentSlide(idx)
                                        }
                                        className={`h-2 rounded-full transition-all duration-300 ${
                                            idx === currentSlide
                                                ? "w-8 bg-white"
                                                : "w-2 bg-white/40"
                                        }`}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </section>

                {/* ── MODULE 2: Metadata Cards ── */}
                <div className="mx-auto mt-10 max-w-[1440px] px-6 sm:mt-12 xl:mt-14 xl:px-20">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:gap-6">
                        {[
                            {
                                label: "Address",
                                value: branchItem.address,
                            },
                            {
                                label: "Operating Hours",
                                value: branchItem.operating_hours,
                            },
                            {
                                label: "Contact",
                                value: branchItem.contact,
                            },
                        ].map((card) => (
                            <div
                                key={card.label}
                                className="rounded-xl border border-black/5 bg-[#F7F7F7] p-5"
                            >
                                <p className="font-bdo text-[10px] font-medium uppercase tracking-[0.14em] text-black/40">
                                    {card.label}
                                </p>
                                <p className="mt-2 line-clamp-2 font-bdo text-sm font-medium leading-snug text-black sm:text-base">
                                    {card.value}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── MODULE 3: Content & Maps ── */}
                <div className="mx-auto mt-10 max-w-[1200px] px-6 sm:mt-12 xl:mt-14 xl:px-8">
                    <div className="w-full rounded-3xl bg-[#F7F7F7] p-6 sm:p-12 xl:p-16">
                        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
                            <div className="lg:col-span-7">
                                <h3 className="mb-6 font-bdo text-lg font-semibold text-black sm:text-xl">
                                    Tentang Cabang Ini
                                </h3>
                                <div className="max-w-none space-y-6 font-bdo text-sm font-normal leading-relaxed text-gray-600 sm:text-base">
                                    {branchItem.description
                                        .split("\n")
                                        .filter(Boolean)
                                        .map((p, i) => (
                                            <p key={i}>{p}</p>
                                        ))}
                                </div>
                            </div>
                            <div className="lg:col-span-5">
                                <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-gray-200 shadow-inner lg:aspect-[4/5]">
                                    {branchItem.gmaps_embed_url ? (
                                        <iframe
                                            src={
                                                branchItem.gmaps_embed_url
                                            }
                                            className="h-full w-full border-0"
                                            allowFullScreen
                                            loading="lazy"
                                            title="Google Maps"
                                        />
                                    ) : (
                                        <div className="flex h-full items-center justify-center">
                                            <p className="font-bdo text-sm text-gray-400">
                                                Peta tidak tersedia
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── MODULE 4: Other Branches ── */}
                {otherBranches.length > 0 && (
                    <div className="mx-auto mt-16 max-w-[1440px] px-6 pb-24 sm:mt-20 xl:mt-24 xl:px-20">
                        <div className="flex items-end justify-between">
                            <h2 className="font-bdo text-[clamp(1.5rem,2.4vw,2.5rem)] font-semibold tracking-[-0.04em] text-black">
                                Cabang Lainnya
                            </h2>
                            <a
                                href="/facilities"
                                className="font-bdo text-xs font-semibold uppercase tracking-[0.12em] text-black/50 transition-colors hover:text-black sm:text-sm"
                            >
                                LIHAT SEMUA ↗
                            </a>
                        </div>
                        <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3 xl:mt-12">
                            {otherBranches.map((branch) => (
                                <a
                                    key={branch.id}
                                    href={`/branches/${branch.slug}`}
                                    className="group flex flex-col"
                                >
                                    <div className="relative mb-4 aspect-[16/11] w-full overflow-hidden rounded-2xl">
                                        <img
                                            src={
                                                branch.image ||
                                                "/assets/images/comingsoon.avif"
                                            }
                                            alt={branch.title}
                                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                                            loading="lazy"
                                        />
                                    </div>
                                    <h3 className="line-clamp-2 font-bdo text-lg font-semibold text-black">
                                        {branch.title}
                                    </h3>
                                    <p className="mt-1 line-clamp-2 font-bdo text-sm text-gray-500">
                                        {branch.address}
                                    </p>
                                </a>
                            ))}
                        </div>
                    </div>
                )}
            </main>

            <Footer />
        </>
    );
}
