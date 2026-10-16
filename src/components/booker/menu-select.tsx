"use client";

import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SlidingHighlightAnchor, slidingItemClassName } from "@/components/booker/sliding-highlight";

export type MenuSelectItem = { value: string; label: string };

/**
 * coss Select that opens below its field (not over it, macOS-style), with the
 * dropdown motion from globals.css and the sliding highlight.
 */
export function MenuSelect({
  items,
  value,
  onValueChange,
  placeholder,
  "aria-label": ariaLabel,
}: {
  items: MenuSelectItem[];
  value: string | null;
  onValueChange: (value: string) => void;
  placeholder?: string;
  "aria-label"?: string;
}) {
  return (
    <Select items={items} onValueChange={(v) => onValueChange(v as string)} value={value}>
      <SelectTrigger aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectPopup alignItemWithTrigger={false} className="relative">
        <SlidingHighlightAnchor />
        {items.map((item) => (
          <SelectItem className={slidingItemClassName} key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
