"use client";

import { FieldLegend, FieldSet } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type OptionToggleProps<T extends string> = {
  label: string;
  options: T[];
  value: T;
  onChange: (value: T) => void;
};

// OptionSelect's sibling for short lists: every option visible, one click to pick.
// A <legend> names the group (a <label> can only point at one input)
export function OptionToggle<T extends string>({
  label,
  options,
  value,
  onChange,
}: OptionToggleProps<T>) {
  return (
    <FieldSet className="min-w-0 gap-0">
      <FieldLegend variant="label">{label}</FieldLegend>
      <ToggleGroup
        variant="outline"
        spacing={0}
        className="w-full"
        // Base UI keeps a list of pressed values (as plain strings); clicking the pressed one
        // empties it, and an empty pick isn't allowed here, so only a new option counts.
        // The find() turns the string back into T without a cast
        value={[value]}
        onValueChange={(next) => {
          const picked = options.find((option) => option === next[0]);
          if (picked) {
            onChange(picked);
          }
        }}
      >
        {options.map((option) => (
          <ToggleGroupItem key={option} value={option} className="flex-1 capitalize tabular-nums">
            {option}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </FieldSet>
  );
}
