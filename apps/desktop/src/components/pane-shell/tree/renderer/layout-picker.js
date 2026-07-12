import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Layout picker — the preset card grid inside the edit palette. Thumbnails
 * are a miniature render of each preset's layout tree; clicking a card
 * applies it, and "Save current arrangement" captures the live tree as a
 * user preset. The "New grid layout" button opens the zone editor.
 */
import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { Input } from '@/components/ui/input';
import { useContributions } from '@/contrib/react/use-contributions';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { isLayoutNode } from '../model';
import { applyLayoutPreset, deleteUserPreset, isUserPreset, LAYOUTS_AREA, saveCurrentLayoutAs } from '../presets';
import { $activePresetId } from '../store';
import { $zoneEditorOpen } from '../zone-editor';
/** Miniature render of a layout tree — the preset card thumbnail. */
function TreeThumbnail({ node }) {
    if (node.type === 'group') {
        return (_jsx("div", { className: "min-h-0 min-w-0 flex-1 rounded-[2px]", style: { background: 'color-mix(in srgb, currentColor 16%, transparent)' } }));
    }
    return (_jsx("div", { className: cn('flex min-h-0 min-w-0 flex-1 gap-px', node.orientation === 'row' ? 'flex-row' : 'flex-col'), children: node.children.map((child, i) => (_jsx("div", { className: "flex min-h-0 min-w-0", style: { flex: `${node.weights[i]} ${node.weights[i]} 0px` }, children: _jsx(TreeThumbnail, { node: child }) }, child.id))) }));
}
/** Small-caps section heading — the app's SidebarPanelLabel voice. */
function PickerSectionLabel({ children }) {
    return (_jsx("span", { className: "text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-(--ui-text-quaternary)", children: children }));
}
function PresetCard({ preset }) {
    const { t } = useI18n();
    const activeId = useStore($activePresetId);
    const tree = isLayoutNode(preset.data) ? preset.data : null;
    if (!tree) {
        return null;
    }
    const active = preset.id === activeId;
    return (_jsxs("div", { className: "group/preset relative", children: [_jsxs("button", { className: cn('flex w-full flex-col gap-1.5 rounded-lg border p-1.5 text-left transition-colors', active
                    ? 'border-(--ui-accent) bg-(--ui-row-active-background)'
                    : 'border-(--ui-stroke-secondary) hover:border-(--ui-stroke-primary) hover:bg-(--ui-row-hover-background)'), onClick: () => applyLayoutPreset(preset.id, tree), type: "button", children: [_jsx("div", { className: "flex h-12 w-full", children: _jsx(TreeThumbnail, { node: tree }) }), _jsx("span", { className: cn('truncate text-[0.68rem] font-medium', active ? 'text-foreground' : 'text-muted-foreground/80'), children: preset.title ?? preset.id })] }), isUserPreset(preset.id) && (_jsx("button", { "aria-label": t.zones.deletePreset(preset.title ?? preset.id), 
                // Hover-reveal (opacity, not display) — stays laid out + clickable,
                // appears on card hover or keyboard focus.
                className: "absolute right-1 top-1 z-10 grid size-5 place-items-center rounded-md bg-(--ui-bg-elevated) text-(--ui-text-tertiary) opacity-0 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground focus-visible:opacity-100 group-hover/preset:opacity-100", onClick: () => deleteUserPreset(preset.id), onPointerDown: e => e.stopPropagation(), type: "button", children: _jsx(Codicon, { name: "close", size: "0.7rem" }) }))] }));
}
export function LayoutPicker() {
    const { t } = useI18n();
    const presets = useContributions(LAYOUTS_AREA);
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const templates = presets.filter(p => !isUserPreset(p.id) && isLayoutNode(p.data));
    const custom = presets.filter(p => isUserPreset(p.id) && isLayoutNode(p.data));
    const commitSave = () => {
        if (!name.trim()) {
            return;
        }
        saveCurrentLayoutAs(name);
        setName('');
        setSaving(false);
    };
    return (_jsxs("div", { className: "flex flex-col gap-4", children: [_jsxs("section", { className: "flex flex-col gap-2", children: [_jsx(PickerSectionLabel, { children: t.zones.templates }), _jsx("div", { className: "grid grid-cols-4 gap-2", children: templates.map(preset => (_jsx(PresetCard, { preset: preset }, `${preset.source ?? 'core'}:${preset.id}`))) })] }), _jsxs("section", { className: "flex flex-col gap-2", children: [_jsx(PickerSectionLabel, { children: t.zones.custom }), custom.length > 0 && (_jsx("div", { className: "grid grid-cols-4 gap-2", children: custom.map(preset => (_jsx(PresetCard, { preset: preset }, `${preset.source ?? 'core'}:${preset.id}`))) })), _jsxs(Button, { className: "h-8 w-full justify-center gap-1.5 border border-dashed border-(--ui-stroke-secondary) text-muted-foreground hover:border-(--ui-stroke-primary) hover:text-foreground", onClick: () => $zoneEditorOpen.set(true), size: "sm", variant: "ghost", children: [_jsx(Codicon, { name: "add", size: "0.875rem" }), t.zones.newGridLayout] })] }), saving ? (_jsxs("form", { className: "flex items-center gap-1.5", onSubmit: e => {
                    e.preventDefault();
                    commitSave();
                }, children: [_jsx(Input, { autoFocus: true, className: "h-7 flex-1 text-xs", onChange: e => setName(e.target.value), onKeyDown: e => {
                            if (e.key === 'Escape') {
                                setSaving(false);
                                setName('');
                            }
                        }, placeholder: t.zones.nameLayoutPlaceholder, value: name }), _jsx(Button, { disabled: !name.trim(), size: "sm", type: "submit", variant: "outline", children: t.common.save }), _jsx(Button, { onClick: () => setSaving(false), size: "sm", variant: "ghost", children: t.common.cancel })] })) : (_jsxs("button", { className: "flex items-center gap-1.5 self-start text-xs text-muted-foreground/80 transition-colors hover:text-foreground", onClick: () => setSaving(true), type: "button", children: [_jsx(Codicon, { name: "save", size: "0.8125rem" }), t.zones.saveCurrentAs] }))] }));
}
