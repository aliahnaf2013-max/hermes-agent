import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { ContribBoundary } from './boundary';
import { useContributions } from './use-contributions';
/** Renders a bar area: ordered inline items `[...core, ...plugin]`. */
export function Slot({ area }) {
    const items = useContributions(area);
    if (items.length === 0) {
        return null;
    }
    return (_jsx(_Fragment, { children: items.map(c => (_jsx(ContribBoundary, { id: c.id, variant: "chip", children: c.render?.() }, `${c.source ?? 'core'}:${c.id}`))) }));
}
