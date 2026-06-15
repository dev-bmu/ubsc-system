import { PropsWithChildren } from "react";

interface SidebarGroupProps {
    label: string;
}

export default function SidebarGroup({
    label,
    children,
}: PropsWithChildren<SidebarGroupProps>) {
    return (
        <div className="flex flex-col gap-1">
            <span className="px-4 pb-1 pt-3 font-clash text-[11px] font-medium uppercase tracking-[0.18em] text-gray-400">
                {label}
            </span>
            {children}
        </div>
    );
}
