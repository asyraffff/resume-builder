"use client";

import type { ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/** A self-contained vertical sortable list. Nest these freely: each level has its own DndContext. */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  children,
}: {
  items: T[];
  onReorder: (next: T[]) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from >= 0 && to >= 0) onReorder(arrayMove(items, from, to));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

export type HandleProps = ReturnType<typeof useSortable>["listeners"] & ReturnType<typeof useSortable>["attributes"];

export function SortableRow({
  id,
  as: Tag = "div",
  className = "",
  children,
}: {
  id: string;
  /** "li" when the row is an item of a list, so the list's markup stays valid for screen readers. */
  as?: "div" | "li";
  className?: string;
  children: (handle: HandleProps, isDragging: boolean) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <Tag
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 10 : undefined, position: "relative" }}
      className={`${className} ${isDragging ? "opacity-80 shadow-lg" : ""}`}
    >
      {children({ ...attributes, ...listeners } as HandleProps, isDragging)}
    </Tag>
  );
}

export function DragHandle({ handle, label }: { handle: HandleProps; label: string }) {
  return (
    <button
      {...handle}
      type="button"
      aria-label={label}
      title="Drag to reorder"
      className="relative [@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:-inset-2.5 [@media(pointer:coarse)]:after:content-[''] flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted/60 hover:bg-background hover:text-foreground active:cursor-grabbing"
    >
      <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
        {[2, 7, 12].flatMap((y) => [<circle key={`a${y}`} cx="2.5" cy={y} r="1.3" />, <circle key={`b${y}`} cx="7.5" cy={y} r="1.3" />])}
      </svg>
    </button>
  );
}
