import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
    Bold,
    Code,
    Heading2,
    Heading3,
    Italic,
    Link2,
    List,
    ListOrdered,
    Quote,
    Redo,
    Undo,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RichEditorProps {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    error?: string;
}

interface ToolbarButtonProps {
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    title: string;
    children: React.ReactNode;
}

function ToolbarBtn({
    onClick,
    active,
    disabled,
    title,
    children,
}: ToolbarButtonProps) {
    return (
        <button
            type="button"
            title={title}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                "flex h-8 w-8 items-center justify-center rounded-xl text-sm transition-colors",
                active
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100",
                disabled && "cursor-not-allowed opacity-40",
            )}
        >
            {children}
        </button>
    );
}

export default function RichEditor({
    value,
    onChange,
    placeholder = "Start writing your article…",
    error,
}: RichEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit,
            Placeholder.configure({ placeholder }),
            Link.configure({ openOnClick: false, autolink: true }),
        ],
        content: value,
        onUpdate: ({ editor }) => onChange(editor.getHTML()),
    });

    const setLink = () => {
        if (!editor) return;
        const prev = editor.getAttributes("link").href as string | undefined;
        const url = window.prompt("Enter URL", prev ?? "https://");
        if (url === null) return;
        if (url === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
        }
        editor
            .chain()
            .focus()
            .extendMarkRange("link")
            .setLink({ href: url })
            .run();
    };

    if (!editor) return null;

    return (
        <div
            className={cn(
                "overflow-hidden rounded-2xl border border-gray-200 bg-white transition-colors focus-within:border-gray-900",
                error && "border-rose-400",
            )}
        >
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-100 bg-gray-50 px-3 py-2">
                <ToolbarBtn
                    title="Bold"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    active={editor.isActive("bold")}
                >
                    <Bold size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                    title="Italic"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    active={editor.isActive("italic")}
                >
                    <Italic size={14} />
                </ToolbarBtn>

                <div className="mx-1 h-5 w-px bg-gray-200" />

                <ToolbarBtn
                    title="Heading 2"
                    onClick={() =>
                        editor
                            .chain()
                            .focus()
                            .toggleHeading({ level: 2 })
                            .run()
                    }
                    active={editor.isActive("heading", { level: 2 })}
                >
                    <Heading2 size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                    title="Heading 3"
                    onClick={() =>
                        editor
                            .chain()
                            .focus()
                            .toggleHeading({ level: 3 })
                            .run()
                    }
                    active={editor.isActive("heading", { level: 3 })}
                >
                    <Heading3 size={14} />
                </ToolbarBtn>

                <div className="mx-1 h-5 w-px bg-gray-200" />

                <ToolbarBtn
                    title="Bullet list"
                    onClick={() =>
                        editor.chain().focus().toggleBulletList().run()
                    }
                    active={editor.isActive("bulletList")}
                >
                    <List size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                    title="Ordered list"
                    onClick={() =>
                        editor.chain().focus().toggleOrderedList().run()
                    }
                    active={editor.isActive("orderedList")}
                >
                    <ListOrdered size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                    title="Blockquote"
                    onClick={() =>
                        editor.chain().focus().toggleBlockquote().run()
                    }
                    active={editor.isActive("blockquote")}
                >
                    <Quote size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                    title="Code"
                    onClick={() =>
                        editor.chain().focus().toggleCode().run()
                    }
                    active={editor.isActive("code")}
                >
                    <Code size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                    title="Link"
                    onClick={setLink}
                    active={editor.isActive("link")}
                >
                    <Link2 size={14} />
                </ToolbarBtn>

                <div className="mx-1 h-5 w-px bg-gray-200" />

                <ToolbarBtn
                    title="Undo"
                    onClick={() => editor.chain().focus().undo().run()}
                    disabled={!editor.can().undo()}
                >
                    <Undo size={14} />
                </ToolbarBtn>
                <ToolbarBtn
                    title="Redo"
                    onClick={() => editor.chain().focus().redo().run()}
                    disabled={!editor.can().redo()}
                >
                    <Redo size={14} />
                </ToolbarBtn>
            </div>

            {/* Editor canvas */}
            <EditorContent
                editor={editor}
                className="prose prose-sm max-w-none px-4 py-4 focus:outline-none [&_.tiptap]:min-h-80 [&_.tiptap]:outline-none [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:h-0 [&_.tiptap_p.is-editor-empty:first-child::before]:text-gray-400 [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
            />

            {error && (
                <p className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-500">
                    {error}
                </p>
            )}
        </div>
    );
}
