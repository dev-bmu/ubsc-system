import {
    Layers,
    LayoutGrid,
    type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type NewsContentMode = "berita" | "artikel";

type NewsModeSwitchProps = {
    value: NewsContentMode;
    onChange: (mode: NewsContentMode) => void;
    className?: string;
};

type ModeOption = {
    value: NewsContentMode;
    label: string;
    icon: LucideIcon;
};

const MODE_OPTIONS: ModeOption[] = [
    {
        value: "berita",
        label: "Berita",
        icon: LayoutGrid,
    },
    {
        value: "artikel",
        label: "Artikel",
        icon: Layers,
    },
];

export default function NewsModeSwitch({
    value,
    onChange,
    className = "",
}: NewsModeSwitchProps) {
    const [visualValue, setVisualValue] = useState(value);
    const [isSwitching, setIsSwitching] = useState(false);
    const commitTimerRef = useRef<number | null>(null);

    useEffect(() => {
        if (commitTimerRef.current !== null || value === visualValue) return;

        setVisualValue(value);
        setIsSwitching(false);
    }, [value, visualValue]);

    useEffect(
        () => () => {
            if (commitTimerRef.current !== null) {
                window.clearTimeout(commitTimerRef.current);
            }
        },
        [],
    );

    const requestMode = (mode: NewsContentMode) => {
        if (mode === visualValue) return;

        if (commitTimerRef.current !== null) {
            window.clearTimeout(commitTimerRef.current);
        }

        setVisualValue(mode);
        setIsSwitching(true);
        commitTimerRef.current = window.setTimeout(() => {
            commitTimerRef.current = null;
            setIsSwitching(false);
            onChange(mode);
        }, 680);
    };

    return (
        <div
            className={`news-mode-switch ${className}`.trim()}
            data-mode={visualValue}
            data-committed-mode={value}
            data-switching={isSwitching}
            role="group"
            aria-label="Pilih mode konten"
        >
            <div className="news-mode-switch__rail">
                <span className="news-mode-switch__indicator" aria-hidden>
                    <span className="news-mode-switch__tone news-mode-switch__tone--berita" />
                    <span className="news-mode-switch__tone news-mode-switch__tone--artikel" />
                </span>

                {MODE_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const isActive = option.value === visualValue;

                    return (
                        <button
                            key={option.value}
                            type="button"
                            aria-pressed={isActive}
                            className="news-mode-switch__option"
                            data-active={isActive}
                            onClick={() => requestMode(option.value)}
                        >
                            <Icon aria-hidden className="news-mode-switch__icon" />
                            <span>{option.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
