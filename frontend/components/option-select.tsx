"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OptionSelectProps<T extends string> = {
  id: string;
  label: string;
  options: T[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  hint?: string; // small text under the select, e.g. why it's disabled
};

// generic: T is the union of allowed values, so onChange gets that type back
export function OptionSelect<T extends string>({
  id,
  label,
  options,
  value,
  onChange,
  disabled,
  hint,
}: OptionSelectProps<T>) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(next) => next && onChange(next)} disabled={disabled}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
