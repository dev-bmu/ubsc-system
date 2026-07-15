import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";

interface FacilitySectionLabelProps {
    children: string;
    className?: string;
    tone?: "light" | "dark";
}

export default function FacilitySectionLabel({
    children,
    className = "",
    tone = "light",
}: FacilitySectionLabelProps) {
    return (
        <div
            className={`${className} flex min-w-0 items-center gap-4 xl:gap-3`}
        >
            <span className="section-label-diamond" />
            <ScrollTextReveal
                delay={70}
                stagger={18}
                amount={0.15}
                className={`font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em] xl:text-[1.25rem] ${
                    tone === "dark" ? "text-white" : "text-black"
                }`}
            >
                {children}
            </ScrollTextReveal>
        </div>
    );
}
