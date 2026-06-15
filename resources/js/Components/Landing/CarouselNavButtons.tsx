import { ChevronLeft, ChevronRight } from "lucide-react";

interface CarouselNavButtonsProps {
    onPrevious: () => void;
    onNext: () => void;
    theme?: "dark" | "light";
    previousLabel: string;
    nextLabel: string;
}

export default function CarouselNavButtons({
    onPrevious,
    onNext,
    theme = "dark",
    previousLabel,
    nextLabel,
}: CarouselNavButtonsProps) {
    const previousStyle =
        theme === "dark"
            ? "border-white text-white hover:bg-white hover:text-black"
            : "border-black text-black hover:bg-black hover:text-white";
    const nextStyle =
        theme === "dark"
            ? "bg-white text-black hover:bg-white/85"
            : "bg-black text-white hover:bg-black/80";

    return (
        <div className="flex shrink-0 gap-3 xl:translate-x-[7px] xl:gap-[20px]">
            <button
                type="button"
                onClick={onPrevious}
                aria-label={previousLabel}
                className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border transition sm:h-12 sm:w-12 xl:h-[60px] xl:w-[60px] ${previousStyle}`}
            >
                <ChevronLeft
                    className="h-3.5 w-3.5 sm:h-6 sm:w-6"
                    strokeWidth={2}
                />
            </button>
            <button
                type="button"
                onClick={onNext}
                aria-label={nextLabel}
                className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition sm:h-12 sm:w-12 xl:h-[60px] xl:w-[60px] ${nextStyle}`}
            >
                <ChevronRight
                    className="h-3.5 w-3.5 sm:h-6 sm:w-6"
                    strokeWidth={2}
                />
            </button>
        </div>
    );
}
