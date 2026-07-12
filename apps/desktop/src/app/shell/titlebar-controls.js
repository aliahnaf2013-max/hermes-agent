import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toggleLayoutEditMode } from '@/components/pane-shell/edit-mode';
import { resetLayoutTree } from '@/components/pane-shell/tree/store';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { Tip } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { triggerHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { $hapticsMuted, toggleHapticsMuted } from '@/store/haptics';
import { $fileBrowserOpen, $sidebarOpen, toggleFileBrowserOpen, togglePanesFlipped, toggleSidebarOpen } from '@/store/layout';
import { appViewForPath, isOverlayView } from '../routes';
import { titlebarButtonClass } from './titlebar';
/**
 * The layout button's glyph. Morphs into its composite reset form — the
 * layout icon wearing a small counter-clockwise arrow badge ("layout, back
 * to how it was") — ONLY while the pointer is on the button AND ⌘/Ctrl is
 * held: hover gates via CSS (`group/tool` on the button), the modifier via
 * the window listener. Pressing the modifier elsewhere changes nothing.
 */
function LayoutGlyph({ modHeld }) {
    return (_jsxs(_Fragment, { children: [_jsx("span", { className: cn('inline-flex', modHeld && 'group-hover/tool:hidden'), children: _jsx(Codicon, { name: "layout" }) }), _jsxs("span", { className: cn('relative hidden', modHeld && 'group-hover/tool:inline-flex'), children: [_jsx(Codicon, { name: "layout" }), _jsx("span", { className: "absolute -bottom-1 -right-1.5 grid place-items-center rounded-full bg-(--ui-bg-chrome) p-px", children: _jsx(Codicon, { className: "-scale-x-100", name: "refresh", size: "0.5625rem" }) })] })] }));
}
/** Live ⌘/Ctrl tracking — mod-click affordances telegraph themselves (the
 *  layout button morphs into its reset form while the modifier is down). */
function useModifierHeld() {
    const [held, setHeld] = useState(false);
    useEffect(() => {
        const sync = (event) => setHeld(event.metaKey || event.ctrlKey);
        const clear = () => setHeld(false);
        window.addEventListener('keydown', sync);
        window.addEventListener('keyup', sync);
        window.addEventListener('blur', clear);
        return () => {
            window.removeEventListener('keydown', sync);
            window.removeEventListener('keyup', sync);
            window.removeEventListener('blur', clear);
        };
    }, []);
    return held;
}
export function TitlebarControls({ leftTools = [], tools = [], onOpenSettings }) {
    const { t } = useI18n();
    const navigate = useNavigate();
    const location = useLocation();
    const modHeld = useModifierHeld();
    const hapticsMuted = useStore($hapticsMuted);
    const fileBrowserOpen = useStore($fileBrowserOpen);
    const sidebarOpen = useStore($sidebarOpen);
    const toggleHaptics = () => {
        if (!hapticsMuted) {
            triggerHaptic('tap');
        }
        toggleHapticsMuted();
        if (hapticsMuted) {
            window.requestAnimationFrame(() => triggerHaptic('success'));
        }
    };
    // POSITIONAL toggles: each button shows/hides everything on its physical
    // side of the main zone (the layout tree collapses the whole side), so they
    // stay correct through flips and rearranges. $sidebarOpen ≙ left side,
    // $fileBrowserOpen ≙ right side. Never an active highlight — plain
    // show/hide affordances.
    const leftEdge = { open: sidebarOpen, toggle: toggleSidebarOpen };
    const rightEdge = { open: fileBrowserOpen, toggle: toggleFileBrowserOpen };
    const leftToolbarTools = [
        {
            icon: _jsx(Codicon, { name: "layout-sidebar-left" }),
            id: 'sidebar',
            label: leftEdge.open ? t.titlebar.hideSidebar : t.titlebar.showSidebar,
            onSelect: () => {
                triggerHaptic('tap');
                leftEdge.toggle();
            }
        },
        {
            icon: _jsx(Codicon, { name: "arrow-swap" }),
            id: 'flip-panes',
            label: t.titlebar.swapSidebarSides,
            onSelect: () => {
                triggerHaptic('tap');
                togglePanesFlipped();
            },
            title: t.titlebar.swapSidebarSidesTitle
        },
        ...leftTools
    ];
    const rightSidebarTool = {
        icon: _jsx(Codicon, { name: "layout-sidebar-right" }),
        id: 'right-sidebar',
        label: rightEdge.open ? t.titlebar.hideRightSidebar : t.titlebar.showRightSidebar,
        onSelect: () => {
            triggerHaptic('tap');
            rightEdge.toggle();
        }
    };
    // Static system tools — always pinned to the screen's right edge.
    const systemTools = [
        {
            className: 'group/tool',
            // Hover + held ⌘/Ctrl morphs the glyph into its reset form (see
            // LayoutGlyph) — the mod-click telegraphs itself before it happens.
            icon: _jsx(LayoutGlyph, { modHeld: modHeld }),
            id: 'layout',
            label: t.titlebar.layoutEditor,
            onSelect: event => {
                if (event?.metaKey || event?.ctrlKey) {
                    triggerHaptic('warning');
                    resetLayoutTree();
                    return;
                }
                triggerHaptic('open');
                toggleLayoutEditMode();
            },
            title: t.titlebar.layoutEditorTitle
        },
        {
            active: hapticsMuted,
            icon: _jsx(Codicon, { name: hapticsMuted ? 'mute' : 'unmute' }),
            id: 'haptics',
            label: hapticsMuted ? t.titlebar.unmuteHaptics : t.titlebar.muteHaptics,
            onSelect: toggleHaptics
        },
        {
            icon: _jsx(Codicon, { name: "settings-gear" }),
            id: 'settings',
            label: t.titlebar.openSettings,
            onSelect: () => {
                triggerHaptic('open');
                onOpenSettings();
            }
        }
    ];
    // While a full-screen overlay (settings, command center, …) is open it should
    // visually own the window. These control clusters are `fixed` at a higher
    // z-index than the overlay card, so they'd otherwise bleed over it — hide them
    // and let the overlay's own chrome (close button, drag region) take over.
    if (isOverlayView(appViewForPath(location.pathname))) {
        return null;
    }
    const visibleSystemTools = systemTools.filter(tool => !tool.hidden);
    const visiblePaneTools = tools.filter(tool => !tool.hidden);
    return (_jsxs(_Fragment, { children: [_jsx("div", { "aria-label": t.shell.windowControls, className: "fixed left-(--titlebar-controls-left) top-(--titlebar-controls-top) z-70 flex translate-y-0.5 flex-row items-center gap-x-1 pointer-events-auto select-none [-webkit-app-region:no-drag]", children: leftToolbarTools
                    .filter(tool => !tool.hidden)
                    .map(tool => (_jsx(TitlebarToolButton, { navigate: navigate, tool: tool }, tool.id))) }), visiblePaneTools.length > 0 && (_jsx("div", { "aria-label": t.shell.paneControls, className: "fixed top-[calc(var(--titlebar-controls-top)+var(--right-rail-top-inset,0px))] right-[calc(var(--titlebar-tools-right)+var(--shell-preview-toolbar-gap,0))] z-70 flex flex-row items-center gap-x-1 pointer-events-auto select-none [-webkit-app-region:no-drag]", children: visiblePaneTools.map(tool => (_jsx(TitlebarToolButton, { navigate: navigate, tool: tool }, tool.id))) })), _jsxs("div", { "aria-label": t.shell.appControls, className: "fixed right-(--titlebar-tools-right) top-(--titlebar-controls-top) z-70 flex flex-row items-center justify-end gap-x-1 pointer-events-auto select-none [-webkit-app-region:no-drag]", children: [visibleSystemTools.map(tool => (_jsx(TitlebarToolButton, { navigate: navigate, tool: tool }, tool.id))), _jsx(TitlebarToolButton, { navigate: navigate, tool: rightSidebarTool })] })] }));
}
function TitlebarToolButton({ navigate, tool }) {
    // Titlebar actions never show an active background — state reads from the
    // icon itself (e.g. the mute/unmute glyph). aria-pressed still carries it
    // for a11y.
    const className = cn(titlebarButtonClass, 'bg-transparent select-none', tool.className);
    if (tool.href) {
        return (_jsx(Tip, { label: tool.title ?? tool.label, children: _jsx(Button, { asChild: true, className: className, size: "icon-titlebar", variant: "ghost", children: _jsx("a", { "aria-label": tool.label, href: tool.href, onPointerDown: event => event.stopPropagation(), rel: "noreferrer", target: "_blank", children: tool.icon }) }) }));
    }
    return (_jsx(Tip, { label: tool.title ?? tool.label, children: _jsx(Button, { "aria-label": tool.label, "aria-pressed": tool.active ?? undefined, className: className, disabled: tool.disabled, onClick: event => {
                if (tool.to) {
                    navigate(tool.to);
                }
                tool.onSelect?.(event);
            }, onPointerDown: event => event.stopPropagation(), size: "icon-titlebar", type: "button", variant: "ghost", children: tool.icon }) }));
}
