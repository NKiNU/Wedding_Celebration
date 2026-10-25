"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { WISH_MAX, WISH_MIN } from "@/lib/domain/limits";
import { BottomSheet } from "./BottomSheet";
import { useCreatePost } from "./useCreatePost";

const CHIPS = ["Selamat pengantin baru", "Congratulations!", "Semoga bahagia hingga ke jannah"];

type Props = { open: boolean; me: string; onClose: () => void; onPosted: () => void };

/** Simplest path through /api/posts: text only, no upload intent. */
export function WishDrawer({ open, me, onClose, onPosted }: Props) {
  const [text, setText] = useState("");
  const { status, error, postWish, reset } = useCreatePost();
  const sending = status !== "idle";

  const close = () => {
    setText("");
    reset();
    onClose();
  };

  const addChip = (chip: string) =>
    setText((current) => `${current.trim() ? `${current.trim()} ` : ""}${chip}`.slice(0, WISH_MAX));

  async function send() {
    if (await postWish(text.trim())) {
      setText("");
      onPosted();
    }
  }

  return (
    <BottomSheet open={open} title="Write a wish" onClose={close} busy={sending}>
      <p className="text-[13px] text-muted">
        Your wish appears on the wall from <strong className="text-ink">{me}</strong>.
      </p>
      <div className="flex flex-wrap gap-2">
        {CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => addChip(chip)}
            className="h-11 rounded-full border border-line bg-card px-3.5 text-xs active:scale-[0.97]"
          >
            + {chip}
          </button>
        ))}
      </div>
      <label htmlFor="wm-wish" className="text-[13px] font-medium">
        Your wish
      </label>
      <textarea
        id="wm-wish"
        rows={5}
        value={text}
        maxLength={WISH_MAX}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write something warm for the couple…"
        className="resize-none rounded-[18px] bg-soft px-4 py-3.5 text-base leading-[1.45] text-ink placeholder:text-ink/70"
      />
      <span className="self-end text-xs text-muted">
        {text.length} / {WISH_MAX}
      </span>
      {error && (
        <p role="alert" className="text-[13px] font-medium">
          {error}
        </p>
      )}
      <Button type="button" onClick={send} disabled={text.trim().length < WISH_MIN || sending}>
        {sending ? "Sending…" : "Send wish"}
      </Button>
    </BottomSheet>
  );
}
