"use client";
import { useId, useState } from "react";
import { ChevronDown, TrendingUp } from "lucide-react";
import type { WorkspaceData } from "@/lib/types";
import { date, money, sameDay } from "@/lib/utils";

export function VisitsChart({ data }: { data: WorkspaceData }) {
  const id = useId();
  const [period, setPeriod] = useState(7);
  const [hover, setHover] = useState<number | null>(null);
  const now = new Date();
  const values = Array.from({ length: period }, (_, i) => {
    const day = new Date(now);
    day.setDate(day.getDate() - (period - 1 - i));
    return {
      day,
      count: data.appointments.filter((a) => sameDay(a.startsAt, day) && a.status !== "Cancelled")
        .length,
    };
  });
  const total = values.reduce((sum, v) => sum + v.count, 0);
  const previous = data.appointments.filter((a) => {
    const d = new Date(a.startsAt);
    const start = new Date(now);
    start.setDate(start.getDate() - period * 2 + 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setDate(end.getDate() - period + 1);
    end.setHours(0, 0, 0, 0);
    return d >= start && d < end && a.status !== "Cancelled";
  }).length;
  const max = Math.max(8, ...values.map((v) => v.count));
  const points = values
    .map((v, i) => `${48 + i * (610 / (period - 1))},${180 - (v.count / max) * 140}`)
    .join(" ");
  const selected = hover === null ? null : values[hover];
  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <h2>Patient visits</h2>
          <p>A little perspective on your practice.</p>
        </div>
        <div className="select-small">
          <select
            aria-label="Chart period"
            value={period}
            onChange={(e) => setPeriod(Number(e.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          <ChevronDown size={13} />
        </div>
      </div>
      <div className="chart-total">
        <strong>{total.toLocaleString()}</strong>
        <span className="change">
          <TrendingUp size={13} />
          {previous ? `${Math.round(((total - previous) / previous) * 100)}%` : "—"}
        </span>
        <span className="muted">vs. previous period</span>
      </div>
      <div className="chart-wrap">
        <svg
          viewBox="0 0 700 225"
          role="img"
          aria-label={`Patient visits for the last ${period} days: ${total} total`}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b71ef" stopOpacity=".23" />
              <stop offset="100%" stopColor="#8b71ef" stopOpacity=".01" />
            </linearGradient>
          </defs>
          {Array.from({ length: 5 }, (_, i) => (
            <g key={i}>
              <line
                x1="48"
                x2="674"
                y1={40 + i * 35}
                y2={40 + i * 35}
                stroke="#ececf2"
                strokeDasharray="3 4"
              />
              <text x="26" y={44 + i * 35} textAnchor="end" className="axis-label">
                {Math.round(max * (1 - i / 4))}
              </text>
            </g>
          ))}
          <polygon points={`48,180 ${points} 658,180`} fill={`url(#${id})`} />
          <polyline
            points={points}
            fill="none"
            stroke="#8c72e8"
            strokeWidth="2.8"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {values.map((v, i) => (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect
                x={38 + i * (610 / (period - 1))}
                y="25"
                width={period === 7 ? 45 : 20}
                height="165"
                fill="transparent"
              />
              {(period === 7 || i % 5 === 0 || i === period - 1) && (
                <text
                  x={48 + i * (610 / (period - 1))}
                  y="212"
                  textAnchor="middle"
                  className="axis-label"
                >
                  {date(v.day, { month: "short", day: "numeric" })}
                </text>
              )}
              {hover === i && (
                <>
                  <line
                    x1={48 + i * (610 / (period - 1))}
                    x2={48 + i * (610 / (period - 1))}
                    y1="30"
                    y2="180"
                    stroke="#c2b4f1"
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={48 + i * (610 / (period - 1))}
                    cy={180 - (v.count / max) * 140}
                    r="5"
                    fill="#7954de"
                    stroke="white"
                    strokeWidth="2"
                  />
                </>
              )}
            </g>
          ))}
        </svg>
        {selected && (
          <div className="chart-tooltip">
            {date(selected.day, { month: "short", day: "numeric" })}
            <strong>{selected.count} visits</strong>
          </div>
        )}
      </div>
      <div className="chart-legend">
        <span className="legend-dot" />
        Patient visits<span className="muted">All appointment types</span>
      </div>
    </section>
  );
}

export function RevenueChart({ data }: { data: WorkspaceData }) {
  const values = Array.from({ length: 6 }, (_, i) => {
    const month = new Date();
    month.setDate(1);
    month.setMonth(month.getMonth() - 5 + i);
    return {
      label: date(month, { month: "short" }),
      value: data.invoices
        .filter(
          (v) =>
            v.paidAt &&
            new Date(v.paidAt).getMonth() === month.getMonth() &&
            new Date(v.paidAt).getFullYear() === month.getFullYear(),
        )
        .reduce((s, v) => s + v.amount, 0),
    };
  });
  const max = Math.max(1, ...values.map((v) => v.value));
  return (
    <section className="panel revenue-panel">
      <div className="panel-heading">
        <div>
          <h2>Revenue over time</h2>
          <p>Recorded payments, month by month</p>
        </div>
      </div>
      <div className="bar-chart">
        {values.map((v) => (
          <div className="bar-column" key={v.label}>
            <span>{money(v.value)}</span>
            <div className="bar" style={{ height: `${Math.max(3, (v.value / max) * 170)}px` }} />
            <span>{v.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
