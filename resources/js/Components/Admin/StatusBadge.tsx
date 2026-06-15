import { cn } from "@/lib/utils";
import type { IdentityStatus } from "@/types";

const IDENTITY_STATUS_MAP: Record<
    IdentityStatus,
    { label: string; classes: string }
> = {
    unverified: {
        label: "Unverified",
        classes: "bg-gray-100 text-gray-600",
    },
    pending: {
        label: "Pending",
        classes: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
    },
    verified: {
        label: "Verified",
        classes: "bg-green-50 text-green-700 ring-1 ring-inset ring-green-200",
    },
    rejected: {
        label: "Rejected",
        classes: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
    },
};

interface IdentityStatusBadgeProps {
    status: IdentityStatus;
    className?: string;
}

export function IdentityStatusBadge({
    status,
    className,
}: IdentityStatusBadgeProps) {
    const { label, classes } = IDENTITY_STATUS_MAP[status];
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide",
                classes,
                className,
            )}
        >
            {label}
        </span>
    );
}

interface ActiveBadgeProps {
    active: boolean;
    className?: string;
}

export function ActiveBadge({ active, className }: ActiveBadgeProps) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide",
                active
                    ? "bg-green-50 text-green-700 ring-1 ring-inset ring-green-200"
                    : "bg-gray-100 text-gray-500",
                className,
            )}
        >
            {active ? "Active" : "Inactive"}
        </span>
    );
}
