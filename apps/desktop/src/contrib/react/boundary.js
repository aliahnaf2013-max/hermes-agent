import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ErrorBoundary } from '@/components/error-boundary';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { ErrorState } from '@/components/ui/error-state';
import { Tip } from '@/components/ui/tooltip';
/**
 * The blast wall between a contribution's `render()` and the app. Plugin
 * code throwing during render (bad import, undefined component, logic bug)
 * degrades to a small inline error in ITS slot — the surrounding bar/zone,
 * other plugins, and the app keep working. Every surface that mounts
 * contribution renders wraps them in this.
 *
 * The pane fallback uses the app's canonical `ErrorState` (same icon/title/body
 * as the React boundary and dialog errors) so a crashed contribution reads like
 * every other failure, not a raw stack dump.
 */
export function ContribBoundary({ children, id, variant = 'pane' }) {
    return (_jsx(ErrorBoundary, { fallback: ({ error, reset }) => variant === 'chip' ? (_jsx(Tip, { label: `${id}: ${error.message}`, children: _jsxs("button", { className: "inline-flex items-center gap-1 rounded px-1.5 text-[0.6875rem] text-destructive transition-colors hover:bg-(--chrome-action-hover)", onClick: reset, type: "button", children: [_jsx(Codicon, { name: "warning", size: "0.7rem" }), id] }) })) : (_jsx("div", { className: "grid h-full place-items-center p-6", children: _jsx(ErrorState, { description: error.message, title: `“${id}” failed to render`, children: _jsxs(Button, { className: "justify-self-center", onClick: reset, size: "sm", variant: "outline", children: [_jsx(Codicon, { name: "refresh", size: "0.8rem" }), "Retry"] }) }) })), label: `contrib:${id}`, children: children }));
}
