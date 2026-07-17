"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, Editor as TT } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Youtube from "@tiptap/extension-youtube";
import Placeholder from "@tiptap/extension-placeholder";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TextStyle from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import CharacterCount from "@tiptap/extension-character-count";
import {
  IconAlignCenter,
  IconAlignJustify,
  IconAlignLeft,
  IconAlignRight,
  IconCheck,
  IconEraser,
  IconImage,
  IconLink,
  IconList,
  IconListChecks,
  IconListOrdered,
  IconMinus,
  IconQuote,
  IconRedo,
  IconTable,
  IconUndo,
  IconX,
  IconYoutube,
} from "@/components/icons";

const COLORS = ["#e8402e", "#d97706", "#059669", "#2563eb", "#7c3aed", ""];

function Btn({
  onClick,
  active = false,
  disabled = false,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-sm transition ${
        active ? "bg-accent-soft text-accent" : "text-ink/80 hover:bg-panel-2"
      } disabled:opacity-30`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-1 h-5 w-px self-center bg-line" />;
}

function Toolbar({ editor }: { editor: TT }) {
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadImage = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) return alert("Картинка не загрузилась");
    const { url } = await res.json();
    editor.chain().focus().setImage({ src: url }).run();
  };

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Ссылка (пусто - убрать):", prev ?? "https://");
    if (url === null) return;
    if (url === "") return editor.chain().focus().unsetLink().run();
    editor.chain().focus().setLink({ href: url }).run();
  };

  const addYoutube = () => {
    const url = window.prompt("Ссылка на YouTube:");
    if (url) editor.chain().focus().setYoutubeVideo({ src: url }).run();
  };

  const c = editor.chain();
  return (
    <div className="sticky top-14 z-10 flex flex-wrap items-center gap-0.5 rounded-t-brand border-b border-line bg-panel p-2">
      {[1, 2, 3, 4].map((l) => (
        <Btn
          key={l}
          title={`Заголовок ${l}`}
          active={editor.isActive("heading", { level: l })}
          onClick={() => c.focus().toggleHeading({ level: l as 1 | 2 | 3 | 4 }).run()}
        >
          <span className="font-display text-xs">H{l}</span>
        </Btn>
      ))}
      <Btn title="Абзац" active={editor.isActive("paragraph")} onClick={() => c.focus().setParagraph().run()}>
        ¶
      </Btn>
      <Sep />
      <Btn title="Жирный" active={editor.isActive("bold")} onClick={() => c.focus().toggleBold().run()}>
        <b>Ж</b>
      </Btn>
      <Btn title="Курсив" active={editor.isActive("italic")} onClick={() => c.focus().toggleItalic().run()}>
        <i>К</i>
      </Btn>
      <Btn title="Подчёркнутый" active={editor.isActive("underline")} onClick={() => c.focus().toggleUnderline().run()}>
        <u>П</u>
      </Btn>
      <Btn title="Зачёркнутый" active={editor.isActive("strike")} onClick={() => c.focus().toggleStrike().run()}>
        <s>З</s>
      </Btn>
      <Btn title="Код" active={editor.isActive("code")} onClick={() => c.focus().toggleCode().run()}>
        <span className="font-mono text-xs">{"<>"}</span>
      </Btn>
      <Btn title="Маркер" active={editor.isActive("highlight")} onClick={() => c.focus().toggleHighlight().run()}>
        <mark className="rounded-sm px-0.5">М</mark>
      </Btn>
      <Btn title="Надстрочный" active={editor.isActive("superscript")} onClick={() => c.focus().toggleSuperscript().run()}>
        x²
      </Btn>
      <Btn title="Подстрочный" active={editor.isActive("subscript")} onClick={() => c.focus().toggleSubscript().run()}>
        x₂
      </Btn>
      <span className="mx-0.5 flex items-center gap-0.5">
        {COLORS.map((col) => (
          <button
            key={col || "reset"}
            type="button"
            title={col ? `Цвет ${col}` : "Сбросить цвет"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() =>
              col
                ? editor.chain().focus().setColor(col).run()
                : editor.chain().focus().unsetColor().run()
            }
            className="h-4 w-4 rounded-full border border-line"
            style={{ background: col || "transparent" }}
          >
            {!col && <IconX size={9} className="mx-auto block text-muted" />}
          </button>
        ))}
      </span>
      <Sep />
      {(
        [
          ["left", "По левому краю", IconAlignLeft],
          ["center", "По центру", IconAlignCenter],
          ["right", "По правому краю", IconAlignRight],
          ["justify", "По ширине", IconAlignJustify],
        ] as const
      ).map(([al, title, AlignIcon]) => (
        <Btn
          key={al}
          title={title}
          active={editor.isActive({ textAlign: al })}
          onClick={() => c.focus().setTextAlign(al).run()}
        >
          <AlignIcon size={15} />
        </Btn>
      ))}
      <Sep />
      <Btn title="Маркированный список" active={editor.isActive("bulletList")} onClick={() => c.focus().toggleBulletList().run()}>
        <IconList size={15} />
      </Btn>
      <Btn title="Нумерованный список" active={editor.isActive("orderedList")} onClick={() => c.focus().toggleOrderedList().run()}>
        <IconListOrdered size={15} />
      </Btn>
      <Btn title="Чек-лист" active={editor.isActive("taskList")} onClick={() => c.focus().toggleTaskList().run()}>
        <IconListChecks size={15} />
      </Btn>
      <Btn title="Цитата" active={editor.isActive("blockquote")} onClick={() => c.focus().toggleBlockquote().run()}>
        <IconQuote size={15} />
      </Btn>
      <Btn title="Блок кода" active={editor.isActive("codeBlock")} onClick={() => c.focus().toggleCodeBlock().run()}>
        <span className="font-mono text-xs">{"{ }"}</span>
      </Btn>
      <Btn title="Разделитель" onClick={() => c.focus().setHorizontalRule().run()}>
        <IconMinus size={15} />
      </Btn>
      <Sep />
      <Btn title="Ссылка" active={editor.isActive("link")} onClick={setLink}>
        <IconLink size={15} />
      </Btn>
      <Btn title="Картинка" onClick={() => fileRef.current?.click()}>
        <IconImage size={15} />
      </Btn>
      <Btn title="YouTube" onClick={addYoutube}>
        <IconYoutube size={15} />
      </Btn>
      <Sep />
      {editor.isActive("table") ? (
        <>
          <Btn title="Строка ниже" onClick={() => c.focus().addRowAfter().run()}>+строка</Btn>
          <Btn title="Столбец правее" onClick={() => c.focus().addColumnAfter().run()}>+столбец</Btn>
          <Btn title="Удалить строку" onClick={() => c.focus().deleteRow().run()}>−строка</Btn>
          <Btn title="Удалить столбец" onClick={() => c.focus().deleteColumn().run()}>−столбец</Btn>
          <Btn title="Удалить таблицу" onClick={() => c.focus().deleteTable().run()}>
            <span className="flex items-center gap-0.5"><IconX size={11} />табл</span>
          </Btn>
        </>
      ) : (
        <Btn
          title="Таблица"
          onClick={() => c.focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <IconTable size={15} />
        </Btn>
      )}
      <Sep />
      <Btn title="Отменить" disabled={!editor.can().undo()} onClick={() => c.focus().undo().run()}>
        <IconUndo size={15} />
      </Btn>
      <Btn title="Вернуть" disabled={!editor.can().redo()} onClick={() => c.focus().redo().run()}>
        <IconRedo size={15} />
      </Btn>
      <Btn title="Очистить форматирование" onClick={() => c.focus().clearNodes().unsetAllMarks().run()}>
        <IconEraser size={15} />
      </Btn>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadImage(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export default function Editor({ initial }: { initial: string }) {
  const [saved, setSaved] = useState<"idle" | "saving" | "ok" | "err">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Image,
      Link.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Youtube.configure({ nocookie: true }),
      Subscript,
      Superscript,
      TextStyle,
      Color,
      CharacterCount,
      Placeholder.configure({
        placeholder: "Расскажите, что происходит под эфиром…",
      }),
    ],
    content: initial,
    onUpdate: () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void save(), 800);
    },
    editorProps: {
      attributes: {
        class: "tiptap article prose prose-neutral dark:prose-invert max-w-none px-5 py-4",
      },
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    []
  );

  const save = async () => {
    if (!editor) return;
    if (savingRef.current) {
      pendingRef.current = true;
      return;
    }
    savingRef.current = true;
    setSaved("saving");
    const res = await fetch("/api/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: editor.getHTML() }),
    }).catch(() => null);
    savingRef.current = false;
    if (res?.ok) {
      setSaved("ok");
      setTimeout(() => setSaved((s) => (s === "ok" ? "idle" : s)), 1500);
    } else {
      setSaved("err");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void save(), 3000);
    }
    if (pendingRef.current) {
      pendingRef.current = false;
      void save();
    }
  };

  if (!editor) return null;

  return (
    <div className="rounded-brand border border-line bg-panel">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
      <div className="flex items-center justify-between border-t border-line px-4 py-3">
        <span className="font-mono text-xs text-muted">
          {editor.storage.characterCount.characters()} символов ·{" "}
          {editor.storage.characterCount.words()} слов
        </span>
        <span className="text-xs text-muted">
          {saved === "idle" && "Сохраняется автоматически"}
          {saved === "saving" && "Сохраняю…"}
          {saved === "ok" && (
            <span className="flex items-center gap-1">
              <IconCheck size={13} />
              Сохранено
            </span>
          )}
          {saved === "err" && (
            <span className="text-accent">Не сохранилось - пробую ещё раз…</span>
          )}
        </span>
      </div>
    </div>
  );
}
