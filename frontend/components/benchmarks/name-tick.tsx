import { cn } from "cn";
import { Text, type YAxisTickContentProps } from "recharts";

export function nameTick(rows: { used?: boolean }[]) {
  return function NameTick({ x, y, textAnchor, index, payload }: YAxisTickContentProps) {
    return (
      <Text
        x={x}
        y={y}
        textAnchor={textAnchor}
        verticalAnchor="middle"
        fontSize={13}
        // width="auto" measures only the names that carry this class
        className={cn(
          "recharts-cartesian-axis-tick-value",
          rows[index]?.used && "fill-primary! font-semibold",
        )}
      >
        {String(payload.value)}
      </Text>
    );
  };
}
