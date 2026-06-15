import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
    icon: LucideIcon;
    label: string;
    value: string | number;
    caption?: string;
    gradient: string;
    badge?: string;
}

export default function StatCard({
    icon: Icon,
    label,
    value,
    caption,
    gradient,
    badge,
}: StatCardProps) {
    return (
        <div
            className={cn(
                "relative overflow-hidden rounded-3xl p-5 text-white shadow-[0_12px_40px_rgb(0,0,0,0.10)]",
                gradient,
            )}
        >
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/15 blur-2xl"
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_55%)]"
            />

            <div className="relative flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-inset ring-white/20 backdrop-blur-sm">
                    <Icon size={18} className="text-white" />
                </div>
                {badge && (
                    <span className="rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ring-white/25">
                        {badge}
                    </span>
                )}
            </div>

            <div className="relative mt-10">
                <div className="font-clash text-sm font-medium text-white/85">
                    {label}
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-archivo text-4xl font-normal leading-none tracking-tight">
                        {value}
                    </span>
                </div>
                {caption && (
                    <div className="mt-3 text-xs text-white/80">{caption}</div>
                )}
            </div>
        </div>
    );
}
