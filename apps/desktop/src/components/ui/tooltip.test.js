import { jsx as _jsx } from "react/jsx-runtime";
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Tip, TipHintLabel } from './tooltip';
describe('Tip', () => {
    afterEach(() => {
        cleanup();
    });
    it('shows on pointer enter and dismisses on pointer leave', async () => {
        render(_jsx(Tip, { label: "Layout editor \u2014 \u2318-click resets the layout", children: _jsx("button", { type: "button", children: "layout" }) }));
        const trigger = screen.getByRole('button', { name: 'layout' });
        fireEvent.pointerMove(trigger, { pointerType: 'mouse' });
        expect((await screen.findByRole('tooltip')).textContent).toContain('Layout editor — ⌘-click resets the layout');
        fireEvent.pointerLeave(trigger);
        await waitFor(() => {
            expect(screen.queryByRole('tooltip')).toBeNull();
        });
    });
    it('renders the child alone when label is empty', () => {
        render(_jsx(Tip, { label: "", children: _jsx("button", { type: "button", children: "bare" }) }));
        expect(screen.getByRole('button', { name: 'bare' })).toBeTruthy();
        expect(screen.queryByRole('tooltip')).toBeNull();
    });
    it('guards a block-level label child via the decoration wrapper class', async () => {
        render(_jsx(Tip, { label: _jsx("span", { className: "flex items-center gap-2", children: "broken label" }), children: _jsx("button", { type: "button", children: "trigger" }) }));
        fireEvent.pointerMove(screen.getByRole('button', { name: 'trigger' }), { pointerType: 'mouse' });
        await screen.findByRole('tooltip');
        // jsdom applies no real Tailwind, so assert the guarding class is present on
        // the decoration wrapper — that's what forces any direct child inline-flex
        // in a browser (#62022).
        const decoration = document.querySelector('[data-slot="tooltip-content"]')?.firstElementChild;
        expect(decoration?.className).toMatch(/\[&>\*\]:!inline-flex/);
    });
});
describe('TipHintLabel', () => {
    afterEach(() => {
        cleanup();
    });
    it('renders inline-flex with a hint and plain text without one', () => {
        const { rerender } = render(_jsx(TipHintLabel, { hint: "Ctrl+`", text: "PowerShell" }));
        const withHint = screen.getByText('PowerShell').parentElement;
        expect(withHint?.classList.contains('inline-flex')).toBe(true);
        expect(withHint?.classList.contains('flex')).toBe(false);
        rerender(_jsx(TipHintLabel, { text: "PowerShell" }));
        expect(screen.getByText('PowerShell').tagName).not.toBe('SPAN');
    });
});
