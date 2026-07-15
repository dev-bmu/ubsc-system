import { motion } from "framer-motion";
import FacilityBadge from "@/Components/Landing/FacilityBadge";

export interface ClassAccordionData {
    id: string;
    title: string;
    image: string;
    badgeLocation: string;
    badgeType: string;
    classCode: string;
    pricingDetails: { label: string }[];
}

interface Props {
    item: ClassAccordionData;
    isOpen: boolean;
    onToggle: () => void;
}

const XIcon = () => (
    <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
    >
        <path d="M18 6L6 18M6 6l12 12" />
    </svg>
);

const ChevronDown = () => (
    <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M6 9l6 6 6-6" />
    </svg>
);

function AccordionBodyImage({
    image,
    alt,
    className = "",
}: {
    image: string;
    alt: string;
    className?: string;
}) {
    return (
        <div
            className={`flex-shrink-0 overflow-hidden rounded-[5px] border-[4px] border-white bg-white ${className}`}
        >
            <img
                src={image}
                alt={alt}
                className="h-[4.65rem] w-full rounded-[2px] object-cover xl:aspect-[309/160] xl:h-auto"
            />
            <div className="flex items-center justify-between px-[0.38rem] py-[0.32rem] xl:px-3 xl:py-[0.75rem]">
                <span className="font-bdo text-[0.42rem] font-semibold leading-none text-black xl:text-[0.72rem] xl:font-medium">
                    UBSC
                </span>
                <span className="font-bdo text-[0.4rem] font-medium leading-none text-black/55 xl:text-[0.72rem]">
                    Sport Center
                </span>
            </div>
        </div>
    );
}

export default function PricingAccordionItem({
    item,
    isOpen,
    onToggle,
}: Props) {
    const titleText = item.title.startsWith("/")
        ? item.title.replace("/", "/ ")
        : item.title;

    return (
        <div>
            <button
                onClick={onToggle}
                className={`group grid w-full grid-cols-[3.5rem_minmax(0,1fr)_2.75rem] items-center text-left xl:grid-cols-[10.35rem_minmax(0,1fr)_4rem] ${
                    isOpen
                        ? "pb-[1.35rem] pt-[2.25rem] xl:pb-[2.25rem] xl:pt-[3.25rem]"
                        : "border-b border-white/35 py-[1.65rem] xl:py-[3.45rem]"
                }`}
            >
                <div className="contents">
                    <span className="font-bdo text-[0.98rem] font-medium leading-none tracking-[-0.035em] text-white xl:text-[1.75rem]">
                        {item.id}
                    </span>
                    <span className="font-bdo text-[1.35rem] font-medium leading-none tracking-[-0.055em] text-white transition-colors xl:text-[2.7rem]">
                        {titleText}
                    </span>
                </div>
                <div
                    className={`flex size-[2.15rem] flex-shrink-0 items-center justify-center justify-self-end rounded-full transition-colors xl:size-[3.95rem] ${
                        isOpen
                            ? "bg-[#FF0000] text-white"
                            : "bg-white text-black group-hover:bg-white/90"
                    }`}
                >
                    {isOpen ? <XIcon /> : <ChevronDown />}
                </div>
            </button>

            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                >
                    <div className="flex flex-col border-b border-white/35 pb-[1.75rem] pt-0 xl:hidden">
                        <FacilityBadge
                            location={item.badgeLocation}
                            category={item.badgeType}
                            variant="blue-red"
                        />
                        <div className="mt-8 flex w-full flex-row items-start gap-7">
                            <AccordionBodyImage
                                image={item.image}
                                alt={item.title}
                                className="w-[9.75rem]"
                            />
                            <div className="flex flex-col gap-3 pt-0.5">
                                {item.pricingDetails.map((detail, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center gap-2"
                                    >
                                        <div className="size-1.5 flex-shrink-0 rounded-full bg-white/60" />
                                        <span className="whitespace-nowrap font-bdo text-[0.73rem] font-semibold tracking-[-0.02em] text-white">
                                            {detail.label}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="hidden border-b border-white/35 pb-[4.65rem] xl:block">
                        <div className="grid grid-cols-[15.85rem_minmax(0,1fr)_11rem]">
                            <div>
                                <FacilityBadge
                                    location={item.badgeLocation}
                                    category={item.badgeType}
                                    variant="red"
                                />
                            </div>
                            <div />
                        </div>
                        <div className="mt-[1.5rem] grid grid-cols-[15.85rem_minmax(0,1fr)_11rem] items-start gap-x-[6.95rem]">
                            <AccordionBodyImage
                                image={item.image}
                                alt={item.title}
                                className="w-[15.85rem]"
                            />
                            <div className="flex min-w-[21rem] flex-col gap-[2rem] pt-[0.25rem]">
                                {item.pricingDetails.map((detail, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center gap-3"
                                    >
                                        <div className="size-1.5 flex-shrink-0 rounded-full bg-white" />
                                        <span className="whitespace-nowrap font-bdo text-[1.55rem] font-semibold leading-none tracking-[-0.025em] text-white">
                                            {detail.label}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <p className="pt-[0.35rem] text-right font-bdo text-[1.22rem] font-normal leading-none tracking-[-0.02em] text-white">
                                {item.classCode}
                            </p>
                        </div>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
