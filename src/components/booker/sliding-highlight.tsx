"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Item classes that hand the highlight over to the sliding bar: the item keeps
 * its highlighted text colour but drops its own background.
 */
export const slidingItemClassName =
  "relative z-1 data-highlighted:bg-transparent transition-colors duration-100";

/**
 * A single highlight bar that slides between list items, after interior.dev's
 * dropdown (an overdamped spring, ≈160ms, no overshoot). It follows whichever
 * item Base UI marks `data-highlighted`, by keyboard or pointer. Portalled into
 * the list so it scrolls with the items.
 */
export function SlidingHighlight({ list }: { list: HTMLElement | null }) {
  const bar = useRef<HTMLDivElement>(null);
  const shown = useRef(false);

  useEffect(() => {
    if (!list) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const update = () => {
      const el = bar.current;
      if (!el) return;
      const item = list.querySelector<HTMLElement>("[data-highlighted]");
      if (!item) {
        el.style.opacity = "0";
        shown.current = false;
        return;
      }
      const listRect = list.getBoundingClientRect();
      const rect = item.getBoundingClientRect();
      const y = rect.top - listRect.top;
      const x = rect.left - listRect.left;
      // Appearing from nothing: jump into place, then fade; never slide in from the top.
      // List navigation happens tens of times a day, so the slide stays short and
      // only transform/opacity animate; size changes apply instantly.
      el.style.transition =
        shown.current && !reduce
          ? "transform 140ms var(--motion-ease-out), opacity 100ms var(--motion-ease-out)"
          : "opacity 100ms var(--motion-ease-out)";
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
      el.style.opacity = "1";
      shown.current = true;
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(list, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-highlighted"],
    });
    return () => observer.disconnect();
  }, [list]);

  if (!list) return null;
  return createPortal(
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 z-0 rounded-sm bg-accent opacity-0"
      data-slot="sliding-highlight"
      ref={bar}
    />,
    list,
  );
}

/** Callback-ref state for the list element the bar lives in. */
export function useListElement() {
  return useState<HTMLElement | null>(null);
}

/**
 * For lists whose element we can't reach with a ref (coss Select): drop this
 * among the items and the bar attaches to their parent list, which must be
 * positioned (pass `className="relative"` to the popup's list).
 */
export function SlidingHighlightAnchor() {
  const [list, setList] = useListElement();
  return (
    <>
      <span
        aria-hidden="true"
        className="hidden"
        ref={(el) => {
          const parent = el?.parentElement ?? null;
          if (parent && parent !== list) setList(parent);
        }}
      />
      <SlidingHighlight list={list} />
    </>
  );
}
