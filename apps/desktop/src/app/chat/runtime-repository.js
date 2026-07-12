import { ExportedMessageRepository } from '@assistant-ui/react';
import { useMemo, useRef } from 'react';
import { coalesceToolOnlyAssistants, createToolMergeCache, toRuntimeMessage } from '@/lib/chat-runtime';
/**
 * ChatMessage[] -> assistant-ui message repository, with a WeakMap identity
 * cache so unchanged messages convert once (and a tool-merge cache that folds
 * tool-only assistant turns into their neighbour). Shared by the main chat's
 * runtime boundary and session tiles — one transcript pipeline, N surfaces.
 */
export function useRuntimeMessageRepository(messages) {
    const cacheRef = useRef(new WeakMap());
    const toolMergeCacheRef = useRef(createToolMergeCache());
    return useMemo(() => {
        const items = [];
        const branchParentByGroup = new Map();
        let visibleParentId = null;
        let headId = null;
        for (const message of coalesceToolOnlyAssistants(messages, toolMergeCacheRef.current)) {
            let parentId = visibleParentId;
            if (message.role === 'assistant' && message.branchGroupId) {
                if (!branchParentByGroup.has(message.branchGroupId)) {
                    branchParentByGroup.set(message.branchGroupId, visibleParentId);
                }
                parentId = branchParentByGroup.get(message.branchGroupId) ?? null;
            }
            const cachedMessage = cacheRef.current.get(message);
            const runtimeMessage = cachedMessage ?? toRuntimeMessage(message);
            if (!cachedMessage) {
                cacheRef.current.set(message, runtimeMessage);
            }
            items.push({ message: runtimeMessage, parentId });
            if (!message.hidden) {
                visibleParentId = message.id;
                headId = message.id;
            }
        }
        return ExportedMessageRepository.fromBranchableArray(items, { headId });
    }, [messages]);
}
