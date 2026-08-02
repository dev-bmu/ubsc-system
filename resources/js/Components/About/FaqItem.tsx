import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useHomepageEntranceReady } from "@/Components/Landing/HomepageEntranceContext";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";

interface FaqItemProps {
    number: string;
    question: string;
    answer: string;
    isOpen: boolean;
    onToggle: () => void;
    revealDelay?: number;
}

const EASE = [0.16, 1, 0.3, 1] as const;

export default function FaqItem({
    number,
    question,
    answer,
    isOpen,
    onToggle,
    revealDelay = 120,
}: FaqItemProps) {
    const entranceReady = useHomepageEntranceReady();

    return (
        <motion.div
            className="border-b border-black/22"
            initial={{ opacity: 0, y: 18 }}
            whileInView={
                entranceReady ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }
            }
            viewport={{ once: true, amount: 0.24 }}
            transition={{
                duration: 0.58,
                delay: revealDelay / 1000,
                ease: EASE,
            }}
        >
            <button
                type="button"
                onClick={onToggle}
                className="grid w-full cursor-pointer grid-cols-[2.65rem_minmax(0,1fr)_1.85rem] items-start gap-5 py-7 text-left sm:grid-cols-[3.65rem_minmax(0,1fr)_2.15rem] sm:gap-7 lg:grid-cols-[3.7rem_minmax(0,1fr)_2.35rem] lg:gap-[1.7rem] lg:py-[2.82rem] xl:grid-cols-[3.7rem_minmax(0,1fr)_2.4rem] xl:gap-[1.7rem]"
                aria-expanded={isOpen}
            >
                <span className="font-bdo text-[clamp(0.96rem,1.27vw,1.58rem)] font-light leading-none tracking-[-0.02em] text-black">
                    {number}
                </span>
                <span className="font-bdo text-[clamp(1.08rem,2.2vw,1.62rem)] font-semibold leading-[1.08] tracking-[-0.026em] text-black lg:text-[clamp(1.28rem,1.42vw,1.7rem)]">
                    {question}
                </span>

                <motion.div
                    animate={{ rotate: isOpen ? 45 : 0 }}
                    transition={{ duration: 0.34, ease: EASE }}
                    className="flex justify-end text-black"
                >
                    <Plus
                        className="h-6 w-6 sm:h-7 sm:w-7 lg:h-[30px] lg:w-[30px]"
                        strokeWidth={1.5}
                    />
                </motion.div>
            </button>

            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        key="answer"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{
                            height: "auto",
                            opacity: 1,
                            transition: {
                                height: { duration: 0.54, ease: EASE },
                                opacity: {
                                    duration: 0.2,
                                    delay: 0.1,
                                    ease: EASE,
                                },
                            },
                        }}
                        exit={{
                            height: 0,
                            opacity: 0,
                            transition: {
                                height: { duration: 0.36, ease: EASE },
                                opacity: { duration: 0.12, ease: EASE },
                            },
                        }}
                        className="overflow-hidden"
                    >
                        <ScrollTextReveal
                            as="p"
                            split="words"
                            stagger={10}
                            delay={40}
                            amount={0.01}
                            triggerOnMount
                            className="about-vision-text-safe pb-7 pl-[calc(2.65rem+1.25rem)] font-bdo text-[clamp(0.9rem,0.96vw,1.06rem)] font-normal leading-[1.45] text-black/38 sm:pl-[calc(3.65rem+1.75rem)] lg:pb-10 lg:pl-[calc(3.7rem+1.7rem)]"
                        >
                            {answer}
                        </ScrollTextReveal>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
