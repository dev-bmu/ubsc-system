import { X } from "lucide-react";
import { type PropsWithChildren, type ReactNode, useEffect } from "react";
import { cn } from "@/lib/utils";

interface SlideOverProps {
    isOpen: boolean;
    onClose: () => void;
    title: ReactNode;
    description?: ReactNode;
}

export default function SlideOver({
    isOpen,
    onClose,
    title,
    description,
    children,
}: PropsWithChildren<SlideOverProps>) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    useEffect(() => {
        if (isOpen) document.body.classList.add("overflow-hidden");
        else document.body.classList.remove("overflow-hidden");
        return () => document.body.classList.remove("overflow-hidden");
    }, [isOpen]);

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                aria-hidden="true"
                className={cn(
                    "fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-200",
                    isOpen
                        ? "opacity-100"
                        : "pointer-events-none opacity-0",
                )}
            />

            {/* Panel */}
            <aside
                className={cn(
                    "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ease-out",
                    isOpen ? "translate-x-0" : "translate-x-full",
                )}

            >
                <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
                    <div>
                        <h2 className="font-clash text-base font-medium text-gray-900">
                            {title}
                        </h2>
                        {description && (
                            <p className="mt-0.5 text-xs text-gray-500">
                                {description}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        aria-label="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
            </aside>
        </>
    );
}
