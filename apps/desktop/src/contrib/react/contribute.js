import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
/**
 * Mount-scoped contribution — the "reverse portal" companion to `Slot`.
 *
 * `ctx.register` is for PERMANENT contributions (registered at plugin load,
 * alive for the plugin's lifetime). `<Contribute>` is for chrome that belongs
 * to a mounted surface: while the owning component is mounted, `children`
 * render inside the target area's Slot; on unmount the contribution disposes
 * itself. No route sniffing, no `when()` polling — React's lifecycle IS the
 * visibility contract (a page's titlebar control leaves with the page).
 *
 * Children stay LIVE: they're projected through a nanostore the registered
 * render subscribes to, so caller state flows into the slot on every render
 * without re-registering (which would churn every other slot).
 */
import { useStore } from '@nanostores/react';
import { atom } from 'nanostores';
import { useEffect, useRef } from 'react';
import { registry } from '../registry';
function ProjectedNode({ $node }) {
    return _jsx(_Fragment, { children: useStore($node) });
}
export function Contribute({ area, children, id, order }) {
    const $node = useRef(null);
    $node.current ??= atom(null);
    // Push the latest children into the projection after every render.
    useEffect(() => {
        $node.current.set(children);
    });
    useEffect(() => registry.register({ area, id, order, render: () => _jsx(ProjectedNode, { "$node": $node.current }) }), [area, id, order]);
    return null;
}
