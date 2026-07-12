/**
 * THE in-app drag primitive. One pointer-capture session (`startDragSession`)
 * owns the machinery every in-app drag shares — threshold, rAF-coalesced
 * moves, cursor/user-select chrome, ghost chip, Esc-as-top-escape-layer,
 * hint publishing, teardown — and a per-kind RESOLVER supplies the semantics:
 * what the pointer is over (`resolveMove` → DropHint) and what a release
 * does (`onCommit`). Pane/tab drags (below) are the first resolver; the
 * sidebar session drag (app/chat/session-drag.ts) is the second. Native
 * HTML5 DnD is reserved for true OS boundaries (Finder file drops) — in-app
 * drags never ride it, so no snap-back animation, no hostile-library
 * armor, and Esc aborts synchronously.
 *
 * Pane drags use the FancyZones engine (zones-engine.ts, ported verbatim):
 * sensitivity-radius hit testing, HighlightedZones state machine, Shift =
 * select-many (combined zone range), ClosestCenter primary on drop. The
 * LAYOUT STAYS FIXED and every zone lights up as a whole-region drop target;
 * NOTHING moves until release (tab reorder included — the strip shows an
 * insertion divider, not a live shuffle). Over a zone's TAB STRIP the drop
 * stacks at the divider's slot; elsewhere the radial position picks
 * center/edge.
 *
 * PERFORMANCE CONTRACT: the layout never restructures mid-drag, so every
 * rect a resolver needs is snapshotted once at drag start (zones AND tab
 * strips) and each pointermove is pure math against those caches — no
 * elementsFromPoint, no getBoundingClientRect, no style writes unless a
 * value actually changed. Moves are coalesced to one hit-test per animation
 * frame, with the pending move flushed synchronously on release so the drop
 * commits at the exact final position.
 */
import { ESCAPE_PRIORITY, pushEscapeLayer } from '@/lib/escape-layers';
import { reorderCommitHaptic, reorderStepHaptic } from '@/lib/reorder';
import { $dropHint, $treeDragging, mergeTreeZones, moveTreePane, reorderTreePane } from '../store';
import { HighlightedZones, primaryZone } from '../zones-engine';
const DRAG_THRESHOLD_PX = 4;
/** Normalized radius of the elliptical CENTER region (stack/link). Outside it
 *  the drop targets the dominant-axis edge — the boundary curves with the
 *  zone's aspect ratio instead of snapping at a rigid pixel band, and corners
 *  ease into their nearest edge along the quadrant diagonals. */
const CENTER_RADIUS = 0.62;
export function snapshotZones() {
    return [...document.querySelectorAll('[data-tree-group]')].map(el => {
        const r = el.getBoundingClientRect();
        return { id: el.dataset.treeGroup, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } };
    });
}
/** Radial drop position within `rect`: inside the center ellipse = the center
 *  action (stack/link); outside, the dominant axis picks the edge (VS Code
 *  dock-preview geometry). `centerRadius` sizes the ellipse — larger = more
 *  center, slimmer curved edge bands. */
export function radialPosition(rect, x, y, centerRadius = CENTER_RADIUS) {
    // Zone-centered coordinates, ±1 at the edge midpoints.
    const dx = ((x - rect.left) / Math.max(1, rect.right - rect.left)) * 2 - 1;
    const dy = ((y - rect.top) / Math.max(1, rect.bottom - rect.top)) * 2 - 1;
    if (Math.hypot(dx, dy) < centerRadius) {
        return 'center';
    }
    return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'top' : 'bottom');
}
/** Sub-zone drop position within the zone `groupId` (radial hit-testing). */
export function subZonePosition(zones, groupId, x, y) {
    const rect = zones.find(zone => zone.id === groupId)?.rect;
    return rect ? radialPosition(rect, x, y) : 'center';
}
const stripSlots = (strip) => [...strip.querySelectorAll('[data-tree-tab]')].map(tab => {
    const r = tab.getBoundingClientRect();
    return { id: tab.dataset.treeTab ?? '', mid: r.left + r.width / 2 };
});
/** Insertion slot from the pointer x against the OTHER tabs' midpoints:
 *  stack BEFORE the returned pane id (`null` = append). */
export function slotBefore(slots, x, excludePaneId = '') {
    for (const slot of slots) {
        if (slot.id === excludePaneId) {
            continue;
        }
        if (x < slot.mid) {
            return { before: slot.id };
        }
    }
    return { before: null };
}
export function snapshotStrips() {
    return [...document.querySelectorAll('[data-zone-tabstrip]')].map(el => {
        const r = el.getBoundingClientRect();
        return {
            groupId: el.dataset.zoneTabstrip,
            rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
            slots: stripSlots(el)
        };
    });
}
export const rectContains = (rect, x, y, pad = 0) => x >= rect.left - pad && x <= rect.right + pad && y >= rect.top - pad && y <= rect.bottom + pad;
const sameHint = (a, b) => a?.groupId === b?.groupId &&
    a?.pos === b?.pos &&
    a?.stack?.before === b?.stack?.before &&
    (a?.stack === undefined) === (b?.stack === undefined) &&
    (a?.groupIds?.length ?? 0) === (b?.groupIds?.length ?? 0) &&
    (a?.groupIds ?? []).every((id, i) => b?.groupIds?.[i] === id);
/** Double-tap detection for drag handles. Pane handles preventDefault
 *  pointerdown, which suppresses native `dblclick` — so rapid same-handle
 *  taps are detected here instead. */
const DOUBLE_TAP_MS = 400;
let lastTap = null;
/** The engaged drag's ghost chip: plain DOM (no React), themed via the same
 *  tokens as DropPill, moved with a transform — trivially cheap, and removal
 *  on Esc is synchronous. */
function createGhost(label) {
    const ghost = document.createElement('div');
    ghost.textContent = label;
    ghost.style.cssText =
        'position:fixed;left:0;top:0;z-index:9999;pointer-events:none;max-width:16rem;overflow:hidden;' +
            'text-overflow:ellipsis;white-space:nowrap;padding:0.25rem 0.75rem;border-radius:9999px;' +
            'border:1px solid color-mix(in srgb,var(--dt-composer-ring) 45%,transparent);' +
            'background:color-mix(in srgb,var(--dt-card) 92%,transparent);color:var(--ui-text-primary);' +
            'font-size:0.75rem;font-weight:500;box-shadow:0 4px 16px rgba(0,0,0,0.25);will-change:transform';
    document.body.appendChild(ghost);
    return ghost;
}
/** After an ENGAGED drag, the release still synthesizes a `click` on the
 *  capture element — swallow exactly that one so a drag can never double as
 *  an activation (row resume, tab close). Committed drags see the click in
 *  the same task burst as pointerup; an Esc abort's click arrives with the
 *  eventual release, so the trap disarms right after it. */
function suppressDragClick(committed) {
    const swallow = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    const disarm = () => window.setTimeout(() => window.removeEventListener('click', swallow, true), 0);
    if (committed) {
        disarm();
    }
    else {
        window.addEventListener('pointerup', disarm, { capture: true, once: true });
        window.addEventListener('pointercancel', disarm, { capture: true, once: true });
    }
}
/**
 * Begin a drag session from a handle's pointerdown. A sub-threshold release
 * is a click (`onTap` / `double.onDoubleTap`); past the threshold the spec's
 * resolver owns targeting and the machinery owns everything else. Esc aborts
 * instantly: the session registers as the TOP escape layer, tears down
 * synchronously, and nothing commits.
 */
export function startDragSession(e, spec) {
    if (e.button !== 0) {
        return;
    }
    const handle = e.currentTarget;
    const { pointerId } = e;
    const sx = e.clientX;
    const sy = e.clientY;
    const restoreCursor = document.body.style.cursor;
    const restoreSelect = document.body.style.userSelect;
    let engaged = false;
    let releaseEscapeLayer = null;
    let ghost = null;
    let cursor = null;
    // rAF-coalesced move processing: the raw handler only records the latest
    // point; all hit testing happens at most once per frame.
    let pending = null;
    let raf = 0;
    // Cursor writes are per-frame; only touch the style when the value changes.
    const setCursor = (value) => {
        if (cursor !== value) {
            cursor = value;
            document.body.style.cursor = value;
        }
    };
    const publishHint = (next) => {
        if (!sameHint($dropHint.get(), next)) {
            if (next?.stack !== undefined && $dropHint.get()?.stack?.before !== next.stack.before) {
                reorderStepHaptic();
            }
            $dropHint.set(next);
        }
    };
    const engage = (x, y) => {
        engaged = true;
        // Capture only once ENGAGED: pre-threshold pointer events must stay
        // untouched so a plain click on the handle (and its children — a row
        // body's own onClick) keeps working. Window-level listeners track the
        // gesture either way.
        try {
            handle.setPointerCapture?.(pointerId);
        }
        catch {
            // Synthetic events (automation) have no active pointer.
        }
        setCursor('grabbing');
        document.body.style.userSelect = 'none';
        // While dragging, Esc belongs to the drag ALONE — lower layers (edit
        // mode, overlays) must not also fire on the same press.
        releaseEscapeLayer = pushEscapeLayer(ESCAPE_PRIORITY.drag);
        if (spec.ghost) {
            ghost = createGhost(spec.ghost.label);
        }
        spec.onEngage(x, y);
    };
    const processMove = (x, y, shift) => {
        if (!engaged) {
            if (Math.hypot(x - sx, y - sy) < DRAG_THRESHOLD_PX) {
                return;
            }
            engage(x, y);
        }
        if (ghost) {
            ghost.style.transform = `translate3d(${x + 14}px, ${y + 12}px, 0)`;
        }
        const hint = spec.resolveMove(x, y, shift);
        // Over a deny area (no target — titlebar / statusbar / gutters /
        // off-window) the release cancels; the cursor says so up front.
        setCursor(hint ? 'grabbing' : 'no-drop');
        publishHint(hint);
    };
    const flushMove = () => {
        raf = 0;
        if (pending) {
            const { shift, x, y } = pending;
            pending = null;
            processMove(x, y, shift);
        }
    };
    const onMove = (ev) => {
        pending = { shift: ev.shiftKey, x: ev.clientX, y: ev.clientY };
        raf ||= requestAnimationFrame(flushMove);
    };
    const finish = (commit) => {
        if (raf) {
            cancelAnimationFrame(raf);
            raf = 0;
        }
        // The drop must land at the FINAL pointer position, not the last painted
        // frame's — flush the pending move before reading the hint. An abort
        // (Esc / pointercancel) skips it: everything is discarded anyway.
        if (commit) {
            flushMove();
        }
        document.body.style.cursor = restoreCursor;
        document.body.style.userSelect = restoreSelect;
        ghost?.remove();
        ghost = null;
        releaseEscapeLayer?.();
        releaseEscapeLayer = null;
        try {
            handle.releasePointerCapture?.(pointerId);
        }
        catch {
            // Mirror of the capture guard.
        }
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onCancel, true);
        window.removeEventListener('keydown', onKey, true);
        if (engaged) {
            suppressDragClick(commit);
            if (commit) {
                spec.onCommit($dropHint.get());
            }
        }
        else if (commit) {
            const now = Date.now();
            if (spec.double && lastTap?.key === spec.double.key && now - lastTap.time < DOUBLE_TAP_MS) {
                lastTap = null;
                spec.double.onDoubleTap();
            }
            else {
                lastTap = spec.double ? { key: spec.double.key, time: now } : null;
                spec.onTap?.();
            }
        }
        spec.onEnd?.();
        $dropHint.set(null);
        $treeDragging.set(null);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    // Esc aborts the drag — the target selection vanishes and nothing moves,
    // the universal "never mind" for an in-flight drag. Capture-phase + stop so
    // it doesn't also close a pane/overlay behind the drag (the escape layer
    // covers contract-following handlers; the stop covers the rest).
    const onKey = (ev) => {
        if (ev.key === 'Escape') {
            ev.preventDefault();
            ev.stopPropagation();
            finish(false);
        }
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
    window.addEventListener('keydown', onKey, true);
}
/** How far (px) the pointer may stray from the strip before a tab drag stops
 *  being a reorder and becomes a zone move (browser-tab tear-off feel). */
const TEAR_OFF_SLACK_PX = 18;
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
export function startPaneDrag(paneId, e, onTap, reorder, double) {
    if (e.button !== 0) {
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    const highlighted = new HighlightedZones();
    let zones = [];
    let strips = [];
    let mode = null;
    let dimmed = null;
    const markSource = () => {
        // The dragged tab dims for the drag's life — the divider says where it
        // GOES, the dim says what MOVES. No live shuffle (placement-on-release).
        dimmed ??= reorder?.strip.querySelector(`[data-tree-tab="${CSS.escape(paneId)}"]`) ?? null;
        dimmed?.style.setProperty('opacity', '0.45');
    };
    const enterZoneMode = () => {
        mode = 'zone';
        // The layout never restructures mid-drag, so zone/strip rects are stable.
        zones = snapshotZones();
        strips = snapshotStrips();
        $treeDragging.set(paneId);
        markSource();
    };
    // The reorder strip's geometry, snapshotted on first use (same fixed-layout
    // guarantee as the zone snapshots).
    let reorderSnap = null;
    const reorderStrip = () => {
        if (!reorderSnap) {
            const r = reorder.strip.getBoundingClientRect();
            reorderSnap = {
                rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
                slots: stripSlots(reorder.strip)
            };
        }
        return reorderSnap;
    };
    const withinStrip = (x, y) => Boolean(reorder) && rectContains(reorderStrip().rect, x, y, TEAR_OFF_SLACK_PX);
    startDragSession(e, {
        double,
        onTap,
        onEngage(x, y) {
            if (reorder && withinStrip(x, y)) {
                mode = 'reorder';
                markSource();
            }
            else {
                enterZoneMode();
            }
        },
        resolveMove(x, y, shift) {
            if (mode === 'reorder') {
                if (withinStrip(x, y)) {
                    return {
                        kind: 'group',
                        groupId: reorder.groupId,
                        groupIds: [reorder.groupId],
                        pos: 'center',
                        stack: slotBefore(reorderStrip().slots, x, paneId)
                    };
                }
                // Tear-off: the tab leaves the strip and becomes a zone move.
                enterZoneMode();
            }
            // The hint updates on highlight-set changes AND on sub-zone position
            // changes (center/edge regions within the same primary zone).
            const point = { x, y };
            highlighted.update(zones, point, shift);
            let groupIds = [...highlighted.zones()];
            // Spanning multiple zones is EXPLICIT (Shift). Without it, the seam-
            // proximity capture (sensitivity radius grabs both neighbors near a
            // shared edge) collapses to the primary zone — otherwise a drop near a
            // seam silently merges zones the user never asked to merge.
            if (!shift && groupIds.length > 1) {
                const collapsed = primaryZone(zones, groupIds, point);
                groupIds = collapsed ? [collapsed] : [];
            }
            const groupId = groupIds.length > 0 ? (primaryZone(zones, groupIds, point) ?? undefined) : undefined;
            // Over the target's TAB STRIP the drop stacks at the divider's slot;
            // sub-positions only make sense for a single-zone drop (a Shift-span
            // always merges, pos ignored).
            const strip = groupIds.length === 1 && groupId ? strips.find(s => s.groupId === groupId && rectContains(s.rect, x, y)) : null;
            const stack = strip ? slotBefore(strip.slots, x, paneId) : undefined;
            const pos = stack
                ? 'center'
                : groupIds.length === 1 && groupId
                    ? subZonePosition(zones, groupId, x, y)
                    : 'center';
            return groupIds.length > 0 ? { kind: 'group', groupId, groupIds, pos, stack } : null;
        },
        onCommit(hint) {
            if (mode === 'reorder' && reorder && hint?.stack !== undefined) {
                // Slot -> index among the OTHER tabs (reorderPaneInGroup inserts there).
                const others = [...reorder.strip.querySelectorAll('[data-tree-tab]')]
                    .map(el => el.dataset.treeTab)
                    .filter((id) => Boolean(id) && id !== paneId);
                const toIndex = hint.stack.before ? others.indexOf(hint.stack.before) : others.length;
                if (toIndex >= 0) {
                    reorderTreePane(reorder.groupId, paneId, toIndex);
                    reorderCommitHaptic();
                }
            }
            if (mode === 'zone') {
                // Drop what the hint SHOWS — the overlay and the commit share one
                // truth (the raw highlight set can hold both seam neighbors; the hint
                // already collapsed that to the primary unless Shift made the span
                // explicit).
                const targets = hint?.groupIds ?? [];
                if (targets.length > 1) {
                    // Shift-span: merge the highlighted zones, dropping the pane across them.
                    mergeTreeZones([...targets], paneId, hint?.groupId ?? null);
                }
                else if (hint?.groupId) {
                    // strip = stack at the divider slot; center = join the stack;
                    // an edge = split the zone and land there.
                    moveTreePane(paneId, { groupId: hint.groupId, pos: hint.pos ?? 'center', before: hint.stack?.before });
                }
            }
        },
        onEnd() {
            dimmed?.style.removeProperty('opacity');
            highlighted.reset();
        }
    });
}
