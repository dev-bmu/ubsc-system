import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, X } from "lucide-react";

interface AccordionItemProps {
    number: string;
    title: string;
    badgeText: string;
    bigNumber: string;
    bigNumberLabel: string;
    innerHeading: string;
    redLabel: string;
    description: string;
    image: string;
    initialIsOpen?: boolean;
}

const EASE = [0.76, 0, 0.24, 1] as const;

export default function AccordionItem({
    number,
    title,
    badgeText,
    bigNumber,
    bigNumberLabel,
    innerHeading,
    redLabel,
    description,
    image,
    initialIsOpen = false,
}: AccordionItemProps) {
    const [isOpen, setIsOpen] = useState(initialIsOpen);

    return (
        <div className="w-full border-b border-black/10">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex w-full items-center justify-between py-6 xl:py-8 cursor-pointer"
                aria-expanded={isOpen}
            >
                <div className="flex items-center gap-8 xl:gap-12 text-left">
                    <span className="font-bdo font-medium text-[28px] text-black leading-none flex-shrink-0 w-10">
                        {number}
                    </span>
                    <span className="font-bdo font-light text-[clamp(1.25rem,2.5vw,2.75rem)] text-black leading-tight">
                        {title}
                    </span>
                </div>

                <div
                    className={`ml-6 flex h-9 w-9 xl:h-11 xl:w-11 flex-shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${
                        isOpen ? "bg-[#ff0000]" : "bg-black"
                    }`}
                >
                    <AnimatePresence mode="wait" initial={false}>
                        {isOpen ? (
                            <motion.span
                                key="x"
                                initial={{
                                    opacity: 0,
                                    rotate: -90,
                                    scale: 0.7,
                                }}
                                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                                exit={{ opacity: 0, rotate: 90, scale: 0.7 }}
                                transition={{ duration: 0.18, ease: EASE }}
                                className="flex"
                            >
                                <X
                                    size={16}
                                    className="text-white"
                                    strokeWidth={2.5}
                                />
                            </motion.span>
                        ) : (
                            <motion.span
                                key="chevron"
                                initial={{ opacity: 0, rotate: 90, scale: 0.7 }}
                                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                                exit={{ opacity: 0, rotate: -90, scale: 0.7 }}
                                transition={{ duration: 0.18, ease: EASE }}
                                className="flex"
                            >
                                <ChevronDown
                                    size={16}
                                    className="text-white"
                                    strokeWidth={2.5}
                                />
                            </motion.span>
                        )}
                    </AnimatePresence>
                </div>
            </button>

            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        key="body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.45, ease: EASE }}
                        className="overflow-hidden"
                    >
                        <div className="pb-12">
                            <div className="w-full overflow-hidden rounded-[15px]">
                                <img
                                    src={image}
                                    alt={title}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                />
                            </div>

                            <div className="mt-8 grid grid-cols-1 gap-8 items-stretch xl:grid-cols-12">
                                <div className="flex flex-row items-center justify-between xl:col-span-3 xl:flex-col xl:items-start xl:justify-between">
                                    <div className="inline-flex items-center rounded-full bg-black px-5 py-2.5">
                                        <span className="font-bdo font-medium text-sm text-white whitespace-nowrap">
                                            {badgeText}
                                        </span>
                                    </div>

                                    <div className="flex flex-col xl:mt-auto">
                                        <span className="font-bdo font-medium text-[clamp(3rem,6vw,5rem)] text-[#ff0000] leading-none">
                                            {bigNumber}
                                        </span>
                                        <span className="font-bdo font-regular text-md text-black tracking-widest mt-1">
                                            {bigNumberLabel}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-6 xl:col-span-9">
                                    <h3 className="font-bdo font-medium text-[clamp(1.5rem,3vw,3.25rem)] text-black leading-tight">
                                        {innerHeading}
                                    </h3>

                                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                                        <div className="xl:col-span-3">
                                            <span className="font-bdo text-base text-[#ff0000]">
                                                {redLabel}
                                            </span>
                                        </div>
                                        <div className="xl:col-span-9">
                                            <p className="font-bdo font-normal text-[clamp(1rem,1.04vw,20px)] leading-relaxed text-black">
                                                {description}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
