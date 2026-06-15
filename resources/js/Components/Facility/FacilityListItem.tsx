import FacilityBadge from "@/Components/Landing/FacilityBadge";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";

export interface FacilityItem {
    id: string;
    title: string;
    code: string;
    image: string;
    badgeLocation: string;
    badgeType: string;
}

interface Props {
    item: FacilityItem;
    revealDelay?: number;
}

function formatCode(code: string): string {
    return `/${code.replace(/^\/+|\/+$/g, "")}/`;
}

export default function FacilityListItem({ item, revealDelay = 0 }: Props) {
    const formattedCode = formatCode(item.code);

    return (
        <div className="group grid w-full cursor-pointer grid-cols-[86px_minmax(0,1fr)] border-b border-white/20 transition-colors hover:bg-white/[0.025] xl:grid-cols-[minmax(360px,496px)_minmax(0,1fr)_190px] xl:items-start xl:gap-x-[clamp(2rem,3.6vw,4.25rem)] xl:py-1">
            <div className="relative aspect-[86/148] w-[86px] overflow-hidden rounded-[5px] xl:aspect-[496/220] xl:w-full">
                <img
                    src={item.image}
                    alt={item.title}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.025]"
                />
                <div className="absolute bottom-4 left-9 hidden xl:block">
                    <FacilityBadge
                        location={item.badgeLocation}
                        category={item.badgeType}
                    />
                </div>
            </div>

            <div className="flex min-w-0 flex-col justify-between py-4 pl-5 xl:min-h-[220px] xl:justify-start xl:p-0 xl:pt-10">
                <div className="flex min-w-0 flex-col items-start gap-1.5 xl:block">
                    <ScrollTextReveal
                        delay={80 + revealDelay}
                        className="-mb-[0.16em] pb-[0.16em] font-bdo text-[1.2rem] font-normal leading-[1.05] tracking-[-0.04em] text-white xl:text-[2rem]"
                    >
                        {item.title}
                    </ScrollTextReveal>
                    <span className="shrink-0 whitespace-nowrap xl:hidden">
                        <ScrollTextReveal
                            delay={130 + revealDelay}
                            className="font-bdo text-[11px] font-normal leading-none text-white/55"
                        >
                            {formattedCode}
                        </ScrollTextReveal>
                    </span>
                </div>

                <div className="mt-auto xl:hidden">
                    <FacilityBadge
                        location={item.badgeLocation}
                        category={item.badgeType}
                    />
                </div>
            </div>

            <span className="hidden pt-10 text-right xl:block">
                <ScrollTextReveal
                    delay={140 + revealDelay}
                    className="font-bdo text-lg font-normal text-white/55"
                >
                    {formattedCode}
                </ScrollTextReveal>
            </span>
        </div>
    );
}
