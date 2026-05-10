"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type WeekRow = {
  weekIso: string;
  bookedNights: number;
  availableNights: number;
  occupancyPct: number;
};

export function OccupancyChart({ data }: { data: WeekRow[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        No data in this range.
      </div>
    );
  }
  return (
    <div className="rounded-md border bg-card p-3">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="weekIso" tick={{ fontSize: 11 }} />
          <YAxis
            unit="%"
            domain={[0, 100]}
            tick={{ fontSize: 11 }}
            width={40}
          />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            formatter={(value, name) =>
              name === "occupancyPct"
                ? [`${value}%`, "Occupancy"]
                : [String(value), String(name)]
            }
            labelFormatter={(label) => `Week of ${String(label)}`}
          />
          <Bar dataKey="occupancyPct" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
