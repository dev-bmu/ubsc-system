import { Link } from "@inertiajs/react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ADMIN_TOKENS } from "./tokens";

interface SidebarNavLinkProps {
    icon: LucideIcon;
    label: string;
    href?: string;
    method?: "get" | "post" | "put" | "patch" | "delete";
    as?: "a" | "button";
    active?: boolean;
    disabled?: boolean;
    badge?: string;
    onClick?: () => void;
}

export default function SidebarNavLink({
    icon: Icon,
    label,
    href,
    method = "get",
    as = "a",
    active = false,
    disabled = false,
    badge,
    onClick,
}: SidebarNavLinkProps) {
    const base =
        "group flex w-full items-center gap-3 px-4 py-3 text-sm font-medium font-clash transition-colors duration-150";
    const state = active
        ? ADMIN_TOKENS.PILL_ACTIVE
        : disabled
          ? "text-gray-400 cursor-not-allowed rounded-2xl"
          : ADMIN_TOKENS.PILL_INACTIVE;

    const inner = (
        <>
            <Icon
                size={18}
                strokeWidth={2}
                className={cn(
                    "shrink-0",
                    active ? "text-white" : "text-gray-500",
                )}
            />
            <span className="flex-1 text-left">{label}</span>
            {badge && (
                <span
                    className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        active
                            ? "bg-white/15 text-white"
                            : "bg-gray-100 text-gray-500",
                    )}
                >
                    {badge}
                </span>
            )}
        </>
    );

    if (disabled || !href) {
        return (
            <button
                type="button"
                disabled={disabled}
                onClick={onClick}
                className={cn(base, state)}
            >
                {inner}
            </button>
        );
    }

    return (
        <Link
            href={href}
            method={method}
            as={as === "button" ? "button" : undefined}
            className={cn(base, state)}
        >
            {inner}
        </Link>
    );
}
