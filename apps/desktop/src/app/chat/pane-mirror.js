/**
 * Mirror a reactive list of "tiles" into layout-tree pane contributions:
 * register a pane per tile, refresh its title in place, and dispose panes whose
 * tile is gone. This is the shared bookkeeping — a keyed registry, a wanted-set
 * diff, a one-time pane closer — behind BOTH session tiles and route (page)
 * tiles; each supplies only what differs (key, title, render, close, edge).
 */
import { registerPaneCloser, removeTreePane } from '@/components/pane-shell/tree/store';
import { registry } from '@/contrib/registry';
/** Build a `watch*` fn: syncs once, then re-syncs on every source/also change.
 *  Module-level state lives in the returned closure, so call it once per app. */
export function paneMirror(cfg) {
    const registered = new Map();
    const paneId = (key) => `${cfg.prefix}:${key}`;
    const sync = () => {
        const tiles = cfg.source.get();
        const wanted = new Set(tiles.map(cfg.key));
        for (const tile of tiles) {
            const key = cfg.key(tile);
            const title = cfg.title(key);
            const current = registered.get(key);
            // register() replaces same-id in place — safe for live title refreshes.
            if (current && current.title === title) {
                continue;
            }
            const dispose = registry.register({
                id: paneId(key),
                area: 'panes',
                title,
                data: {
                    dock: { before: cfg.before?.(tile), pane: cfg.anchor?.(tile) ?? 'workspace', pos: cfg.dir?.(tile) ?? 'right' },
                    minWidth: cfg.minWidth,
                    placement: 'main'
                },
                render: () => cfg.render(key)
            });
            registered.set(key, { dispose, title });
            if (!current) {
                registerPaneCloser(paneId(key), () => cfg.close(key));
            }
        }
        for (const [key, entry] of registered) {
            if (!wanted.has(key)) {
                entry.dispose();
                registered.delete(key);
                removeTreePane(paneId(key));
            }
        }
    };
    return () => {
        sync();
        cfg.source.listen(sync);
        cfg.also?.forEach(atom => atom.listen(sync));
    };
}
