export default function HeroTitle() {
    return (
        <div className="ubsc-hero-title-wrap pointer-events-none w-full max-w-full select-none px-0 md:px-0">
            <div className="mb-4 flex items-center gap-2 lg:mb-4">
                <span className="ubsc-hero-year font-bdo text-xs font-medium text-red-600 sm:text-sm lg:text-xl">
                    &copy; <span className="font-medium text-white">2026</span>
                </span>
            </div>

            <h1 className="ubsc-hero-title max-w-full break-words font-archivo text-[clamp(3.7rem,14vw,4.5rem)] font-bold uppercase leading-[0.78] tracking-[-0.06em] text-white md:text-[clamp(4.5rem,10vw,7rem)] lg:text-[clamp(6rem,8vw,8.5rem)] xl:text-[clamp(7.44rem,8.37vw,10.695rem)]">
                <span className="ubsc-hero-title-row block">
                    <span className="ubsc-hero-title-word" data-text="SPORT">
                        <span className="ubsc-hero-title-ink">SPORT</span>
                    </span>
                </span>

                <span className="ubsc-hero-title-row mb-5 flex flex-wrap items-baseline gap-x-[0.16em]">
                    <span className="ubsc-hero-title-word" data-text="CENTER">
                        <span className="ubsc-hero-title-ink">CENTER</span>
                    </span>
                    <span
                        className="ubsc-hero-title-word ubsc-hero-title-word--ub inline-flex items-baseline"
                        data-text="UB"
                    >
                        <span className="ubsc-hero-title-ink">UB</span>
                        <span
                            aria-hidden="true"
                            className="ubsc-hero-title-dot ml-2 inline-block h-[clamp(10px,2vw,14px)] w-[clamp(10px,2vw,14px)] bg-accent-red md:h-[18px] md:w-[18px] lg:h-[22px] lg:w-[22px] xl:ml-3 xl:h-[28px] xl:w-[28px]"
                        />
                    </span>
                </span>
            </h1>
        </div>
    );
}
