import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * SESSION TILES — a stored session rendered as a layout-tree pane BESIDE the
 * main thread (multi-session tiling). A tile IS the real chat surface: the
 * same ChatView/ChatBar/Thread tree the primary session renders, mounted
 * under a tile `SessionView` (its session's slice of `$sessionStates`) and a
 * tile `ComposerScope` (own attachment chips, own focus-bus key). Actions
 * (submit/slash/steer/edit/reload/restore/stop) come from
 * `useSessionTileActions`, all writing through the wiring cache.
 *
 * Lifecycle: `openSessionTile(storedId)` -> `watchSessionTiles` registers a
 * pane contribution docked right of the main zone -> tree adoption lands it
 * -> the pane mounts and asks the delegate for a live runtime id. Closing
 * the pane (tab Close) removes the tile + its zone; tiles persist across
 * restarts and re-resume on boot.
 */
import { useStore } from '@nanostores/react';
import { atom, computed } from 'nanostores';
import { useEffect, useMemo, useRef } from 'react';
import { useGatewayRequest } from '@/app/gateway/hooks/use-gateway-request';
import { blobToDataUrl } from '@/app/session/hooks/use-prompt-actions/utils';
import { findGroupOfPane } from '@/components/pane-shell/tree/model';
import { $layoutTree, moveTreePane } from '@/components/pane-shell/tree/store';
import { formatRefValue } from '@/components/assistant-ui/directive-text';
import { Button } from '@/components/ui/button';
import { transcribeAudio } from '@/hermes';
import { sessionTitle } from '@/lib/chat-runtime';
import { createComposerAttachmentScope } from '@/store/composer';
import { sessionAwaitingInput } from '@/store/prompts';
import { $gatewayState, $sessions, sessionMatchesStoredId } from '@/store/session';
import { $sessionStates, $sessionTiles, closeSessionTile, patchSessionTile, sessionTileDelegate } from '@/store/session-states';
import { ComposerScopeProvider } from './composer/scope';
import { useComposerActions } from './hooks/use-composer-actions';
import { paneMirror } from './pane-mirror';
import { useSessionTileActions } from './session-tile-actions';
import { SessionViewProvider } from './session-view';
import { lastVisibleMessageIsUser } from './thread-loading';
import { ChatView } from '.';
const NO_MESSAGES = [];
/** The tile's SessionView: the same atom shape the primary chat renders
 *  from, computed from this session's slice of `$sessionStates`. */
function buildTileView(storedSessionId) {
    const $runtimeId = computed($sessionTiles, tiles => tiles.find(t => t.storedSessionId === storedSessionId)?.runtimeId ?? null);
    const $state = computed([$runtimeId, $sessionStates], (runtimeId, states) => runtimeId ? states[runtimeId] : undefined);
    const $messages = computed($state, state => state?.messages ?? NO_MESSAGES);
    return {
        kind: 'tile',
        $awaitingResponse: computed($state, state => Boolean(state?.awaitingResponse)),
        $busy: computed($state, state => Boolean(state?.busy)),
        $cwd: computed($state, state => state?.cwd ?? ''),
        $lastVisibleIsUser: computed($messages, lastVisibleMessageIsUser),
        $messages,
        $messagesEmpty: computed($messages, messages => messages.length === 0),
        $model: computed($state, state => state?.model ?? ''),
        $provider: computed($state, state => state?.provider ?? ''),
        $runtimeId,
        // Constant for the tile's lifetime — a plain atom, not a computed.
        $storedId: atom(storedSessionId)
    };
}
function TileChat({ runtimeId, storedSessionId, view }) {
    const { gatewayRef, requestGateway } = useGatewayRequest();
    const cwd = useStore(view.$cwd);
    // One attachment set + focus key per tile, stable for the tile's lifetime.
    const attachments = useRef(createComposerAttachmentScope()).current;
    const scope = useMemo(() => ({
        $awaitingInput: sessionAwaitingInput(runtimeId),
        attachments,
        popoutAllowed: false,
        readMessages: () => view.$messages.get(),
        target: `tile:${storedSessionId}`
    }), [attachments, runtimeId, storedSessionId, view.$messages]);
    const actions = useSessionTileActions({ runtimeId, scope, storedSessionId });
    // The same attach/pick/paste/drop pipeline the primary composer uses,
    // pointed at this tile's chips + session.
    const composer = useComposerActions({
        activeSessionId: runtimeId,
        currentCwd: cwd,
        requestGateway,
        scope: { add: attachments.add, remove: attachments.remove, target: scope.target }
    });
    return (_jsx(SessionViewProvider, { value: view, children: _jsx(ComposerScopeProvider, { value: scope, children: _jsx(ChatView, { gateway: gatewayRef.current, onAddContextRef: composer.addContextRefAttachment, onAddUrl: url => composer.addContextRefAttachment(`@url:${formatRefValue(url)}`, url), onAttachDroppedItems: composer.attachDroppedItems, onAttachImageBlob: composer.attachImageBlob, onBranchInNewChat: () => undefined, onCancel: actions.cancelRun, onDeleteSelectedSession: () => undefined, onDismissError: actions.dismissError, onEdit: actions.editMessage, onPasteClipboardImage: opts => composer.pasteClipboardImage(opts), onPickFiles: () => void composer.pickContextPaths('file'), onPickFolders: () => void composer.pickContextPaths('folder'), onPickImages: () => void composer.pickImages(), onReload: actions.reloadFromMessage, onRemoveAttachment: id => void composer.removeAttachment(id), onRestoreToMessage: actions.restoreToMessage, onRetryResume: () => patchSessionTile(storedSessionId, { error: undefined }), onSteer: actions.steerPrompt, onSubmit: actions.submitText, onThreadMessagesChange: actions.handleThreadMessagesChange, onToggleSelectedPin: () => undefined, onTranscribeAudio: async (audio) => (await transcribeAudio(await blobToDataUrl(audio), audio.type)).transcript }) }) }));
}
export function SessionTilePane({ storedSessionId }) {
    const tiles = useStore($sessionTiles);
    const tile = tiles.find(t => t.storedSessionId === storedSessionId);
    const runtimeId = tile?.runtimeId ?? null;
    const gatewayOpen = useStore($gatewayState) === 'open';
    const resumingRef = useRef(false);
    const view = useMemo(() => buildTileView(storedSessionId), [storedSessionId]);
    // Same gating as the primary's route resume (use-route-resume): never fire
    // session.resume before the gateway is OPEN. Persisted tiles mount at boot
    // while it's still connecting — an ungated resume rejected there and
    // latched every restored tile into the error card.
    useEffect(() => {
        if (!gatewayOpen || runtimeId || tile?.error || resumingRef.current) {
            return;
        }
        const delegate = sessionTileDelegate();
        if (!delegate) {
            return;
        }
        resumingRef.current = true;
        delegate
            .resumeTile(storedSessionId)
            .then(id => patchSessionTile(storedSessionId, { error: undefined, runtimeId: id }))
            .catch((err) => {
            patchSessionTile(storedSessionId, { error: err instanceof Error ? err.message : String(err) });
        })
            .finally(() => {
            resumingRef.current = false;
        });
    }, [gatewayOpen, runtimeId, storedSessionId, tile?.error]);
    // The gateway (re)opening invalidates any latched error — it likely came
    // from a not-yet-open gateway or the previous connection. Clearing it
    // retriggers the resume effect: one bounded auto-retry per (re)connect,
    // mirroring the primary path's became-open resync.
    useEffect(() => {
        if (gatewayOpen && tile?.error) {
            patchSessionTile(storedSessionId, { error: undefined });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gatewayOpen, storedSessionId]);
    if (tile?.error) {
        return (_jsx("div", { className: "grid h-full place-items-center p-4", children: _jsxs("div", { className: "max-w-[24rem] space-y-2 text-center font-mono text-[11px]", children: [_jsx("div", { className: "text-(--ui-danger,#f87171)", children: "Couldn't open this session" }), _jsx("div", { className: "break-words text-(--ui-text-quaternary)", children: tile.error }), _jsx(Button, { onClick: () => patchSessionTile(storedSessionId, { error: undefined }), size: "sm", variant: "outline", children: "Retry" })] }) }));
    }
    if (!runtimeId) {
        return (_jsx("div", { className: "grid h-full place-items-center font-mono text-[11px] text-(--ui-text-quaternary)", children: "opening session\u2026" }));
    }
    return _jsx(TileChat, { runtimeId: runtimeId, storedSessionId: storedSessionId, view: view });
}
// ---------------------------------------------------------------------------
// Tile -> pane contribution sync (call once from the app root).
// ---------------------------------------------------------------------------
function tileTitle(storedSessionId) {
    const stored = $sessions.get().find(s => sessionMatchesStoredId(s, storedSessionId));
    return stored ? sessionTitle(stored) : 'Session';
}
/** Layout reset → every session tile collapses into the MAIN zone as a tab
 *  after the workspace (the primary session stays the first tab), the "smart"
 *  reset: N scattered tiles become one tab bar over the chat instead of
 *  re-docking to their old edges.
 *
 *  Runs BEFORE generic adoption (see registerLayoutResetHandler) — the tiles
 *  aren't in the fresh tree yet, so each `moveTreePane` ADDS the tile into the
 *  workspace group as a tab (append). The main group id is re-read each pass
 *  because appending returns a new tree. */
export function stackSessionTilesIntoMain() {
    for (const tile of $sessionTiles.get()) {
        const tree = $layoutTree.get();
        const mainGroup = tree ? findGroupOfPane(tree, 'workspace')?.id : null;
        if (mainGroup) {
            moveTreePane(`session-tile:${tile.storedSessionId}`, { groupId: mainGroup, pos: 'center' });
        }
    }
}
/** Keep pane contributions mirroring `$sessionTiles` (+ titles from
 *  `$sessions`). Tiles dock against main on the chosen edge, flex width. */
export const watchSessionTiles = paneMirror({
    source: $sessionTiles,
    also: [$sessions],
    key: t => t.storedSessionId,
    prefix: 'session-tile',
    dir: t => t.dir,
    anchor: t => t.anchor,
    before: t => t.before,
    minWidth: '20rem',
    title: tileTitle,
    render: storedSessionId => _jsx(SessionTilePane, { storedSessionId: storedSessionId }),
    close: closeSessionTile
});
