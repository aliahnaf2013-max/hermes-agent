/**
 * Composer contribution surface — every seam of the composer is hook-into-able
 * through the SAME registry schema as every other surface (statusbar, titlebar,
 * panes, layouts):
 *
 *   render areas (`render`):  composer.top      — banner strip above the input
 *                             composer.bottom   — row below the input grid
 *                             composer.leading  — inline after the "+" menu
 *                             composer.actions  — inline before the model pill
 *
 *   data kinds (`data`):      composer.middleware   (ComposerMiddleware)
 *                             composer.attachments  (ComposerAttachmentProvider)
 *
 * Core keeps ownership of the transcript, input, and submit engine — these
 * seams AUGMENT the composer, they never replace it. Middleware runs as an
 * ordered async chain around the app's onSubmit: each handler may rewrite the
 * draft, pass it through, or cancel the send by returning null.
 */
import { useContributions } from '@/contrib/react/use-contributions';
import { registry } from '@/contrib/registry';
export const COMPOSER_AREAS = {
    top: 'composer.top',
    bottom: 'composer.bottom',
    leading: 'composer.leading',
    actions: 'composer.actions',
    middleware: 'composer.middleware',
    attachments: 'composer.attachments'
};
/**
 * Run the ordered middleware chain over a draft. Contributions execute in
 * registry order (`order`, then registration order); the first `null` wins
 * and cancels the send. A throwing handler is treated as pass-through so a
 * broken plugin can't eat messages.
 */
export async function runComposerMiddleware(draft) {
    let current = draft;
    for (const contribution of registry.getArea(COMPOSER_AREAS.middleware)) {
        const middleware = contribution.data;
        if (!middleware?.handler) {
            continue;
        }
        try {
            const next = await middleware.handler(current);
            if (next === null) {
                return null;
            }
            current = next;
        }
        catch {
            // Pass-through: a faulty middleware must never swallow the message.
        }
    }
    return current;
}
/** Attach-menu entries contributed by plugins/core, with stable render keys. */
export function useComposerAttachmentProviders() {
    return useContributions(COMPOSER_AREAS.attachments)
        .map(c => ({ key: `${c.source ?? 'core'}:${c.id}`, ...c.data }))
        .filter(p => Boolean(p.label && p.run));
}
