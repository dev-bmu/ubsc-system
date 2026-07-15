import FacilityBadge from "@/Components/Landing/FacilityBadge";

interface ClassPriceItem {
    label: string;
}

export interface ClassPricing {
    id: string;
    title: string;
    classCode: string;
    description: string;
    image: string;
    badgeLocation: string;
    badgeType: string;
    daftarHarga: { left: ClassPriceItem[]; right: ClassPriceItem[] };
    persewaan: { left: ClassPriceItem[]; right: ClassPriceItem[] };
}

interface Props {
    item: ClassPricing;
}

export default function PricingClassCard({ item }: Props) {
    const title = item.title.replace(/\.$/, "");
    const classCode = item.classCode.replace(/^\/+|\/+$/g, "");

    return (
        <div className="flex w-[18.55rem] flex-shrink-0 flex-col overflow-hidden rounded-none border border-white/40 bg-black xl:w-[clamp(29.5rem,30.4vw,36.6rem)]">
            <div className="relative h-[7.2rem] xl:h-[14.05rem]">
                <img
                    src={item.image}
                    alt={item.title}
                    className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-black/30" />
                <div className="absolute inset-0 flex flex-col justify-between px-4 py-[1.05rem] xl:px-7 xl:py-[2.05rem]">
                    <div className="flex items-start justify-between gap-2">
                        <p className="font-bdo text-[1.32rem] font-semibold leading-none tracking-[-0.07em] text-white xl:text-[clamp(2rem,2.12vw,2.6rem)]">
                            {title}
                        </p>
                        <span className="mt-0.5 flex-shrink-0 font-bdo text-[0.55rem] font-normal tracking-[-0.02em] text-white/80 xl:mt-1 xl:text-[0.875rem]">
                            /{classCode}/
                        </span>
                    </div>
                    <div>
                        <FacilityBadge
                            location={item.badgeLocation}
                            category={item.badgeType}
                            variant="blue-red"
                        />
                    </div>
                </div>
            </div>

            <div className="min-h-[6.6rem] px-3 pb-4 pt-[1rem] xl:min-h-[12.85rem] xl:px-6 xl:pb-9 xl:pt-[1.75rem]">
                <p className="mb-[0.65rem] font-bdo text-[0.95rem] font-medium leading-none tracking-[-0.04em] text-white/70 xl:mb-[1.15rem] xl:text-[1.55rem]">
                    Daftar Harga
                </p>
                <div className="grid grid-cols-2 gap-x-[2.8rem] xl:gap-x-[4.2rem]">
                    <div className="flex flex-col gap-[0.46rem] xl:gap-[0.83rem]">
                        {item.daftarHarga.left.map((entry, i) => (
                            <span
                                key={i}
                                className="whitespace-pre-line font-bdo text-[0.55rem] font-medium leading-none tracking-[-0.025em] text-white xl:text-[1rem]"
                            >
                                + {entry.label}
                            </span>
                        ))}
                    </div>
                    <div className="flex flex-col gap-[0.46rem] xl:gap-[0.83rem]">
                        {item.daftarHarga.right.map((entry, i) => (
                            <span
                                key={i}
                                className="whitespace-pre-line font-bdo text-[0.55rem] font-medium leading-none tracking-[-0.025em] text-white xl:text-[1rem]"
                            >
                                + {entry.label}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            <div className="min-h-[6.45rem] border-t border-white/20 px-3 pb-4 pt-[1rem] xl:min-h-[13.2rem] xl:px-6 xl:pb-9 xl:pt-[1.95rem]">
                <p className="mb-[0.7rem] font-bdo text-[0.95rem] font-medium leading-none tracking-[-0.04em] text-white/70 xl:mb-[1.35rem] xl:text-[1.55rem]">
                    Persewaan
                </p>
                <div className="grid grid-cols-2 gap-x-[2.8rem] xl:gap-x-[4.2rem]">
                    <div className="flex flex-col gap-[0.46rem] xl:gap-[0.83rem]">
                        {item.persewaan.left.map((entry, i) => (
                            <span
                                key={i}
                                className="whitespace-pre-line font-bdo text-[0.55rem] font-medium leading-[1.18] tracking-[-0.025em] text-white xl:text-[1rem] xl:leading-[1.2]"
                            >
                                + {entry.label}
                            </span>
                        ))}
                    </div>
                    <div className="flex flex-col gap-[0.46rem] xl:gap-[0.83rem]">
                        {item.persewaan.right.map((entry, i) => (
                            <span
                                key={i}
                                className="whitespace-pre-line font-bdo text-[0.55rem] font-medium leading-[1.18] tracking-[-0.025em] text-white xl:text-[1rem] xl:leading-[1.2]"
                            >
                                + {entry.label}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
