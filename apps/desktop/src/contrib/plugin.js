/**
 * The plugin authoring contract. A plugin is a file that default-exports a
 * `HermesPlugin`; it never touches the registry directly — it receives a
 * scoped `PluginContext` whose `register` auto-tags provenance
 * (`source: 'plugin:<id>'`) and namespaces the contribution id
 * (`<id>:<localId>`), so authors write plain contributions and collisions
 * between plugins are impossible.
 *
 * Bundled plugins live in `src/plugins/<name>/plugin.tsx` and are discovered
 * by `discoverBundledPlugins()` (contrib/plugins.ts) — no import, no registry
 * edit. Runtime-fetched third-party plugins will drive the SAME contract
 * through the plugin host loader (next phase); this is that seam.
 */
import { pluginRest, pluginSocket } from '@/hermes';
import { readKey, writeKey } from '@/lib/storage';
import { registry } from './registry';
function createPluginStorage(pluginId) {
    const scoped = (key) => `hermes.plugin.${pluginId}.${key}`;
    return {
        get(key, fallback) {
            const raw = readKey(scoped(key));
            if (raw === null) {
                return fallback;
            }
            try {
                return JSON.parse(raw);
            }
            catch {
                return fallback;
            }
        },
        set: (key, value) => writeKey(scoped(key), JSON.stringify(value)),
        remove: key => writeKey(scoped(key), null)
    };
}
/** Build the scoped context handed to a plugin's `register`. `onDispose`
 *  receives every registration's disposer (the loader's unload/reload hook). */
export function createPluginContext(pluginId, onDispose) {
    const source = `plugin:${pluginId}`;
    const scope = (c) => ({ ...c, id: `${pluginId}:${c.id}`, source });
    const track = (dispose) => {
        onDispose?.(dispose);
        return dispose;
    };
    return {
        source,
        register: c => track(registry.register(scope(c))),
        registerMany: cs => track(registry.registerMany(cs.map(scope))),
        rest: (path, opts) => pluginRest(pluginId, path, opts),
        socket: (path, onMessage) => track(pluginSocket(pluginId, path, onMessage)),
        storage: createPluginStorage(pluginId)
    };
}
