import { ChartPie } from "lucide-react";
import { ADMIN_TOKENS } from "./tokens";

interface Segment {
    label: string;
    value: number;
    color: string;
}

interface DoughnutPlaceholderProps {
    title?: string;
    rangeLabel?: string;
    segments?: Segment[];
}

const DEFAULT_SEGMENTS: Segment[] = [
    { label: "Pending", value: 10, color: "#fb7185" },
    { label: "In Progress", value: 18, color: "#a855f7" },
    { label: "Completed", value: 72, color: "#3b82f6" },
];

export default function DoughnutPlaceholder({
    title = "My Progress",
    rangeLabel = "08–12 Apr",
    segments = DEFAULT_SEGMENTS,
}: DoughnutPlaceholderProps) {
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    const completed = segments[segments.length - 1]?.value ?? 0;

    let cumulative = 0;
    const stops = segments
        .map((segment) => {
            const start = (cumulative / total) * 100;
            cumulative += segment.value;
            const end = (cumulative / total) * 100;
            return `${segment.color} ${start}% ${end}%`;
        })
        .join(", ");

    return (
        <div className={`p-5 ${ADMIN_TOKENS.CARD_LARGE}`}>
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gray-900 text-white">
                        <ChartPie size={16} />
                    </div>
                    <span className="font-clash text-sm font-medium text-gray-900">
                        {title}
                    </span>
                </div>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-medium text-gray-600">
                    {rangeLabel}
                </span>
            </div>

            <div className="mt-5 flex items-center gap-6">
                <div className="relative h-36 w-36 shrink-0">
                    <div
                        className="h-full w-full rounded-full"
                        style={{
                            background: `conic-gradient(${stops})`,
                        }}
                    />
                    <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-white shadow-[0_4px_16px_rgb(0,0,0,0.04)]">
                        <span className="font-archivo text-2xl font-normal leading-none text-gray-900">
                            {completed}%
                        </span>
                        <span className="mt-1 text-[10px] uppercase tracking-wide text-gray-400">
                            Overall
                        </span>
                    </div>
                </div>

                <ul className="flex flex-1 flex-col gap-3">
                    {segments.map((segment) => (
                        <li
                            key={segment.label}
                            className="flex items-center justify-between text-sm"
                        >
                            <span className="flex items-center gap-2 text-gray-600">
                                <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{
                                        backgroundColor: segment.color,
                                    }}
                                />
                                {segment.label}
                            </span>
                            <span className="font-clash font-medium text-gray-900">
                                {segment.value}%
                            </span>
                        </li>
                    ))}
                </ul>
            </div>

            <p className="mt-4 text-[11px] text-gray-400">
                Based on your activity this week
            </p>
        </div>
    );
}
