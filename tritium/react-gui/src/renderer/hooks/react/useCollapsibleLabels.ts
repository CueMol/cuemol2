/**
 * @file hooks/useCollapsibleLabels.ts
 * @description Two-state, uniform label collapse for an icon+text toolbar.
 *
 * Toolbar button labels are shown in full or hidden entirely -- never truncated
 * to a fragment. Buttons do not flex-shrink (see styles/_toolbar.css and
 * styles/_form-kit.css), so as long as the full labels fit they all show; once
 * they no longer fit their flex container, this hook hides EVERY label at once
 * (icon-only) via the `data-label-collapsed` attribute, styled by
 * `.bp5-button[data-label-collapsed] .bp5-button-text { display: none }`.
 *
 * The all-or-nothing switch at a single width threshold keeps the behavior
 * uniform and monotonic (full -> icon-only, never a partially-hidden label and
 * never a per-button drop that would let a neighbour re-expand). Over-shrinking
 * to icon-only while space is left over on the right is intentional.
 *
 * Only buttons that have an icon are collapsed, so a text-only button keeps its
 * label (it has no icon to fall back to and would otherwise vanish).
 *
 * The hook returns whether the labels are currently collapsed so a consumer can
 * render the hidden label as a tooltip. The top Toolbar uses this to show the
 * label in the shared h3-kit Tooltip while icon-only; RenderPanel instead falls
 * back to the CSS `::after` bubble on `[data-label-collapsed]` (_form-kit.css).
 */

import { useLayoutEffect, useState } from 'react'

export function useCollapsibleLabels(ref: React.RefObject<HTMLElement | null>): boolean {
    const [collapsed, setCollapsed] = useState(false)
    useLayoutEffect(() => {
        const el = ref.current
        if (!el) return

        let raf = 0
        const measure = (): void => {
            raf = 0
            const buttons: HTMLElement[] = []
            el.querySelectorAll<HTMLElement>('.bp5-button').forEach((b) => {
                // Only icon+text buttons collapse; a text-only button has no icon
                // to fall back to, so its label must stay. Blueprint wraps a named
                // icon in .bp5-icon, but a custom icon element (our Phosphor
                // AppIcon) renders a bare <svg> -- match either.
                if (b.querySelector('.bp5-icon, svg')) buttons.push(b)
            })
            if (buttons.length === 0) return

            // Show every label, then measure: if the full labels overflow their
            // flex container, hide them all at once. scrollWidth reports the full
            // content width even though the group clips it (overflow: hidden).
            buttons.forEach((b) => b.removeAttribute('data-label-collapsed'))
            // The flex row is the buttons' parent, but a shared Tooltip wraps its
            // target in a `.bp5-popover-target` span; step past it so overflow is
            // measured on the flex row itself, not the single-button wrapper.
            let box: HTMLElement | null = buttons[0].parentElement
            if (box?.classList.contains('bp5-popover-target')) box = box.parentElement
            const overflow = !!box && box.scrollWidth > box.clientWidth + 1
            if (overflow) {
                buttons.forEach((b) => {
                    // The attribute VALUE is the hidden label: the CSS hides the
                    // text (attribute selector) and, for RenderPanel, surfaces the
                    // label as a hover tooltip via content: attr(...). The top
                    // Toolbar reads the returned `collapsed` flag instead and shows
                    // the label in the shared h3-kit Tooltip.
                    const label =
                        b.querySelector('.bp5-button-text')?.textContent?.trim() ?? ''
                    b.setAttribute('data-label-collapsed', label)
                })
            }
            setCollapsed(overflow)
        }
        const schedule = (): void => {
            if (raf === 0) raf = requestAnimationFrame(measure)
        }

        measure()
        // ResizeObserver is absent in jsdom (unit tests); the initial measure
        // still runs, we just skip live re-measuring there.
        const ro =
            typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
        ro?.observe(el)
        // Catch label content changes (e.g. Start Render <-> Stop) that change
        // width without a container resize. Attributes are intentionally NOT
        // observed -- that would loop on our own data-label-collapsed writes.
        const mo =
            typeof MutationObserver !== 'undefined' ? new MutationObserver(schedule) : null
        mo?.observe(el, { childList: true, subtree: true, characterData: true })

        return () => {
            ro?.disconnect()
            mo?.disconnect()
            if (raf !== 0) cancelAnimationFrame(raf)
        }
    }, [ref])
    return collapsed
}
