import { useCallback, useRef, useState } from 'react';
import { dragHasAttachments } from '@/app/chat/composer/inline-refs';
import { extractDroppedFiles, HERMES_PATHS_MIME } from './use-composer-actions';
const dragKindOf = (event) => dragHasAttachments(event.dataTransfer, HERMES_PATHS_MIME) ? 'files' : null;
/**
 * "Drop anywhere in this region" affordance for FILE drags — the one drag
 * kind still on native DnD (Finder/OS drops and the project tree must be).
 * An enter/leave depth counter keeps nested children from flickering the
 * active state; `onDropCapture` clears it even when a nested target (the
 * composer) handles the drop and stops propagation before our bubble-phase
 * `onDrop` would fire.
 *
 * Spread `dropHandlers` onto the container; render an overlay off `dragKind`.
 */
export function useFileDropZone({ enabled = true, onDropFiles }) {
    const [dragKind, setDragKind] = useState(null);
    const depth = useRef(0);
    const reset = useCallback(() => {
        depth.current = 0;
        setDragKind(null);
    }, []);
    const onDragEnter = useCallback((event) => {
        const kind = enabled ? dragKindOf(event) : null;
        if (!kind) {
            return;
        }
        event.preventDefault();
        depth.current += 1;
        setDragKind(kind);
    }, [enabled]);
    const onDragOver = useCallback((event) => {
        if (!enabled || !dragKindOf(event)) {
            return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    }, [enabled]);
    const onDragLeave = useCallback(() => {
        if (enabled && --depth.current <= 0) {
            reset();
        }
    }, [enabled, reset]);
    const onDrop = useCallback((event) => {
        const kind = enabled ? dragKindOf(event) : null;
        if (!kind) {
            return;
        }
        // An outer layer may have already claimed this drop via preventDefault —
        // reset the hover state but don't ALSO act on it.
        const claimed = event.defaultPrevented;
        event.preventDefault();
        reset();
        if (claimed) {
            return;
        }
        const files = extractDroppedFiles(event.dataTransfer);
        if (files.length) {
            onDropFiles(files);
        }
    }, [enabled, onDropFiles, reset]);
    return {
        dragKind,
        dropHandlers: { onDragEnter, onDragLeave, onDragOver, onDrop, onDropCapture: reset }
    };
}
