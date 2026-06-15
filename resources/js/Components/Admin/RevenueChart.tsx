const SVG_W = 800;
const CHART_TOP = 16;
const CHART_BOTTOM = 148;
const SVG_TOTAL_H = 180;

interface RevenueChartProps {
    data: number[];
    color?: string;
    peakLabel?: string;
    currentMonth?: string;
    daysInMonth?: number;
}

export default function RevenueChart({
    data,
    color = "#10b981",
    peakLabel,
    currentMonth,
    daysInMonth,
}: RevenueChartProps) {
    if (data.length < 2) {
        return <div className="flex h-[200px] items-center justify-center text-sm text-gray-400">Belum ada data pendapatan.</div>;
    }
    const maxVal = Math.max(...data, 1);
    const peakIdx = data.indexOf(Math.max(...data));

    const points = data.map((v, i) => ({
        x: (i / (data.length - 1)) * SVG_W,
        y: CHART_BOTTOM - (v / maxVal) * (CHART_BOTTOM - CHART_TOP),
    }));

    const linePath = points.reduce((acc, p, i) => {
        if (i === 0) return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
        const prev = points[i - 1];
        const cpx = ((prev.x + p.x) / 2).toFixed(1);
        return `${acc} C ${cpx} ${prev.y.toFixed(1)} ${cpx} ${p.y.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }, "");

    const areaPath = `${linePath} L ${SVG_W} ${CHART_BOTTOM} L 0 ${CHART_BOTTOM} Z`;

    const gridLines = [0.25, 0.5, 0.75].map((pct) => ({
        y: CHART_BOTTOM - pct * (CHART_BOTTOM - CHART_TOP),
        label: `${Math.round((pct * maxVal) / 1000)}JT`,
    }));

    const xLabels = [0, 4, 9, 14, 19, 24, 29]
        .filter((i) => i < data.length)
        .map((i) => ({
            x: (i / (data.length - 1)) * SVG_W,
            label: String(i + 1),
        }));

    const peakPoint = points[peakIdx];

    return (
        <div className="relative w-full">
            <svg
                viewBox={`0 0 ${SVG_W} ${SVG_TOTAL_H + 28}`}
                preserveAspectRatio="none"
                className="w-full"
                style={{ height: 200 }}
            >
                <defs>
                    <linearGradient id="rev-chart-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                        <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                    </linearGradient>
                </defs>

                {gridLines.map((gl, i) => (
                    <g key={i}>
                        <line
                            x1={0}
                            y1={gl.y}
                            x2={SVG_W}
                            y2={gl.y}
                            stroke="#e5e7eb"
                            strokeWidth="1"
                            strokeDasharray="4 4"
                        />
                        <text
                            x={2}
                            y={gl.y - 4}
                            fontSize="10"
                            fill="#9ca3af"
                            textAnchor="start"
                        >
                            {gl.label}
                        </text>
                    </g>
                ))}

                <path d={areaPath} fill="url(#rev-chart-grad)" />
                <path
                    d={linePath}
                    stroke={color}
                    strokeWidth="2.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />

                {xLabels.map((xl) => (
                    <text
                        key={xl.label}
                        x={xl.x}
                        y={SVG_TOTAL_H + 16}
                        fontSize="11"
                        fill="#9ca3af"
                        textAnchor="middle"
                    >
                        {xl.label}
                    </text>
                ))}

                <circle cx={peakPoint.x} cy={peakPoint.y} r="5" fill={color} />
                <circle
                    cx={peakPoint.x}
                    cy={peakPoint.y}
                    r="9"
                    fill={color}
                    fillOpacity="0.2"
                />

                {peakLabel && (
                    <g>
                        <rect
                            x={peakPoint.x - 26}
                            y={peakPoint.y - 26}
                            width="52"
                            height="18"
                            rx="5"
                            fill="#064e3b"
                        />
                        <text
                            x={peakPoint.x}
                            y={peakPoint.y - 13}
                            fontSize="10"
                            fill="white"
                            textAnchor="middle"
                            fontWeight="600"
                        >
                            {peakLabel}
                        </text>
                    </g>
                )}
            </svg>

            <div className="mt-1 flex items-center justify-between px-1 text-[10px] text-gray-400">
                <span>1 {currentMonth ?? ""}</span>
                <span>{daysInMonth ? Math.ceil(daysInMonth / 2) : 15} {currentMonth ?? ""}</span>
                <span>{daysInMonth ?? 30} {currentMonth ?? ""}</span>
            </div>
        </div>
    );
}
