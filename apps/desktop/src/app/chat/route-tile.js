import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * ROUTE (PAGE) TILES — a full-page view rendered as a layout-tree pane BESIDE
 * the main thread, the page analog of session tiles. Built-in pages
 * (Capabilities / Messaging / Artifacts) render their view; plugin pages render
 * their `ROUTES_AREA` contribution. Lifecycle mirrors session tiles:
 * `openRouteTile(path)` -> `watchRouteTiles` registers a pane docked beside
 * main -> tree adoption lands it on the chosen edge; closing removes it.
 */
import { lazy, Suspense } from 'react';
import { ContribBoundary } from '@/contrib/react/boundary';
import { useContributions } from '@/contrib/react/use-contributions';
import { $routeTiles, closeRouteTile } from '@/store/route-tiles';
import { ARTIFACTS_ROUTE, contributedRoutes, MESSAGING_ROUTE, ROUTES_AREA, SKILLS_ROUTE } from '../routes';
import { paneMirror } from './pane-mirror';
const SkillsView = lazy(async () => ({ default: (await import('../skills')).SkillsView }));
const MessagingView = lazy(async () => ({ default: (await import('../messaging')).MessagingView }));
const ArtifactsView = lazy(async () => ({ default: (await import('../artifacts')).ArtifactsView }));
// Built-in page views + their pane titles, keyed by route.
const BUILTIN_PAGES = {
    [ARTIFACTS_ROUTE]: { render: () => _jsx(ArtifactsView, {}), title: 'Artifacts' },
    [MESSAGING_ROUTE]: { render: () => _jsx(MessagingView, {}), title: 'Messaging' },
    [SKILLS_ROUTE]: { render: () => _jsx(SkillsView, {}), title: 'Capabilities' }
};
/** Humanize a route path into a tab title: `/my-atlas` → `My Atlas`. */
const humanizePath = (path) => path
    .replace(/^\/+/, '')
    .split(/[/-]/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ') || path;
/** Title for a route tile: the built-in name, the contribution's own `title`,
 *  else a humanized path — never the internal `${source}:${id}` key. */
function routeTitle(path) {
    if (BUILTIN_PAGES[path]) {
        return BUILTIN_PAGES[path].title;
    }
    return contributedRoutes().find(r => r.path === path)?.title ?? humanizePath(path);
}
function RouteTilePane({ path }) {
    const builtin = BUILTIN_PAGES[path];
    // Subscribe so a plugin page tile appears the moment its route registers.
    useContributions(ROUTES_AREA);
    const contrib = builtin ? null : contributedRoutes().find(r => r.path === path);
    if (builtin) {
        return (_jsx(ContribBoundary, { id: path, children: _jsx(Suspense, { fallback: null, children: builtin.render() }) }));
    }
    if (contrib) {
        return _jsx(ContribBoundary, { id: path, children: contrib.render() });
    }
    return (_jsxs("div", { className: "grid h-full place-items-center font-mono text-[11px] text-(--ui-text-quaternary)", children: ["no page at ", path] }));
}
// ---------------------------------------------------------------------------
// Route tile -> pane contribution sync (call once from the app root).
// ---------------------------------------------------------------------------
/** Keep pane contributions mirroring `$routeTiles`. Call once from the root. */
export const watchRouteTiles = paneMirror({
    source: $routeTiles,
    key: t => t.path,
    prefix: 'route-tile',
    dir: t => t.dir,
    minWidth: '22rem',
    title: routeTitle,
    render: path => _jsx(RouteTilePane, { path: path }),
    close: closeRouteTile
});
