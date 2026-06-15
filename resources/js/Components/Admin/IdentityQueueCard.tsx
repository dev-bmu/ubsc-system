import { ArrowUpRight, ListChecks } from "lucide-react";
import { Link } from "@inertiajs/react";
import { ADMIN_TOKENS } from "./tokens";

interface IdentityQueueCardProps {
    count?: number;
}

export default function IdentityQueueCard({ count = 0 }: IdentityQueueCardProps) {
    return (
        <div className={`${ADMIN_TOKENS.CARD_LARGE} flex flex-col gap-6 p-6`}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gray-900 text-white">
                        <ListChecks size={16} />
                    </div>
                    <div>
                        <h2 className="font-clash text-sm font-medium text-gray-900">
                            Identity Queue
                        </h2>
                        <p className="text-[11px] text-gray-400">Antrean verifikasi identitas</p>
                    </div>
                </div>

                {count > 0 && (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                        Perlu tindakan
                    </span>
                )}
            </div>

            {/* Big count */}
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6">
                <span
                    className={
                        count > 0
                            ? "font-archivo text-7xl font-normal text-gray-900"
                            : "font-archivo text-7xl font-normal text-gray-300"
                    }
                >
                    {count}
                </span>
                <p className="text-center text-sm text-gray-500">
                    {count === 0
                        ? "Tidak ada antrean saat ini"
                        : "Perlu verifikasi manual oleh staf"}
                </p>
            </div>

            {/* Link to queue */}
            <Link
                href={route("admin.identity.index")}
                className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
            >
                <span>Buka Identity Queue</span>
                <ArrowUpRight size={14} className="text-gray-400" />
            </Link>
        </div>
    );
}
