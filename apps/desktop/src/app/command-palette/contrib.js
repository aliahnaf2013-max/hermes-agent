/**
 * Command-palette contribution surface — `palette` data contributions become
 * rows in the ⌘K root list, same schema as every other area. Contributions
 * with an `action` id render that action's live keybind as their hotkey hint.
 */
import { useContributions } from '@/contrib/react/use-contributions';
export const PALETTE_AREA = 'palette';
/** Contributed palette rows, with stable render keys. */
export function usePaletteContributions() {
    return useContributions(PALETTE_AREA)
        .map(c => ({ key: `${c.source ?? 'core'}:${c.id}`, ...c.data }))
        .filter(item => Boolean(item.label && item.run));
}
