import { Folder, GripVertical, Plus, X } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useProjects,
  getActiveLane,
  MAX_LANES,
  type Command,
} from "../stores/projects";
import { pickDirectory } from "../lib/backend";
import "./command-list.css";

export function CommandList() {
  const lanes = useProjects((s) => s.draft.lanes);
  const activeLaneId = useProjects((s) => s.draft.activeLaneId);
  const setActiveLane = useProjects((s) => s.setActiveLane);
  const addLane = useProjects((s) => s.addLane);
  const removeLane = useProjects((s) => s.removeLane);
  const updateLane = useProjects((s) => s.updateLane);

  const path = useProjects((s) => getActiveLane(s.draft).path);
  const commands = useProjects((s) => getActiveLane(s.draft).commands);
  const addCommand = useProjects((s) => s.addCommand);
  const updateCommand = useProjects((s) => s.updateCommand);
  const removeCommand = useProjects((s) => s.removeCommand);
  const reorderCommand = useProjects((s) => s.reorderCommand);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = commands.findIndex((c) => c.id === active.id);
    const to = commands.findIndex((c) => c.id === over.id);
    if (from < 0 || to < 0) return;
    reorderCommand(from, to);
  }

  return (
    <div className="cmd-list">
      <div className="cmd-list__section">
        <div className="cmd-list__section-head">
          <span className="cmd-list__label">Working directory</span>
          <div className="cmd-tabs" role="tablist" aria-label="Parallel lanes">
            {lanes.map((l, idx) => {
              const isActive = l.id === activeLaneId;
              return (
                <div
                  key={l.id}
                  className={`cmd-tab ${isActive ? "is-active" : ""}`}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className="cmd-tab__btn"
                    onClick={() => setActiveLane(l.id)}
                    title={`Lane ${idx + 1}`}
                  >
                    {idx + 1}
                  </button>
                  {lanes.length > 1 && (
                    <button
                      type="button"
                      className="cmd-tab__close"
                      aria-label={`Remove lane ${idx + 1}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeLane(l.id);
                      }}
                    >
                      <X size={8} strokeWidth={1.75} />
                    </button>
                  )}
                </div>
              );
            })}
            {lanes.length < MAX_LANES && (
              <button
                type="button"
                className="cmd-tab cmd-tab--add"
                onClick={addLane}
                title="Add parallel lane"
                aria-label="Add lane"
              >
                <Plus size={10} strokeWidth={1.75} />
              </button>
            )}
          </div>
        </div>
        <div className="cmd-list__path-row">
          <input
            type="text"
            className="cmd-list__input cmd-list__input--path"
            placeholder="C:\path\to\project"
            value={path}
            onChange={(e) =>
              updateLane(activeLaneId, { path: e.target.value })
            }
            spellCheck={false}
          />
          <button
            className="cmd-list__browse"
            type="button"
            onClick={async () => {
              const picked = await pickDirectory();
              if (picked) updateLane(activeLaneId, { path: picked });
            }}
          >
            <Folder size={13} strokeWidth={1.75} />
            <span>Browse</span>
          </button>
        </div>
      </div>

      <div className="cmd-list__section cmd-list__section--rows">
        <div className="cmd-list__section-head">
          <span className="cmd-list__label">Commands (sequential)</span>
          <button className="cmd-list__add" type="button" onClick={addCommand}>
            <Plus size={12} strokeWidth={1.75} />
            <span>Add</span>
          </button>
        </div>

        <div className="cmd-list__rows">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={commands.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {commands.map((row, idx) => (
                <SortableRow
                  key={row.id}
                  row={row}
                  idx={idx}
                  canRemove={commands.length > 1}
                  onCommandChange={(text) =>
                    updateCommand(row.id, { command: text })
                  }
                  onDelayChange={(ms) =>
                    updateCommand(row.id, { delayMs: ms })
                  }
                  onRemove={() => removeCommand(row.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}

interface SortableRowProps {
  row: Command;
  idx: number;
  canRemove: boolean;
  onCommandChange: (text: string) => void;
  onDelayChange: (ms: number) => void;
  onRemove: () => void;
}

function SortableRow({
  row,
  idx,
  canRemove,
  onCommandChange,
  onDelayChange,
  onRemove,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`cmd-row ${isDragging ? "is-dragging" : ""}`}
    >
      <button
        className="cmd-row__handle"
        type="button"
        aria-label="Reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} strokeWidth={1.75} />
      </button>
      <span className="cmd-row__index">{idx + 1}</span>
      <input
        type="text"
        className="cmd-list__input cmd-row__cmd"
        placeholder="npm run dev"
        value={row.command}
        onChange={(e) => onCommandChange(e.target.value)}
        spellCheck={false}
      />
      <div className="cmd-row__delay">
        <input
          type="number"
          min={0}
          step={100}
          className="cmd-list__input cmd-row__delay-input"
          value={row.delayMs}
          onChange={(e) =>
            onDelayChange(Math.max(0, Number(e.target.value) || 0))
          }
        />
        <span className="cmd-row__unit">ms</span>
      </div>
      <button
        className="cmd-row__remove"
        type="button"
        aria-label="Remove command"
        onClick={onRemove}
        disabled={!canRemove}
      >
        <X size={13} strokeWidth={1.75} />
      </button>
    </div>
  );
}
