import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
    id: string;
    children: (handle: React.ReactNode) => React.ReactNode;
    className?: string;
}

export default function SortableCard({ id, children, className }: Props) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const handle = (
        <button
            type="button"
            {...attributes}
            {...listeners}
            className={cn(
                "flex h-7 w-7 cursor-grab items-center justify-center rounded-lg",
                "bg-black/30 text-white backdrop-blur-sm",
                "hover:bg-black/50 active:cursor-grabbing",
                "touch-none transition-colors focus:outline-none",
            )}
            aria-label="Drag to reorder"
        >
            <GripVertical size={14} />
        </button>
    );

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "touch-pan-y",
                isDragging && "z-50 opacity-60 shadow-2xl scale-[1.02]",
                className,
            )}
        >
            {children(handle)}
        </div>
    );
}
