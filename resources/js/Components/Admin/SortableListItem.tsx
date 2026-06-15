import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
    id: string;
    children: React.ReactNode;
    className?: string;
}

export default function SortableListItem({ id, children, className }: Props) {
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

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex items-center gap-2 touch-pan-y",
                isDragging && "z-50 opacity-60 shadow-lg rounded-xl",
                className,
            )}
        >
            <button
                type="button"
                {...attributes}
                {...listeners}
                className="flex h-6 w-6 shrink-0 touch-none cursor-grab items-center justify-center rounded-md text-slate-300 hover:text-slate-500 active:cursor-grabbing focus:outline-none transition-colors"
                aria-label="Drag to reorder"
            >
                <GripVertical size={14} />
            </button>
            <div className="min-w-0 flex-1">{children}</div>
        </div>
    );
}
