import { useId } from "react";
import { CAPTION_MAX } from "@/lib/domain/limits";

type Props = { value: string; onChange: (value: string) => void; placeholder: string; disabled?: boolean };

export function CaptionField({ value, onChange, placeholder, disabled }: Props) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="text-[13px] font-medium">
        Caption <span className="font-normal text-muted">(optional)</span>
      </label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={CAPTION_MAX}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        enterKeyHint="done"
        className="h-[50px] rounded-2xl bg-soft px-[18px] text-base text-ink placeholder:text-ink/70"
      />
    </>
  );
}
