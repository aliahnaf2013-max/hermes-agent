/**
 * Pane drag session — the FancyZones engine (zones-engine.ts, ported
 * verbatim): sensitivity-radius hit testing, HighlightedZones state machine,
 * Shift = select-many (combined zone range), ClosestCenter primary on drop.
 *
 * Dragging is FancyZones-style: the LAYOUT STAYS FIXED and every zone lights
 * up as a whole-region drop target; NOTHING moves until release (tab reorder
 * included — the strip shows an insertion divider, not a live shuffle).
 * Esc aborts. Over a zone's TAB STRIP the drop stacks at the divider's slot;
 * elsewhere in the zone the radial position picks center/edge. Pointer-
 * capture based.
 */

import type { PointerEvent as ReactPointerEvent } from 'react'

import { reorderCommitHaptic, reorderStepHaptic } from '@/lib/reorder'

import type { DropPosition } from '../model'
import { $dropHint, $treeDragging, type DropHint, mergeTreeZones, moveTreePane, reorderTreePane } from '../store'
import { type EngineZone, HighlightedZones, primaryZone } from '../zones-engine'

const DRAG_THRESHOLD_PX = 4

/** Normalized radius of the elliptical CENTER region (stack/link). Outside it
 *  the drop targets the dominant-axis edge — the boundary curves with the
 *  zone's aspect ratio instead of snapping at a rigid pixel band, and corners
 *  ease into their nearest edge along the quadrant diagonals. */
const CENTER_RADIUS = 0.62

export function snapshotZones(): EngineZone[] {
  return [...document.querySelectorAll<HTMLElement>('[data-tree-group]')].map(el => {
    const r = el.getBoundingClientRect()

    return { id: el.dataset.treeGroup!, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }
  })
}

/** Radial drop position within `rect`: inside the center ellipse = the center
 *  action (stack/link); outside, the dominant axis picks the edge (VS Code
 *  dock-preview geometry). `centerRadius` sizes the ellipse — larger = more
 *  center, slimmer curved edge bands. */
export function radialPosition(
  rect: { left: number; top: number; right: number; bottom: number },
  x: number,
  y: number,
  centerRadius = CENTER_RADIUS
): DropPosition {
  // Zone-centered coordinates, ±1 at the edge midpoints.
  const dx = ((x - rect.left) / Math.max(1, rect.right - rect.left)) * 2 - 1
  const dy = ((y - rect.top) / Math.max(1, rect.bottom - rect.top)) * 2 - 1

  if (Math.hypot(dx, dy) < centerRadius) {
    return 'center'
  }

  return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'top' : 'bottom')
}

/** Sub-zone drop position within the zone `groupId` (radial hit-testing). */
export function subZonePosition(zones: EngineZone[], groupId: string, x: number, y: number): DropPosition {
  const rect = zones.find(zone => zone.id === groupId)?.rect

  return rect ? radialPosition(rect, x, y) : 'center'
}

const stripFor = (groupId: string) =>
  document.querySelector<HTMLElement>(`[data-zone-tabstrip="${CSS.escape(groupId)}"]`)

/** Insertion slot within a strip from the pointer x against the OTHER tabs'
 *  midpoints: stack BEFORE the returned pane id (`null` = append). */
function slotBefore(strip: HTMLElement, x: number, excludePaneId: string): { before: null | string } {
  for (const tab of strip.querySelectorAll<HTMLElement>('[data-tree-tab]')) {
    if (tab.dataset.treeTab === excludePaneId) {
      continue
    }

    const r = tab.getBoundingClientRect()

    if (x < r.left + r.width / 2) {
      return { before: tab.dataset.treeTab ?? null }
    }
  }

  return { before: null }
}

/** The insertion slot when the pointer is over `groupId`'s tab strip;
 *  `undefined` when it isn't. A drop on the strip STACKS at that slot — the
 *  strip is where tabs live, so it wins over the radial top-edge band that
 *  would otherwise read as "split top". */
function stripSlotAt(
  groupId: string,
  x: number,
  y: number,
  excludePaneId: string
): undefined | { before: null | string } {
  const overStrip = document
    .elementsFromPoint(x, y)
    .some(el => el instanceof HTMLElement && el.closest(`[data-zone-tabstrip="${CSS.escape(groupId)}"]`) !== null)

  const strip = overStrip ? stripFor(groupId) : null

  return strip ? slotBefore(strip, x, excludePaneId) : undefined
}

const sameHint = (a: DropHint | null, b: DropHint | null) =>
  a?.groupId === b?.groupId &&
  a?.pos === b?.pos &&
  a?.stack?.before === b?.stack?.before &&
  (a?.stack === undefined) === (b?.stack === undefined) &&
  (a?.groupIds?.length ?? 0) === (b?.groupIds?.length ?? 0) &&
  (a?.groupIds ?? []).every((id, i) => b?.groupIds?.[i] === id)

interface ReorderContext {
  groupId: string
  /** The tab-strip element; tabs carry `data-tree-tab={paneId}`. */
  strip: HTMLElement
}

/** How far (px) the pointer may stray from the strip before a tab drag stops
 *  being a reorder and becomes a zone move (browser-tab tear-off feel). */
const TEAR_OFF_SLACK_PX = 18

/** Double-tap detection for drag handles. The drag session preventDefaults
 *  pointerdown, which suppresses native `dblclick` — so rapid same-handle
 *  taps are detected here instead. */
const DOUBLE_TAP_MS = 400
let lastTap: { key: string; time: number } | null = null

export interface DoubleTapContext {
  /** Two sub-threshold releases with the same key within DOUBLE_TAP_MS. */
  key: string
  onDoubleTap: () => void
}

/**
 * Begin a pane drag from any handle. A sub-threshold release is a click
 * (`onTap`, used to activate tabs; rapid repeat fires `double.onDoubleTap`
 * instead). With a `reorder` context (tab drags), movement inside the strip
 * targets an insertion slot — the strip renders a divider at it, NOTHING
 * moves until release (placement-on-release, like every other drop); tearing
 * away from the strip converts the drag into a zone move. Zone mode: zones
 * light up, the target's tab strip stacks at its divider slot, Shift extends
 * the highlight range, release drops into the ClosestCenter primary zone.
 * Esc aborts either mode.
 */
export function startPaneDrag(
  paneId: string,
  e: ReactPointerEvent<HTMLElement>,
  onTap?: () => void,
  reorder?: ReorderContext,
  double?: DoubleTapContext
) {
  if (e.button !== 0) {
    return
  }

  e.preventDefault()
  e.stopPropagation()

  const handle = e.currentTarget
  const { pointerId } = e
  const sx = e.clientX
  const sy = e.clientY
  const restoreCursor = document.body.style.cursor
  const restoreSelect = document.body.style.userSelect
  const highlighted = new HighlightedZones()
  let zones: EngineZone[] = []
  let lastPoint = { x: sx, y: sy }
  let mode: 'idle' | 'reorder' | 'zone' = 'idle'
  let dimmed: HTMLElement | null = null

  try {
    handle.setPointerCapture?.(pointerId)
  } catch {
    // Synthetic events (automation) have no active pointer.
  }

  const publishHint = (next: DropHint | null) => {
    if (!sameHint($dropHint.get(), next)) {
      if (next?.stack !== undefined && $dropHint.get()?.stack?.before !== next.stack.before) {
        reorderStepHaptic()
      }

      $dropHint.set(next)
    }
  }

  const startDragChrome = () => {
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
    // The dragged tab dims for the drag's life — the divider says where it
    // GOES, the dim says what MOVES. No live shuffle (placement-on-release).
    dimmed = reorder?.strip.querySelector<HTMLElement>(`[data-tree-tab="${CSS.escape(paneId)}"]`) ?? null
    dimmed?.style.setProperty('opacity', '0.45')
  }

  const enterZoneMode = () => {
    mode = 'zone'
    // The layout never restructures mid-drag, so zone rects are stable.
    zones = snapshotZones()
    $treeDragging.set(paneId)
    startDragChrome()
  }

  const enterReorderMode = () => {
    mode = 'reorder'
    startDragChrome()
  }

  const withinStrip = (x: number, y: number) => {
    if (!reorder) {
      return false
    }

    const r = reorder.strip.getBoundingClientRect()

    return (
      x >= r.left - TEAR_OFF_SLACK_PX &&
      x <= r.right + TEAR_OFF_SLACK_PX &&
      y >= r.top - TEAR_OFF_SLACK_PX &&
      y <= r.bottom + TEAR_OFF_SLACK_PX
    )
  }

  const onMove = (ev: PointerEvent) => {
    lastPoint = { x: ev.clientX, y: ev.clientY }

    if (mode === 'idle') {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_THRESHOLD_PX) {
        return
      }

      if (reorder && withinStrip(ev.clientX, ev.clientY)) {
        enterReorderMode()
      } else {
        enterZoneMode()
      }
    }

    if (mode === 'reorder') {
      if (!withinStrip(ev.clientX, ev.clientY)) {
        // Tear-off: the tab leaves the strip and becomes a zone move.
        enterZoneMode()
      } else {
        publishHint({
          kind: 'group',
          groupId: reorder!.groupId,
          groupIds: [reorder!.groupId],
          pos: 'center',
          stack: slotBefore(reorder!.strip, ev.clientX, paneId)
        })

        return
      }
    }

    // The hint updates on highlight-set changes AND on sub-zone position
    // changes (center/edge regions within the same primary zone).
    highlighted.update(zones, lastPoint, ev.shiftKey)
    let groupIds = [...highlighted.zones()]

    // Spanning multiple zones is EXPLICIT (Shift). Without it, the seam-
    // proximity capture (sensitivity radius grabs both neighbors near a
    // shared edge) collapses to the primary zone — otherwise a drop near a
    // seam silently merges zones the user never asked to merge.
    if (!ev.shiftKey && groupIds.length > 1) {
      const collapsed = primaryZone(zones, groupIds, lastPoint)
      groupIds = collapsed ? [collapsed] : []
    }

    const groupId = groupIds.length > 0 ? (primaryZone(zones, groupIds, lastPoint) ?? undefined) : undefined

    // Over the target's TAB STRIP the drop stacks at the divider's slot;
    // sub-positions only make sense for a single-zone drop (a Shift-span
    // always merges, pos ignored).
    const stack =
      groupIds.length === 1 && groupId ? stripSlotAt(groupId, lastPoint.x, lastPoint.y, paneId) : undefined

    const pos: DropPosition = stack
      ? 'center'
      : groupIds.length === 1 && groupId
        ? subZonePosition(zones, groupId, lastPoint.x, lastPoint.y)
        : 'center'

    const next: DropHint | null = groupIds.length > 0 ? { kind: 'group', groupId, groupIds, pos, stack } : null

    // Over a deny area (no zone — titlebar / statusbar / gutters / off-window)
    // the release cancels; the cursor says so up front. Every real zone is a
    // valid target, so `grabbing` elsewhere.
    document.body.style.cursor = next ? 'grabbing' : 'no-drop'

    publishHint(next)
  }

  const finish = (commit: boolean) => {
    document.body.style.cursor = restoreCursor
    document.body.style.userSelect = restoreSelect
    dimmed?.style.removeProperty('opacity')

    try {
      handle.releasePointerCapture?.(pointerId)
    } catch {
      // Mirror of the capture guard.
    }

    window.removeEventListener('pointermove', onMove, true)
    window.removeEventListener('pointerup', onUp, true)
    window.removeEventListener('pointercancel', onCancel, true)
    window.removeEventListener('keydown', onKey, true)

    const hint = $dropHint.get()

    if (commit && mode === 'reorder' && reorder && hint?.stack !== undefined) {
      // Slot -> index among the OTHER tabs (reorderPaneInGroup inserts there).
      const others = [...reorder.strip.querySelectorAll<HTMLElement>('[data-tree-tab]')]
        .map(el => el.dataset.treeTab)
        .filter((id): id is string => Boolean(id) && id !== paneId)

      const toIndex = hint.stack.before ? others.indexOf(hint.stack.before) : others.length

      if (toIndex >= 0) {
        reorderTreePane(reorder.groupId, paneId, toIndex)
        reorderCommitHaptic()
      }
    }

    if (commit && mode === 'zone') {
      // Drop what the hint SHOWS — the overlay and the commit share one truth
      // (the raw highlight set can hold both seam neighbors; the hint already
      // collapsed that to the primary unless Shift made the span explicit).
      const targets = hint?.groupIds ?? []

      if (targets.length > 1) {
        // Shift-span: merge the highlighted zones, dropping the pane across them.
        mergeTreeZones([...targets], paneId, hint?.groupId ?? null)
      } else if (hint?.groupId) {
        // strip = stack at the divider slot; center = join the stack;
        // an edge = split the zone and land there.
        moveTreePane(paneId, { groupId: hint.groupId, pos: hint.pos ?? 'center', before: hint.stack?.before })
      }
    }

    if (mode === 'idle' && commit) {
      const now = Date.now()

      if (double && lastTap?.key === double.key && now - lastTap.time < DOUBLE_TAP_MS) {
        lastTap = null
        double.onDoubleTap()
      } else {
        lastTap = double ? { key: double.key, time: now } : null
        onTap?.()
      }
    }

    highlighted.reset()
    $dropHint.set(null)
    $treeDragging.set(null)
  }

  const onUp = () => finish(true)
  const onCancel = () => finish(false)

  // Esc aborts the drag — the zone selection vanishes and nothing moves, the
  // universal "never mind" for an in-flight drag. Capture-phase + stop so it
  // doesn't also close a pane/overlay behind the drag.
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      ev.preventDefault()
      ev.stopPropagation()
      finish(false)
    }
  }

  window.addEventListener('pointermove', onMove, true)
  window.addEventListener('pointerup', onUp, true)
  window.addEventListener('pointercancel', onCancel, true)
  window.addEventListener('keydown', onKey, true)
}
