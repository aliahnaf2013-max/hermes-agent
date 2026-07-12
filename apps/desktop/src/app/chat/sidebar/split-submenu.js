import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Codicon } from '@/components/ui/codicon';
import { ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger } from '@/components/ui/context-menu';
import { DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@/components/ui/dropdown-menu';
import { triggerHaptic } from '@/lib/haptics';
export const DROPDOWN_SPLIT_KIT = {
    Item: DropdownMenuItem,
    Sub: DropdownMenuSub,
    SubContent: DropdownMenuSubContent,
    SubTrigger: DropdownMenuSubTrigger
};
export const CONTEXT_SPLIT_KIT = {
    Item: ContextMenuItem,
    Sub: ContextMenuSub,
    SubContent: ContextMenuSubContent,
    SubTrigger: ContextMenuSubTrigger
};
// Ordered so the default (right) sits first, one hop away.
const SPLIT_DIRS = [
    { dir: 'right', icon: 'arrow-right', label: 'Right' },
    { dir: 'bottom', icon: 'arrow-down', label: 'Down' },
    { dir: 'left', icon: 'arrow-left', label: 'Left' },
    { dir: 'top', icon: 'arrow-up', label: 'Up' }
];
/**
 * "Open in split ▸": clicking the row splits right (the common case), and the
 * submenu picks any edge. Shared by session rows and page nav rows.
 */
export function SplitSubmenu({ close, disabled, kit, label, onSplit }) {
    const { Item, Sub, SubContent, SubTrigger } = kit;
    const split = (dir) => {
        triggerHaptic('selection');
        onSplit(dir);
    };
    return (_jsxs(Sub, { children: [_jsxs(SubTrigger, { disabled: disabled, onClick: () => {
                    split('right');
                    close?.();
                }, children: [_jsx(Codicon, { name: "split-horizontal", size: "0.875rem" }), _jsx("span", { children: label })] }), _jsx(SubContent, { children: SPLIT_DIRS.map(({ dir, icon, label: dirLabel }) => (_jsxs(Item, { onSelect: () => split(dir), children: [_jsx(Codicon, { name: icon, size: "0.875rem" }), _jsx("span", { children: dirLabel })] }, dir))) })] }));
}
