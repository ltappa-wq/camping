"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  commitTags as commitTagsPure,
  filterSuggestions,
  removeTagAt,
} from "@/lib/tag-input";

export type TagInputProps = {
  /** Current tags. Always treated as a set — duplicates are dropped. */
  value: string[];
  onChange: (tags: string[]) => void;
  /** Optional autocomplete pool; shown as a dropdown when the input
   *  matches. In readOnly mode this is the only way to add tags. */
  suggestions?: ReadonlyArray<string>;
  placeholder?: string;
  /** Optional cap. Hide the input once reached. */
  maxTags?: number;
  disabled?: boolean;
  /** When true, free-text input is disabled — operator can only pick
   *  from suggestions. Used by the public search filter. */
  readOnly?: boolean;
  className?: string;
  id?: string;
};

const SEPARATOR = /[,\n\t]+/;

/**
 * Chip-style multi-tag input. Composes plain shadcn-flavored Tailwind
 * (no new dependency). Behavior matches what operators expect from
 * tag fields in modern admin tools:
 *   - Enter or comma to commit the typed tag
 *   - Backspace on an empty input removes the trailing chip
 *   - Click X on a chip to remove it
 *   - Pasting "shaded, near bath\nlake" splits on commas + newlines
 *   - Duplicates are silently dropped
 *   - Type to filter the suggestion dropdown; click or Enter to pick
 *
 * In readOnly mode, the input field still exists but accepts no free
 * text — typing only filters the dropdown, and selections come from
 * there. Used on the public search filter where guests pick from the
 * known tag set.
 */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder,
  maxTags,
  disabled,
  readOnly,
  className,
  id,
}: TagInputProps) {
  const reactId = useId();
  const inputId = id ?? reactId;
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const atLimit = maxTags != null && value.length >= maxTags;

  const filteredSuggestions = useMemo(
    () => filterSuggestions(suggestions, value, draft),
    [draft, suggestions, value],
  );
  const showSuggestions =
    focused && filteredSuggestions.length > 0 && !atLimit && !disabled;

  function commit(raw: string) {
    const next = commitTagsPure(value, raw, {
      maxTags,
      readOnly,
      suggestions,
    });
    if (next.length !== value.length) onChange(next);
    setDraft("");
  }

  function removeAt(index: number) {
    onChange(removeTagAt(value, index));
    // Refocus so the next keystroke continues the flow.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      // In readOnly mode, Enter picks the first filtered suggestion.
      if (readOnly) {
        const first = filteredSuggestions[0];
        if (first) commit(first);
        return;
      }
      commit(draft);
      return;
    }
    if (e.key === "Backspace" && draft.length === 0 && value.length > 0) {
      e.preventDefault();
      removeAt(value.length - 1);
      return;
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    if (disabled || readOnly) return;
    const text = e.clipboardData.getData("text");
    if (SEPARATOR.test(text)) {
      e.preventDefault();
      commit(text);
    }
  }

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm",
          focused && "ring-2 ring-ring ring-offset-1",
          disabled && "cursor-not-allowed opacity-50",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-1 rounded-md border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
          >
            {tag}
            {!disabled ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeAt(i);
                }}
                className="rounded-sm text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </span>
        ))}
        {!atLimit ? (
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => {
              if (readOnly) {
                // Allow typing to filter suggestions, but never persist
                // the draft as a new free tag.
                setDraft(e.target.value);
                return;
              }
              setDraft(e.target.value);
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              // Delay so suggestion clicks register before we collapse.
              setTimeout(() => setFocused(false), 120);
              if (!readOnly && draft.trim().length > 0) {
                commit(draft);
              }
            }}
            placeholder={
              value.length === 0 ? placeholder ?? "Add tags…" : ""
            }
            disabled={disabled}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-w-[8ch]"
            autoComplete="off"
          />
        ) : null}
      </div>

      {showSuggestions ? (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                // mousedown beats input blur; the click would otherwise
                // arrive after the suggestions list has collapsed.
                e.preventDefault();
                commit(s);
                inputRef.current?.focus();
              }}
              className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
