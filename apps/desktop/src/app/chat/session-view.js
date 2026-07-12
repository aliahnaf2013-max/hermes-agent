import { createContext, useContext } from 'react';
import { $activeSessionId, $awaitingResponse, $busy, $currentCwd, $currentModel, $currentProvider, $lastVisibleMessageIsUser, $messages, $messagesEmpty, $selectedStoredSessionId } from '@/store/session';
export const PRIMARY_SESSION_VIEW = {
    kind: 'primary',
    $awaitingResponse,
    $busy,
    $cwd: $currentCwd,
    $lastVisibleIsUser: $lastVisibleMessageIsUser,
    $messages,
    $messagesEmpty,
    $model: $currentModel,
    $provider: $currentProvider,
    $runtimeId: $activeSessionId,
    $storedId: $selectedStoredSessionId
};
const SessionViewContext = createContext(PRIMARY_SESSION_VIEW);
export const SessionViewProvider = SessionViewContext.Provider;
export const useSessionView = () => useContext(SessionViewContext);
