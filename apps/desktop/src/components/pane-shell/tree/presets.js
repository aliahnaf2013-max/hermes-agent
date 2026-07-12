/**
 * Layout presets — the FancyZones treatment.
 *
 * A preset is a CONTRIBUTION (`area: 'layouts'`, `data: LayoutNode`): the app
 * registers its bundled presets as `source: 'core'`, plugins register theirs
 * exactly the same way, and user-saved presets round-trip through localStorage
 * and re-register as `source: 'user'`. The picker (renderer.tsx) reads one
 * uniform list via `useContributions('layouts')`.
 */
import { registry } from '@/contrib/registry';
import { readJson, writeJson, writeKey } from '@/lib/storage';
import { isLayoutNode } from './model';
import { $layoutTree, applyTree, markActivePreset } from './store';
export const LAYOUTS_AREA = 'layouts';
// v2: v1 presets predate semantic placement (see store.ts) — retire them.
const USER_KEY = 'hermes.desktop.layoutPresets.v2';
writeKey('hermes.desktop.layoutPresets.v1', null);
const userDisposers = new Map();
function loadUserPresets() {
    const parsed = readJson(USER_KEY) ?? {};
    const out = {};
    for (const [id, preset] of Object.entries(parsed)) {
        if (preset && typeof preset.name === 'string' && isLayoutNode(preset.tree)) {
            out[id] = preset;
        }
    }
    return out;
}
function persistUserPresets(presets) {
    writeJson(USER_KEY, presets);
}
function registerUserPreset(id, preset) {
    userDisposers.get(id)?.();
    userDisposers.set(id, registry.register({ id, area: LAYOUTS_AREA, source: 'user', title: preset.name, data: preset.tree }));
}
// Register persisted user presets at module load.
const userPresets = loadUserPresets();
for (const [id, preset] of Object.entries(userPresets)) {
    registerUserPreset(id, preset);
}
/** Save any tree as a named user preset (and make it active). */
export function saveLayoutPresetTree(name, tree) {
    const trimmed = name.trim();
    if (!tree || !trimmed) {
        return null;
    }
    const id = `user-${trimmed
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || Date.now().toString(36)}`;
    userPresets[id] = { name: trimmed, tree };
    persistUserPresets(userPresets);
    registerUserPreset(id, userPresets[id]);
    markActivePreset(id);
    return id;
}
/** Save the CURRENT tree as a named user preset (and make it active). */
export function saveCurrentLayoutAs(name) {
    const tree = $layoutTree.get();
    if (tree) {
        saveLayoutPresetTree(name, tree);
    }
}
export function deleteUserPreset(id) {
    if (!(id in userPresets)) {
        return;
    }
    delete userPresets[id];
    persistUserPresets(userPresets);
    userDisposers.get(id)?.();
    userDisposers.delete(id);
}
export const isUserPreset = (id) => id in userPresets;
/** Apply a preset's tree (deep-cloned so live edits never mutate the preset). */
export function applyLayoutPreset(id, tree) {
    applyTree(structuredClone(tree), id);
}
