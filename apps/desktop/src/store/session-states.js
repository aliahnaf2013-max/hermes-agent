/**
 * MULTI-SESSION VIEW STATE — the reactive face of the per-runtime session
 * cache (`sessionStateByRuntimeIdRef` in use-session-state-cache).
 *
 * The cache already ingests EVERY session's gateway events; only the view
 * was single-session ($messages + the active-id gate). This store mirrors
 * the cache per runtime id so any number of surfaces (session tiles, future
 * pane windows) can each subscribe to one session's state without touching
 * the main chat's `$messages` pipeline — same pattern as `useSessionSlice`
 * over `$todosBySession`, applied to whole `ClientSessionState`s.
 *
 * TILES are the first consumer: sessions opened side-by-side with the main
 * thread, each in its own layout-tree pane. `$sessionTiles` holds the
 * stored-session ids (persisted — tiles survive restarts); the wiring layer
 * owns resume/submit (it has the gateway + cache internals) and registers
 * itself here as the delegate so tile UI stays dependency-light.
 */
import { atom } from 'nanostores';
import { readJson, writeJson } from '@/lib/storage';
import { $activeProfile, normalizeProfileKey } from './profile';
// ---------------------------------------------------------------------------
// Reactive per-runtime session state (view mirror of the wiring cache).
// ---------------------------------------------------------------------------
export const $sessionStates = atom({});
/** Publish one session's state (immutable per-key — slices stay stable). */
export function publishSessionState(runtimeId, state) {
    $sessionStates.set({ ...$sessionStates.get(), [runtimeId]: state });
}
export function dropSessionState(runtimeId) {
    const current = $sessionStates.get();
    if (!(runtimeId in current)) {
        return;
    }
    const { [runtimeId]: _dropped, ...rest } = current;
    $sessionStates.set(rest);
}
// Tiles are persisted PER PROFILE: a session belongs to one profile, and the
// single live gateway is scoped to one profile at a time, so a tile only makes
// sense while its profile is active. Switching profiles swaps the visible set
// (and drops runtime bindings so each tile re-resumes against the now-current
// gateway — which also settles the "tile resumes against the wrong backend" and
// "stale runtime after respawn" bugs by construction).
const TILES_KEY = 'hermes.desktop.sessionTiles.v2';
const LEGACY_TILES_KEY = 'hermes.desktop.sessionTiles.v1';
const toStored = (t) => ({ dir: t.dir, storedSessionId: t.storedSessionId });
function parseTileList(value) {
    return Array.isArray(value)
        ? value
            .filter((t) => Boolean(t && typeof t.storedSessionId === 'string'))
            .map(toStored)
        : [];
}
function loadTilesByProfile() {
    const byProfile = {};
    const parsed = readJson(TILES_KEY);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [profile, list] of Object.entries(parsed)) {
            const tiles = parseTileList(list);
            if (tiles.length > 0) {
                byProfile[normalizeProfileKey(profile)] = tiles;
            }
        }
    }
    // Migrate a v1 flat list into the default profile, then retire the key.
    const legacy = parseTileList(readJson(LEGACY_TILES_KEY));
    if (legacy.length > 0) {
        const key = normalizeProfileKey('default');
        byProfile[key] = [...(byProfile[key] ?? []), ...legacy];
    }
    writeJson(LEGACY_TILES_KEY, null);
    return byProfile;
}
const tilesByProfile = loadTilesByProfile();
const profileKey = () => normalizeProfileKey($activeProfile.get());
// Runtime ids are process-scoped — never trust a persisted one, so the live
// atom hydrates from the stored (runtime-less) tiles for the active profile.
export const $sessionTiles = atom([...(tilesByProfile[profileKey()] ?? [])]);
function persistTiles() {
    writeJson(TILES_KEY, Object.keys(tilesByProfile).length === 0 ? null : tilesByProfile);
}
function saveTiles(tiles) {
    $sessionTiles.set(tiles);
    const stored = tiles.map(toStored);
    if (stored.length > 0) {
        tilesByProfile[profileKey()] = stored;
    }
    else {
        delete tilesByProfile[profileKey()];
    }
    persistTiles();
}
// Profile switch: surface the new profile's tiles with runtime ids cleared so
// they re-resume against the now-current gateway. (Fires immediately on
// subscribe; harmless — the init value already matches.)
$activeProfile.subscribe(() => {
    $sessionTiles.set([...(tilesByProfile[profileKey()] ?? [])]);
});
export function patchSessionTile(storedSessionId, patch) {
    saveTiles($sessionTiles.get().map(t => (t.storedSessionId === storedSessionId ? { ...t, ...patch } : t)));
}
/** Drop live runtime bindings so every tile re-resumes — used on gateway
 *  reconnect, where a respawned backend re-mints (recycles) runtime ids. */
export function resetTileRuntimeBindings() {
    const tiles = $sessionTiles.get();
    if (tiles.some(t => t.runtimeId)) {
        $sessionTiles.set(tiles.map(toStored));
    }
}
let delegate = null;
export function setSessionTileDelegate(next) {
    delegate = next;
}
export function sessionTileDelegate() {
    return delegate;
}
/** Open (or front) a tile for a stored session, docked on `dir` (default
 *  right; `center` = stack into the anchor's zone, `before` = strip slot).
 *  Idempotent — an already-open tile keeps its original placement. */
export function openSessionTile(storedSessionId, dir = 'right', anchor, before) {
    const tiles = $sessionTiles.get();
    if (!tiles.some(t => t.storedSessionId === storedSessionId)) {
        saveTiles([...tiles, { anchor, before, dir, storedSessionId }]);
    }
}
export function closeSessionTile(storedSessionId) {
    saveTiles($sessionTiles.get().filter(t => t.storedSessionId !== storedSessionId));
}
// Dev hook for automation (mirrors __HERMES_LAYOUT_TREE__).
if (import.meta.env.DEV && typeof window !== 'undefined') {
    ;
    window.__HERMES_SESSION_TILES__ = {
        close: closeSessionTile,
        open: openSessionTile,
        patch: patchSessionTile,
        publish: publishSessionState,
        states: () => $sessionStates.get(),
        tiles: () => $sessionTiles.get()
    };
}
