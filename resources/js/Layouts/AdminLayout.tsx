import { PropsWithChildren, ReactNode, useEffect, useState } from "react";
import Sidebar from "@/Components/Admin/Sidebar";
import Topbar from "@/Components/Admin/Topbar";

interface AdminLayoutProps {
    header?: ReactNode;
}

export default function AdminLayout({
    header,
    children,
}: PropsWithChildren<AdminLayoutProps>) {
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setMobileSidebarOpen(false);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    return (
        <div className="relative flex h-[100dvh] w-full max-w-[100vw] overflow-hidden bg-[#F8F9FA] font-bdo text-gray-900">
            <Sidebar
                mobileOpen={mobileSidebarOpen}
                onClose={() => setMobileSidebarOpen(false)}
            />

            <div
                className="relative z-10 flex h-full w-full min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"
                data-lenis-prevent="true"
            >
                <Topbar
                    onMobileMenuClick={() => setMobileSidebarOpen(true)}
                />

                {header && (
                    <div className="px-4 pt-2 xl:px-8">{header}</div>
                )}

                <main className="max-w-full flex-1 px-4 pb-10 pt-2 xl:px-8">
                    {children}
                </main>
            </div>
        </div>
    );
}
