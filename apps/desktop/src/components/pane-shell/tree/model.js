/**
 * Layout tree model — the Dockview-style structure that replaces the
 * rails/bands grammar. Two node kinds:
 *
 *  - `split`: children laid out along an orientation with fractional weights.
 *  - `group`: a stack of panes (tabs) with one active; may be minimized to
 *    its header strip (DetailPane semantics).
 *
 * Everything the old grammar special-cased is just tree shape here: a "top row
 * spanning the right rail" is a column split; "a cell inside a column" is a
 * stacked group; spans fall out of tree position. All operations are pure and
 * return new trees; `normalize` keeps the structure canonical (no empty
 * groups, no single-child or same-orientation nested splits).
 */
let seq = 0;
export const nodeId = (kind) => `${kind}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
export const group = (panes, options) => ({
    type: 'group',
    id: options?.id ?? nodeId('g'),
    panes,
    active: options?.active ?? panes[0] ?? '',
    minimized: options?.minimized,
    headerHidden: options?.headerHidden
});
export const split = (orientation, children, weights, id) => ({
    type: 'split',
    id: id ?? nodeId('s'),
    orientation,
    children,
    weights: weights ?? children.map(() => 1)
});
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
export function findGroup(node, groupId) {
    if (node.type === 'group') {
        return node.id === groupId ? node : null;
    }
    for (const child of node.children) {
        const hit = findGroup(child, groupId);
        if (hit) {
            return hit;
        }
    }
    return null;
}
export function findGroupOfPane(node, paneId) {
    if (node.type === 'group') {
        return node.panes.includes(paneId) ? node : null;
    }
    for (const child of node.children) {
        const hit = findGroupOfPane(child, paneId);
        if (hit) {
            return hit;
        }
    }
    return null;
}
export function allPaneIds(node) {
    return node.type === 'group' ? [...node.panes] : node.children.flatMap(allPaneIds);
}
// ---------------------------------------------------------------------------
// Structural edits (pure)
// ---------------------------------------------------------------------------
/**
 * Canonical form: unwrap single-child splits, flatten same-orientation
 * nesting (weights scaled into the parent's slot), and PRUNE EMPTY GROUPS —
 * dragging the last pane out of a zone closes the zone and its siblings
 * absorb the space (VS Code semantics). Keeping empties as "stable regions"
 * (the original FancyZones rule) let invisible residue accumulate into
 * corrupt-feeling structure (`row([]|[])` eating half a slot); authored
 * empty zones still exist inside the zone editor's own grid model, and an
 * editor-applied tree keeps them until the first structural op.
 */
export function normalize(node) {
    if (node.type === 'group') {
        if (node.panes.length === 0) {
            return null;
        }
        const active = node.panes.includes(node.active) ? node.active : node.panes[0];
        // A header override only means something on a STACK. A zone at (or down
        // to) one pane returns to the contextual default — header hidden — so no
        // structural change ever leaves a stale lone-pane tab behind. (Double-
        // click reveal is an attribute edit, not structural; it survives until
        // the next move/split/merge.)
        const headerHidden = node.panes.length <= 1 ? undefined : node.headerHidden;
        if (active === node.active && headerHidden === node.headerHidden) {
            return node;
        }
        return { ...node, active, headerHidden };
    }
    const children = [];
    const weights = [];
    node.children.forEach((child, i) => {
        const kept = normalize(child);
        if (!kept) {
            return;
        }
        if (kept.type === 'split' && kept.orientation === node.orientation) {
            // Flatten: distribute this slot's weight across the flattened children
            // proportionally to their internal weights.
            const total = kept.weights.reduce((a, b) => a + b, 0) || 1;
            kept.children.forEach((grandchild, j) => {
                children.push(grandchild);
                weights.push((node.weights[i] ?? 1) * ((kept.weights[j] ?? 1) / total));
            });
            return;
        }
        children.push(kept);
        weights.push(node.weights[i] ?? 1);
    });
    if (children.length === 0) {
        return null;
    }
    if (children.length === 1) {
        return children[0];
    }
    return { ...node, children, weights };
}
/** Remove a pane wherever it lives. */
export function removePane(node, paneId) {
    const walk = (n) => {
        if (n.type === 'group') {
            if (!n.panes.includes(paneId)) {
                return n;
            }
            const panes = n.panes.filter(p => p !== paneId);
            return { ...n, panes, active: n.active === paneId ? panes[0] : n.active };
        }
        return { ...n, children: n.children.map(walk) };
    };
    return normalize(walk(node));
}
/**
 * Insert `paneId` at `target` group: `center` joins the stack (as a tab);
 * an edge splits the group in that direction. If the neighboring split
 * already runs in that orientation the new group is spliced in beside the
 * target instead of nesting (normalize would flatten it anyway).
 */
export function insertAtGroup(node, targetGroupId, paneId, pos, 
/** Center drops only: stack BEFORE this pane id (`null`/omitted = append) —
 *  the tab-strip insertion divider's slot. */
before) {
    const walk = (n) => {
        if (n.type === 'group') {
            if (n.id !== targetGroupId) {
                return n;
            }
            if (pos === 'center') {
                const at = before ? n.panes.indexOf(before) : -1;
                const panes = at >= 0 ? [...n.panes.slice(0, at), paneId, ...n.panes.slice(at)] : [...n.panes, paneId];
                // Gaining a pane clears an explicit header-hide: a stack you can't
                // see (or leave) is a trap, so the chips always come back on drop.
                return { ...n, panes, active: paneId, headerHidden: undefined };
            }
            const orientation = pos === 'left' || pos === 'right' ? 'row' : 'column';
            const leading = pos === 'left' || pos === 'top';
            const added = group([paneId]);
            const children = leading ? [added, n] : [n, added];
            return split(orientation, children, [1, 1]);
        }
        return { ...n, children: n.children.map(walk) };
    };
    return normalize(walk(node));
}
/**
 * The tree's VISIBLE shape: pane stacks + split orientations, with empty
 * groups skipped (editor-session trees may still hold them) and single-child
 * runs unwrapped. Two trees with equal signatures are indistinguishable on
 * screen regardless of node ids.
 */
function shapeSignature(node) {
    if (node.type === 'group') {
        return node.panes.length > 0 ? `[${node.panes.join(',')}]` : '';
    }
    const children = node.children.map(shapeSignature).filter(Boolean);
    if (children.length === 0) {
        return '';
    }
    return children.length === 1 ? children[0] : `${node.orientation}(${children.join('|')})`;
}
/**
 * Move = remove + insert. If the target group vanished during removal (the
 * pane was its only occupant), the move is a no-op. A move whose result
 * LOOKS identical to the current layout is also a no-op — e.g. a "split
 * bottom" drop onto the zone the pane already sits alone below would only
 * rebuild the same arrangement under a fresh zone id.
 */
export function movePane(root, paneId, target) {
    const from = findGroupOfPane(root, paneId);
    // No-op guards: dropping a pane onto its own single-pane group.
    if (from && from.id === target.groupId && from.panes.length === 1) {
        return root;
    }
    const without = removePane(root, paneId);
    if (!without) {
        // The pane was the only thing in the tree.
        return root;
    }
    if (!findGroup(without, target.groupId)) {
        return root;
    }
    const next = insertAtGroup(without, target.groupId, paneId, target.pos, target.before) ?? root;
    return shapeSignature(next) === shapeSignature(root) ? root : next;
}
/** Group ids of every leaf under a node, in tree order. */
export function groupLeafIds(node) {
    return node.type === 'group' ? [node.id] : node.children.flatMap(groupLeafIds);
}
function pathToGroup(node, groupId) {
    if (node.type === 'group') {
        return node.id === groupId ? [node] : null;
    }
    for (const child of node.children) {
        const sub = pathToGroup(child, groupId);
        if (sub) {
            return [node, ...sub];
        }
    }
    return null;
}
const OPPOSITE_EDGE = { bottom: 'top', left: 'right', right: 'left', top: 'bottom' };
/** The viable group touching `edge` of this subtree. Along the edge's axis
 *  children are scanned edge-first — a non-viable zone is display:none, so the
 *  next sibling IS the visual edge; across it, every child touches the edge. */
function edgeGroup(node, edge, viable) {
    if (node.type === 'group') {
        return viable(node) ? node : null;
    }
    const along = (node.orientation === 'row') === (edge === 'left' || edge === 'right');
    const children = along && (edge === 'right' || edge === 'bottom') ? [...node.children].reverse() : node.children;
    for (const child of children) {
        const hit = edgeGroup(child, edge, viable);
        if (hit) {
            return hit;
        }
    }
    return null;
}
/**
 * The viable zone VISUALLY adjacent to `groupId` on `side` (the target of the
 * zone menu's "Move left/right/up/down"). Walks up to the nearest ancestor
 * split running along that axis with a sibling on that side, then descends to
 * the sibling's closest viable leaf; subtrees whose every zone fails `viable`
 * (all panes hidden) are skipped, matching their collapsed rendering.
 */
export function adjacentGroup(root, groupId, side, viable) {
    const path = pathToGroup(root, groupId);
    if (!path) {
        return null;
    }
    const orientation = side === 'left' || side === 'right' ? 'row' : 'column';
    const forward = side === 'right' || side === 'bottom';
    for (let i = path.length - 2; i >= 0; i--) {
        const parent = path[i];
        if (parent.type !== 'split' || parent.orientation !== orientation) {
            continue;
        }
        const index = parent.children.indexOf(path[i + 1]);
        const siblings = forward
            ? parent.children.slice(index + 1)
            : parent.children.slice(0, index).reverse();
        for (const sibling of siblings) {
            const hit = edgeGroup(sibling, OPPOSITE_EDGE[side], viable);
            if (hit) {
                return hit;
            }
        }
    }
    return null;
}
function sameSet(ids, set) {
    return ids.length === set.size && ids.every(id => set.has(id));
}
/** The node whose complete leaf set equals `set` (a rectangular region in a
 *  guillotine tree is always exactly one subtree), or null. */
function findCover(node, set) {
    if (sameSet(groupLeafIds(node), set)) {
        return node;
    }
    if (node.type === 'split') {
        for (const child of node.children) {
            const hit = findCover(child, set);
            if (hit) {
                return hit;
            }
        }
    }
    return null;
}
/**
 * FancyZones span: merge the highlighted zones into ONE group holding
 * `paneId`, absorbing any panes that lived in those zones as tabs. Only works
 * when the highlighted set forms a rectangular subtree (it always does for a
 * combined zone range on a guillotine tree); returns null otherwise so the
 * caller can fall back to a single-zone drop.
 */
export function mergeZonesWithPane(root, groupIds, paneId) {
    const set = new Set(groupIds);
    if (set.size <= 1 || !findCover(root, set)) {
        return null;
    }
    // Panes from the merged zones (tree order), minus the dragged one.
    const panesInSet = [];
    const collect = (n) => {
        if (n.type === 'group') {
            if (set.has(n.id)) {
                panesInSet.push(...n.panes.filter(p => p !== paneId));
            }
        }
        else {
            n.children.forEach(collect);
        }
    };
    collect(root);
    // If the dragged pane lives OUTSIDE the merged set, pull it from its origin
    // first (leaving that origin an empty zone). Inside the set it's absorbed.
    const origin = findGroupOfPane(root, paneId);
    let working = root;
    if (origin && !set.has(origin.id)) {
        working = removePane(root, paneId) ?? root;
    }
    const merged = group([paneId, ...panesInSet]);
    const replace = (n) => {
        if (sameSet(groupLeafIds(n), set)) {
            return merged;
        }
        return n.type === 'split' ? { ...n, children: n.children.map(replace) } : n;
    };
    return normalize(replace(working));
}
// ---------------------------------------------------------------------------
// Attribute edits
// ---------------------------------------------------------------------------
function mapGroups(node, fn) {
    return node.type === 'group' ? fn(node) : { ...node, children: node.children.map(c => mapGroups(c, fn)) };
}
export function setActivePane(root, groupId, paneId) {
    return mapGroups(root, g => (g.id === groupId && g.panes.includes(paneId) ? { ...g, active: paneId } : g));
}
/** Reorder a pane within its group's tab stack (browser-tab drag semantics). */
export function reorderPaneInGroup(root, groupId, paneId, toIndex) {
    return mapGroups(root, g => {
        if (g.id !== groupId || !g.panes.includes(paneId)) {
            return g;
        }
        const without = g.panes.filter(p => p !== paneId);
        const index = Math.max(0, Math.min(without.length, toIndex));
        const panes = [...without.slice(0, index), paneId, ...without.slice(index)];
        return { ...g, panes };
    });
}
export function setGroupMinimized(root, groupId, minimized) {
    return mapGroups(root, g => (g.id === groupId ? { ...g, minimized } : g));
}
export function setGroupHeaderHidden(root, groupId, headerHidden) {
    return mapGroups(root, g => (g.id === groupId ? { ...g, headerHidden } : g));
}
function replaceNode(node, id, make) {
    if (node.type === 'group') {
        return node.id === id ? make(node) : node;
    }
    return { ...node, children: node.children.map(c => replaceNode(c, id, make)) };
}
/**
 * Split a zone: `movePaneId` (one of SEVERAL panes in the group) moves into
 * the new zone on `side` — VS Code "split right", split and move in one
 * gesture. A lone pane can't split away from itself: no-op (normalize prunes
 * the empty zone the split would have minted).
 */
export function splitGroupZone(root, groupId, side, movePaneId) {
    const orientation = side === 'left' || side === 'right' ? 'row' : 'column';
    const before = side === 'left' || side === 'top';
    return (normalize(replaceNode(root, groupId, g => {
        if (g.panes.length < 2 || !g.panes.includes(movePaneId)) {
            return g;
        }
        const added = group([movePaneId]);
        const remaining = { ...g, panes: g.panes.filter(p => p !== movePaneId) };
        return split(orientation, before ? [added, remaining] : [remaining, added], [1, 1]);
    })) ?? root);
}
/** Mirror the layout HORIZONTALLY (the titlebar flip toggle / ⌘\): reverse
 *  every ROW split's child order at EVERY depth, so left↔right flips
 *  everywhere. A right rail lands on the left with its OWN internal order
 *  mirrored too — so preview stays directly beside the file tree instead of
 *  jumping to the far edge (a shallow root-only reverse left nested rails in
 *  place). COLUMN splits keep their top↔bottom order (the terminal stays at
 *  the bottom). Its own involution: flipping twice is the identity. */
export function mirrorTreeHorizontal(root) {
    if (root.type === 'group') {
        return root;
    }
    const children = root.children.map(mirrorTreeHorizontal);
    return root.orientation === 'row'
        ? { ...root, children: children.reverse(), weights: [...root.weights].reverse() }
        : { ...root, children };
}
export function setSplitWeights(root, splitId, weights) {
    if (root.type === 'split') {
        if (root.id === splitId) {
            return { ...root, weights };
        }
        return { ...root, children: root.children.map(c => setSplitWeights(c, splitId, weights)) };
    }
    return root;
}
// ---------------------------------------------------------------------------
// Validation (persisted trees are untrusted)
// ---------------------------------------------------------------------------
export function isLayoutNode(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const n = value;
    if (n.type === 'group') {
        return (typeof n.id === 'string' &&
            Array.isArray(n.panes) &&
            n.panes.every(p => typeof p === 'string') &&
            typeof n.active === 'string');
    }
    if (n.type === 'split') {
        return (typeof n.id === 'string' &&
            (n.orientation === 'row' || n.orientation === 'column') &&
            Array.isArray(n.children) &&
            n.children.length > 0 &&
            n.children.every(isLayoutNode) &&
            Array.isArray(n.weights) &&
            n.weights.length === n.children.length &&
            n.weights.every(w => typeof w === 'number' && Number.isFinite(w) && w > 0));
    }
    return false;
}
