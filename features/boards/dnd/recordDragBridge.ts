'use client'

// ─────────────────────────────────────────────────────────────────────────
// Record-drag bridge — connects the board area's dnd-kit record drags to the
// left sidebar, which lives OUTSIDE the board's DndContext and therefore can
// never be a dnd-kit `over` target.
//
// How it works: dnd-kit drags are POINTER-based (not native HTML5 drag), so
// the drag survives leaving the board area on its own — nothing cancels it.
// While a record drag is live, the board publishes it here; a window
// pointermove hit-test (document.elementFromPoint → closest
// [data-record-drop-board]) reports which sidebar board row the pointer is
// over; sidebar rows subscribe to render their drop highlight; and on drop
// the board reads the hovered target and performs the move through the
// EXISTING moveRecordToBoard action.
//
// This is deliberately separate from the sidebar's own native-HTML5 drags
// (board reorder, All Boards, nav links) — two different drag systems that
// cannot start simultaneously, so neither intercepts the other.
// ─────────────────────────────────────────────────────────────────────────

import { useSyncExternalStore } from 'react'

export type RecordDragHover = {
  hoverBoardId: string | null
  hoverBoardName: string | null
  /** A specific stage inside the hovered board's flyout (optional target). */
  hoverGroupId: string | null
  hoverGroupName: string | null
  /** A collapsed board-section header being hovered (dwell → auto-expand). */
  hoverSectionKey: string | null
  /** Pointer is anywhere over the app sidebar (drag preview goes compact). */
  overSidebar: boolean
}

export type RecordDragState = RecordDragHover & {
  recordId: string | null
  fromBoardId: string | null
  title: string | null
}

const IDLE: RecordDragState = {
  recordId: null, fromBoardId: null, title: null,
  hoverBoardId: null, hoverBoardName: null, hoverGroupId: null, hoverGroupName: null, hoverSectionKey: null,
  overSidebar: false,
}

let state: RecordDragState = IDLE
const listeners = new Set<() => void>()
function emit(next: RecordDragState) {
  state = next
  listeners.forEach((cb) => cb())
}

export function startRecordDrag(recordId: string, fromBoardId: string, title: string) {
  emit({ ...IDLE, recordId, fromBoardId, title })
}

export function setRecordDragHover(hover: RecordDragHover) {
  if (state.recordId == null) return
  if (
    state.hoverBoardId === hover.hoverBoardId &&
    state.hoverGroupId === hover.hoverGroupId &&
    state.hoverSectionKey === hover.hoverSectionKey &&
    state.overSidebar === hover.overSidebar
  ) return
  emit({ ...state, ...hover })
}

/** Clears the bridge and returns the final state (read the drop target from it). */
export function endRecordDrag(): RecordDragState {
  const last = state
  emit(IDLE)
  return last
}

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/** Live record-drag state for sidebar rows (server snapshot = idle). */
export function useRecordDrag(): RecordDragState {
  return useSyncExternalStore(subscribe, () => state, () => IDLE)
}
