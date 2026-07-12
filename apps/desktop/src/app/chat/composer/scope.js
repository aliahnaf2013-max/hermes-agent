import { createContext, useContext } from 'react';
import { mainComposerScope } from '@/store/composer';
import { $activeSessionAwaitingInput } from '@/store/prompts';
import { $messages } from '@/store/session';
export const MAIN_COMPOSER_SCOPE = {
    $awaitingInput: $activeSessionAwaitingInput,
    attachments: mainComposerScope,
    popoutAllowed: true,
    readMessages: () => $messages.get(),
    target: 'main'
};
const ComposerScopeContext = createContext(MAIN_COMPOSER_SCOPE);
export const ComposerScopeProvider = ComposerScopeContext.Provider;
export const useComposerScope = () => useContext(ComposerScopeContext);
