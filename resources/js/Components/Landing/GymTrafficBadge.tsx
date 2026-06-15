import { usePage } from "@inertiajs/react";
import gym from "../../../assets/hero/gym.svg";
import type { PageProps } from "@/types";

interface GymTrafficBadgeProps {
    variant?: "default" | "reversed";
    stretch?: boolean;
    size?: "default" | "compact";
    animate?: boolean;
    disableHover?: boolean;
    className?: string;
}

type StatusType =
    | "High Occupancy"
    | "Medium Occupancy"
    | "Low Occupancy"
    | "We Are Close";

function getStatusStyles(status: StatusType) {
    switch (status) {
        case "High Occupancy":
            return {
                bg: "from-red-600 via-red-500 to-red-700",
                glow: "shadow-[0_0_40px_rgba(239,68,68,0.6)]",
            };
        case "Medium Occupancy":
            return {
                bg: "from-yellow-400 via-orange-400 to-orange-500",
                glow: "shadow-[0_0_40px_rgba(251,146,60,0.6)]",
            };
        case "We Are Close":
            return {
                bg: "from-[#15678D] to-[#153359]",
                glow: "shadow-[0_0_40px_rgba(59,130,246,0.6)]",
            };
        case "Low Occupancy":
        default:
            return {
                bg: "from-green-500 via-emerald-500 to-green-600",
                glow: "shadow-[0_0_40px_rgba(34,197,94,0.6)]",
            };
    }
}

export default function GymTrafficBadge({
    variant = "default",
    stretch = false,
    size = "default",
    animate = false,
    disableHover = false,
    className = "",
}: GymTrafficBadgeProps) {
    const raw = usePage<PageProps>().props.gym_traffic ?? "Low Occupancy";
    const status = raw as StatusType;
    const styles = getStatusStyles(status);
    const isCompact = size === "compact";
    const badgeShell = isCompact
        ? "rounded-[7px] bg-black p-[3px]"
        : "rounded-lg bg-black p-1";
    const motionClasses = `${animate ? "gym-traffic-badge--animated" : ""} ${
        disableHover ? "gym-traffic-badge--no-hover" : ""
    }`;
    const labelTextSize = isCompact
        ? "text-[clamp(0.72rem,0.66vw,13px)]"
        : "text-[clamp(0.875rem,0.83vw,16px)]";

    const shimmer = (
        <div className="gym-traffic-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
    );

    const glow = (
        <div className={`gym-traffic-glow absolute inset-0 ${styles.glow}`} />
    );

    const statusContent = (
        <span className={`relative whitespace-nowrap font-clash ${labelTextSize} font-bold text-white`}>
            {status}
        </span>
    );

    const statusStretched = (
        <div
            key={status}
            className={`gym-traffic-status absolute inset-0 flex items-center overflow-hidden bg-gradient-to-r ${styles.bg} ${
                isCompact ? "px-4" : "px-5"
            }`}
        >
            {glow}
            {shimmer}
            {statusContent}
        </div>
    );

    const statusFlow = (
        <div
            key={status}
            className={`gym-traffic-status relative flex items-center overflow-hidden bg-gradient-to-r ${styles.bg} ${
                isCompact
                    ? "px-4 py-2.5 md:px-6 md:py-4 xl:px-8 xl:py-2.5"
                    : "px-5 py-3 md:px-8 md:py-5 xl:px-10 xl:py-3"
            }`}
        >
            {glow}
            {shimmer}
            {statusContent}
        </div>
    );

    const darkLabel = (
        <div
            className={`flex items-center bg-black ${
                isCompact
                    ? "gap-1.5 px-4 py-2.5 md:px-6 md:py-4 xl:px-8 xl:py-4"
                    : "gap-2 px-5 py-3 md:px-8 md:py-5 xl:px-10 xl:py-5"
            }`}
        >
            <img
                src={gym}
                alt="Gym Traffic"
                className={`gym-traffic-spin text-white/70 ${
                    isCompact ? "h-3.5 w-3.5 xl:h-[13px] xl:w-[13px]" : "h-4 w-4"
                }`}
            />
            <span className={`whitespace-nowrap font-bdo ${labelTextSize} font-medium text-white/90`}>
                Gym Traffic
            </span>
        </div>
    );

    const lightLabel = (
        <div
            className={`flex items-center bg-gray-200 ${
                isCompact
                    ? "gap-1.5 px-4 py-3 md:px-6 md:py-4 xl:px-9 xl:py-2.5"
                    : "gap-2 px-5 py-4 md:px-8 md:py-5 xl:px-12 xl:py-3"
            }`}
        >
            <img
                src={gym}
                alt="Gym Traffic"
                className={`gym-traffic-spin opacity-70 ${
                    isCompact ? "h-3.5 w-3.5 xl:h-[13px] xl:w-[13px]" : "h-4 w-4"
                }`}
            />
            <span className={`whitespace-nowrap font-clash ${labelTextSize} font-medium text-black`}>
                Gym Traffic
            </span>
        </div>
    );

    if (variant === "reversed") {
        return (
            <div className={`gym-traffic-badge ${motionClasses} mt-5 flex items-stretch overflow-hidden perspective-[1000px] xl:mt-0 ${badgeShell} ${className}`}>
                {stretch ? (
                    <div className="relative flex-1 overflow-hidden">
                        {statusStretched}
                    </div>
                ) : (
                    statusFlow
                )}

                {lightLabel}
            </div>
        );
    }

    return (
        <div
            className={`gym-traffic-badge ${motionClasses} mt-8 items-stretch overflow-hidden perspective-[1000px] md:mt-16 xl:mt-0 ${badgeShell} ${
                stretch ? "flex" : "inline-flex"
            } ${className}`}
        >
            {darkLabel}

            {stretch ? (
                <div className="relative flex-1 overflow-hidden">
                    {statusStretched}
                </div>
            ) : (
                statusFlow
            )}
        </div>
    );
}
