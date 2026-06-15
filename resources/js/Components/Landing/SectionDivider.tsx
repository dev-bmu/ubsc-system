import { motion } from "framer-motion";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";

interface SectionDividerProps {
    number: string;
    title: string;
    subtitle: string;
    theme?: "light" | "dark";
    outerClassName?: string;
    contentClassName?: string;
    size?: "default" | "compact";
    titlePlacement?: "center" | "right";
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
        <div
            className={`border-t ${rootPadding} ${
                isDark ? "border-white/20" : "border-black/55"
            } ${outerClassName}`}
        >
            <div
                className={`grid ${
                    isRightTitle
                        ? "grid-cols-[auto_1fr] md:grid-cols-[1fr_auto_1fr]"
                        : "grid-cols-[1fr_auto_1fr]"
                } items-center ${textSize} ${
                    isDark ? "text-white" : "text-black"
                } ${contentClassName}`}
            >
                <span className={`flex items-center ${numberGap} font-bdo font-light`}>
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
                    <ScrollTextReveal delay={20}>
                        {`(${number})`}
                    </ScrollTextReveal>
                </span>
                {isRightTitle ? (
                    <>
                        <span className="justify-self-end font-bdo font-medium md:justify-self-center">
                            <ScrollTextReveal delay={70}>
                                {`(${title})`}
                            </ScrollTextReveal>
                        </span>
                        <span className="hidden justify-self-end font-bdo md:inline-flex">
                            <ScrollTextReveal delay={120} className="font-thin">
                                {`/${subtitleNumber}`}
                            </ScrollTextReveal>
                            {subtitleLabel && (
                                <ScrollTextReveal delay={150} className="ml-1 font-medium">
                                    {subtitleLabel}
                                </ScrollTextReveal>
                            )}
                        </span>
                    </>
                ) : (
                    <>
                        <span className="font-bdo font-medium">
                            <ScrollTextReveal delay={70}>
                                {`(${title})`}
                            </ScrollTextReveal>
                        </span>
                        <span className="hidden justify-self-end font-bdo md:inline-flex">
                            <ScrollTextReveal delay={120} className="font-thin">
                                {`/${subtitleNumber}`}
                            </ScrollTextReveal>
                            {subtitleLabel && (
                                <ScrollTextReveal delay={150} className="ml-1 font-medium">
                                    {subtitleLabel}
                                </ScrollTextReveal>
                            )}
                        </span>
                    </>
                )}
            </div>
        </div>
    );
}
