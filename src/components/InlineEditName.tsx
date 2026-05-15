import { useEffect, useRef, useState } from "react";
import { useProjects } from "../stores/projects";

export function InlineEditName() {
  const name = useProjects((s) => s.draft.name);
  const updateDraft = useProjects((s) => s.updateDraft);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setValue(name);
  }, [name, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function commit() {
    const trimmed = value.trim();
    if (trimmed && trimmed !== name) {
      updateDraft({ name: trimmed });
    } else {
      setValue(name);
    }
    setEditing(false);
  }

  function cancel() {
    setValue(name);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="content-header__name-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        spellCheck={false}
      />
    );
  }

  return (
    <button
      className="content-header__name content-header__name--btn"
      type="button"
      onClick={() => setEditing(true)}
      title="Click to rename"
    >
      {name}
    </button>
  );
}
