import { atom } from 'nanostores';
import { readJson, writeJson } from '@/lib/storage';
const TILES_KEY = 'hermes.desktop.routeTiles.v1';
function loadTiles() {
    const parsed = readJson(TILES_KEY);
    return Array.isArray(parsed)
        ? parsed
            .filter((t) => Boolean(t && typeof t.path === 'string'))
            .map(t => ({ dir: t.dir, path: t.path }))
        : [];
}
export const $routeTiles = atom(loadTiles());
function saveTiles(tiles) {
    $routeTiles.set(tiles);
    writeJson(TILES_KEY, tiles.length === 0 ? null : tiles);
}
/** Open (or front) a page tile for a route, docked on `dir` (default right).
 *  Idempotent — an already-open tile keeps its original edge. */
export function openRouteTile(path, dir = 'right') {
    const tiles = $routeTiles.get();
    if (!tiles.some(t => t.path === path)) {
        saveTiles([...tiles, { dir, path }]);
    }
}
export function closeRouteTile(path) {
    saveTiles($routeTiles.get().filter(t => t.path !== path));
}
