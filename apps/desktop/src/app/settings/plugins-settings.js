import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { Switch } from '@/components/ui/switch';
import { Tip } from '@/components/ui/tooltip';
import { $pluginRecords, setPluginEnabled } from '@/contrib/plugins-store';
import { discoverRuntimePlugins } from '@/contrib/runtime-loader';
import { getStatus } from '@/hermes';
import { useI18n } from '@/i18n';
import { triggerHaptic } from '@/lib/haptics';
import { Package } from '@/lib/icons';
import { notifyError } from '@/store/notifications';
import { EmptyState, ListRow, Pill, SectionHeading, SettingsContent } from './primitives';
const KIND_ORDER = { disk: 0, runtime: 1, bundled: 2 };
function reveal(file) {
    void window.hermesDesktop?.revealPath?.(file)?.catch(() => undefined);
}
async function revealPluginsDir() {
    try {
        const { hermes_home } = await getStatus();
        // openDir (not reveal): the door often doesn't exist on first use, and
        // showItemInFolder on a missing path silently no-ops (esp. Windows).
        const result = await window.hermesDesktop?.openDir?.(`${hermes_home}/desktop-plugins`);
        if (result && !result.ok) {
            notifyError(result.error ?? 'unknown error', 'Could not open the plugins folder');
        }
    }
    catch (err) {
        notifyError(err, 'Could not resolve the plugins folder');
    }
}
function PluginRow({ record }) {
    const { t } = useI18n();
    const p = t.settings.plugins;
    return (_jsx(ListRow, { action: _jsxs("div", { className: "flex items-center justify-end gap-2", children: [record.file && (_jsx(Tip, { label: p.reveal, children: _jsx(Button, { onClick: () => reveal(record.file), size: "icon", variant: "ghost", children: _jsx(Codicon, { name: "folder-opened", size: "0.85rem" }) }) })), _jsx(Switch, { "aria-label": `${record.status === 'disabled' ? p.enable : p.disable} ${record.name}`, checked: record.status !== 'disabled', onCheckedChange: on => {
                        triggerHaptic('selection');
                        void setPluginEnabled(record.id, on);
                    } })] }), description: record.status === 'error' ? (_jsx("span", { className: "text-(--ui-danger,#f87171)", children: record.error })) : (record.file ?? record.id), title: _jsxs("span", { className: "flex items-center gap-2", children: [record.name, _jsx(Pill, { children: p.kinds[record.kind] }), record.status === 'error' && _jsx(Pill, { tone: "primary", children: p.failed })] }) }));
}
export function PluginsSettings() {
    const { t } = useI18n();
    const p = t.settings.plugins;
    const records = useStore($pluginRecords);
    const rows = Object.values(records).sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name));
    return (_jsxs(SettingsContent, { children: [_jsx(SectionHeading, { icon: Package, meta: p.count(rows.length), title: p.title }), _jsx("p", { className: "mb-4 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)", children: p.blurb }), _jsxs("div", { className: "mb-4 flex items-center gap-2", children: [_jsxs(Button, { onClick: () => void revealPluginsDir(), size: "sm", variant: "outline", children: [_jsx(Codicon, { name: "folder-opened", size: "0.8rem" }), p.openFolder] }), _jsxs(Button, { onClick: () => {
                            triggerHaptic('selection');
                            void discoverRuntimePlugins();
                        }, size: "sm", variant: "outline", children: [_jsx(Codicon, { name: "refresh", size: "0.8rem" }), p.rescan] })] }), rows.length === 0 ? (_jsx(EmptyState, { title: p.empty })) : (_jsx("div", { className: "divide-y divide-(--ui-stroke-tertiary)", children: rows.map(record => (_jsx(PluginRow, { record: record }, record.id))) }))] }));
}
