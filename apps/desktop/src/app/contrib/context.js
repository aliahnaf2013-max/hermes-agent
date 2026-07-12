import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { createContext, memo, useContext } from 'react';
import { DecodeText } from '@/components/ui/decode-text';
import { StatusbarControls } from '../shell/statusbar-controls';
/** The controller publishes its five wired surfaces here; every registered pane
 *  / chrome slot reads one back through `WiredPane`. */
export const ContribWiringContext = createContext(null);
/** Render a wired surface inside a registered pane / chrome slot.
 *
 *  Memoized on `part` (its only prop): a zone re-rendering for reasons that
 *  don't touch the wiring — a drag hint sweeping the tree, a sash resize, an
 *  edit-mode toggle — re-renders the group chrome but NOT this component, so
 *  the (expensive) pane body it reads from context is untouched. When the
 *  wiring's `api` genuinely changes, the context read re-renders it as normal. */
export const WiredPane = memo(function WiredPane({ part }) {
    const api = useContext(ContribWiringContext);
    if (!api) {
        if (part === 'statusbar') {
            return _jsx(StatusbarControls, { items: [], leftItems: [] });
        }
        if (part === 'sessionTitle') {
            return null;
        }
        return (_jsx("div", { className: "grid h-full place-items-center", children: _jsx(DecodeText, { className: "text-(--ui-text-quaternary)", cursor: true, prefix: 1, text: "HERMES" }) }));
    }
    return _jsx(_Fragment, { children: api[part] });
});
