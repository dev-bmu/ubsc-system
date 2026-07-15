import { motion } from "framer-motion";

const DIVIDER_EASE = [0.16, 1, 0.3, 1] as const;

const dividerContainerMotion = {
    hidden: {},
    visible: {
        transition: {
            delayChildren: 0.28,
            staggerChildren: 0.16,
        },
    },
};

const dividerLineMotion = {
    hidden: { scaleX: 0, opacity: 0.2 },
    visible: {
        scaleX: 1,
        opacity: 1,
        transition: { duration: 1.55, ease: DIVIDER_EASE },
    },
};

const dividerItemMotion = {
    hidden: { opacity: 0, y: 16 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 1.05, ease: DIVIDER_EASE },
    },
};

interface SectionDividerProps {
    number: string;
    title: string;
    subtitle: string;
    theme?: "light" | "dark";
    outerClassName?: string;
    contentClassName?: string;
    size?: "default" | "compact";
    titlePlacement?: "center" | "right";
    animated?: boolean;
    viewportReveal?: boolean;
}

export default function SectionDivider({
    number,
    title,
    subtitle,
    theme = "light",
    outerClassName = "",
    contentClassName = "",
    size = "compact",
    titlePlacement = "right",
    animated = true,
    viewportReveal = true,
}: SectionDividerProps) {
    const isDark = theme === "dark";
    const isCompact = size === "compact";
    const [subtitleNumber, ...subtitleWords] = subtitle.split(" ");
    const subtitleLabel = subtitleWords.join(" ");
    const rootPadding = isCompact ? "pt-4" : "pt-5";
    const textSize = isCompact
        ? "text-[8.8px] sm:text-[10.4px] xl:text-[12.8px]"
        : "text-[11px] sm:text-[13px] xl:text-[16px]";
    const dotSize = isCompact ? "h-[5px] w-[5px]" : "h-1.5 w-1.5";
    const numberGap = isCompact ? "gap-2.5" : "gap-3";
    const isRightTitle = titlePlacement === "right";

    return (
        <motion.div
            className={`relative ${rootPadding} ${outerClassName}`}
            variants={dividerContainerMotion}
            initial={viewportReveal ? "hidden" : false}
            animate={viewportReveal ? undefined : "visible"}
            whileInView={viewportReveal ? "visible" : undefined}
            viewport={
                viewportReveal
                    ? { once: true, amount: 0.35, margin: "0px 0px -6% 0px" }
                    : undefined
            }
        >
            <motion.span
                aria-hidden="true"
                variants={dividerLineMotion}
                className={`absolute inset-x-0 top-0 h-px origin-left ${
                    isDark ? "bg-white/20" : "bg-black/55"
                }`}
            />

            <motion.div
                className={`grid ${
                    isRightTitle
                        ? "grid-cols-[auto_1fr] md:grid-cols-[1fr_auto_1fr]"
                        : "grid-cols-[1fr_auto_1fr]"
                } items-center ${textSize} ${
                    isDark ? "text-white" : "text-black"
                } ${contentClassName}`}
            >
                <motion.span
                    variants={dividerItemMotion}
                    className={`flex items-center ${numberGap} font-bdo font-light`}
                >
                    {animated ? (
                        <motion.span
                            className={`${dotSize} flex-shrink-0 rounded-full bg-[#ff0000]`}
                            animate={{
                                scale: [1, 1.7, 1],
                                boxShadow: [
                                    "0 0 0px 0px rgba(220,38,38,0)",
                                    "0 0 6px 3px rgba(220,38,38,0.35)",
                                    "0 0 0px 0px rgba(220,38,38,0)",
                                ],
                            }}
                            transition={{
                                duration: 2.2,
                                repeat: Infinity,
                                ease: "easeInOut",
                            }}
                        />
                    ) : (
                        <span
                            className={`${dotSize} flex-shrink-0 rounded-full bg-[#ff0000]`}
                        />
                    )}
                    <span>{`(${number})`}</span>
                </motion.span>
                {isRightTitle ? (
                    <>
                        <motion.span
                            variants={dividerItemMotion}
                            className="justify-self-end font-bdo font-medium md:justify-self-center"
                        >
                            {`(${title})`}
                        </motion.span>
                        <motion.span
                            variants={dividerItemMotion}
                            className="hidden justify-self-end font-bdo md:inline-flex"
                        >
                            <span className="font-thin">{`/${subtitleNumber}`}</span>
                            {subtitleLabel && (
                                <span className="ml-1 font-medium">
                                    {subtitleLabel}
                                </span>
                            )}
                        </motion.span>
                    </>
                ) : (
                    <>
                        <motion.span
                            variants={dividerItemMotion}
                            className="font-bdo font-medium"
                        >
                            {`(${title})`}
                        </motion.span>
                        <motion.span
                            variants={dividerItemMotion}
                            className="hidden justify-self-end font-bdo md:inline-flex"
                        >
                            <span className="font-thin">{`/${subtitleNumber}`}</span>
                            {subtitleLabel && (
                                <span className="ml-1 font-medium">
                                    {subtitleLabel}
                                </span>
                            )}
                        </motion.span>
                    </>
                )}
            </motion.div>
        </motion.div>
    );
}
