"use client";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Plus,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";
import { useState } from "react";
import type { Appointment, ModalState, View, WorkspaceData } from "@/lib/types";
import { date, money, sameDay, time } from "@/lib/utils";
import { Avatar, Badge, Empty, PanelHeader } from "./ui";
import { VisitsChart } from "./charts";

export function StatCards({ data }: { data: WorkspaceData }) {
  const today = data.appointments.filter(
    (a) => sameDay(a.startsAt, new Date()) && a.status !== "Cancelled",
  );
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const revenue = data.invoices
    .filter(
      (i) =>
        i.paidAt &&
        new Date(i.paidAt).getMonth() === currentMonth &&
        new Date(i.paidAt).getFullYear() === currentYear,
    )
    .reduce((s, i) => s + i.amount, 0);
  const cards = [
    {
      label: "Total patients",
      value: data.patients.length.toLocaleString(),
      icon: Users,
      note: "Across your practice",
      color: "purple",
      detail: `${data.patients.filter((p) => new Date(p.createdAt).getMonth() === currentMonth && new Date(p.createdAt).getFullYear() === currentYear).length} new this month`,
    },
    {
      label: "Today's appointments",
      value: String(today.length).padStart(2, "0"),
      icon: CalendarDays,
      note: "Scheduled for today",
      color: "blue",
      detail: `${today.filter((a) => a.status === "Completed").length} completed`,
    },
    {
      label: "Revenue this month",
      value: money(revenue),
      icon: CircleDollarSign,
      note: "Recorded payments",
      color: "green",
      detail: `${data.invoices.filter((i) => i.status === "Pending").length} invoices pending`,
    },
    {
      label: "Virtual consultations",
      value: String(today.filter((a) => a.type === "Telemedicine").length).padStart(2, "0"),
      icon: Video,
      note: "Scheduled for today",
      color: "peach",
      detail: "Care, from anywhere",
    },
  ];
  return (
    <div className="stats-grid">
      {cards.map((c) => (
        <article className="stat-card" key={c.label}>
          <div className="stat-top">
            <span>{c.label}</span>
            <span className={`stat-icon ${c.color}`}>
              <c.icon size={18} />
            </span>
          </div>
          <strong>{c.value}</strong>
          <div className="stat-bottom">
            <span className={c.color === "purple" ? "change" : "stat-detail"}>
              {c.color === "purple" && <TrendingUp size={12} />} {c.detail}
            </span>
            <span>{c.note}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

export function AppointmentTable({
  appointments,
  data,
  onStatus,
  open,
  compact = false,
}: {
  appointments: Appointment[];
  data: WorkspaceData;
  onStatus: (id: string, status: string) => void;
  open: (modal: ModalState) => void;
  compact?: boolean;
}) {
  return appointments.length === 0 ? (
    <Empty
      title="A little breathing room"
      description="No appointments match this view. Schedule one to get started."
    />
  ) : (
    <div className="table-scroll">
      <table className="appointments-table">
        <thead>
          <tr>
            <th>Patient</th>
            <th>Time</th>
            <th>Type</th>
            {!compact && <th>Provider</th>}
            <th>Status</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {appointments.map((a, i) => {
            const patient = data.patients.find((p) => p.id === a.patientId);
            return (
              <tr key={a.id}>
                <td>
                  <button
                    className="patient-cell"
                    onClick={() => patient && open({ kind: "profile", patient })}
                  >
                    <Avatar name={patient?.name ?? "Patient"} index={i} />
                    <span>
                      <strong>{patient?.name ?? "Visiting patient"}</strong>
                      <small>
                        {patient?.email ?? data.locations.find((l) => l.id === a.locationId)?.name}
                      </small>
                    </span>
                  </button>
                </td>
                <td>
                  <div className="cell-stack">
                    <strong>{time(a.startsAt)}</strong>
                    <small>{a.durationMinutes} min</small>
                  </div>
                </td>
                <td>
                  <span className={`type-cell ${a.type === "Telemedicine" ? "virtual" : ""}`}>
                    {a.type === "Telemedicine" ? (
                      <Video size={13} />
                    ) : (
                      <span className="type-dot" />
                    )}
                    {a.type}
                  </span>
                </td>
                {!compact && <td className="provider-cell">{a.provider}</td>}
                <td>
                  <Badge>{a.status}</Badge>
                </td>
                <td>
                  <div className="row-actions">
                    {a.type === "Telemedicine" && !["Completed", "Cancelled"].includes(a.status) ? (
                      <button
                        className="small-button violet"
                        onClick={() => open({ kind: "video", appointment: a })}
                      >
                        Prepare
                        <ArrowUpRight size={12} />
                      </button>
                    ) : a.status === "Confirmed" ? (
                      <button className="small-button" onClick={() => onStatus(a.id, "Checked in")}>
                        Check in
                      </button>
                    ) : a.status === "Checked in" ? (
                      <button
                        className="small-button"
                        onClick={() => onStatus(a.id, "In progress")}
                      >
                        Start visit
                      </button>
                    ) : a.status === "In progress" ? (
                      <button className="small-button" onClick={() => onStatus(a.id, "Completed")}>
                        Complete
                      </button>
                    ) : a.status === "Pending" ? (
                      <button className="small-button" onClick={() => onStatus(a.id, "Confirmed")}>
                        Confirm
                      </button>
                    ) : (
                      <span className="completed-check">
                        <Check size={15} />
                      </span>
                    )}
                    {!compact && !["Completed", "Cancelled"].includes(a.status) && (
                      <button
                        className="text-button danger"
                        onClick={() => onStatus(a.id, "Cancelled")}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Dashboard({
  data,
  navigate,
  open,
  onStatus,
  exportData,
}: {
  data: WorkspaceData;
  navigate: (view: View) => void;
  open: (modal: ModalState) => void;
  onStatus: (id: string, status: string) => void;
  exportData: () => void;
}) {
  const [day, setDay] = useState(new Date());
  const [filter, setFilter] = useState("All appointments");
  const today = data.appointments.filter((a) => sameDay(a.startsAt, day));
  const active = today.filter((a) => a.status !== "Cancelled");
  const completed = active.filter((a) => a.status === "Completed").length;
  const categories = [
    { label: "Completed", count: completed, color: "#85b9a2" },
    {
      label: "In progress",
      count: active.filter((a) => a.status === "In progress").length,
      color: "#a58be9",
    },
    {
      label: "Upcoming",
      count: active.filter((a) => !["Completed", "In progress"].includes(a.status)).length,
      color: "#e6def8",
    },
  ];
  const completedPercent = active.length ? (completed / active.length) * 100 : 0;
  const inProgressPercent = active.length ? (categories[1].count / active.length) * 100 : 0;
  return (
    <>
      <div className="page-intro">
        <div>
          <div className="welcome-eyebrow">
            <span className="tiny-sun">☀</span> A GOOD DAY TO MAKE A DIFFERENCE
          </div>
          <h1>
            Good morning, Dr. Sarah <span className="wave">✦</span>
          </h1>
          <p>Here&apos;s what&apos;s happening at your practice today.</p>
        </div>
        <div className="intro-actions">
          <button className="button secondary" onClick={exportData}>
            <ArrowDownToLine size={15} />
            Export report
          </button>
          <button className="button primary" onClick={() => open({ kind: "appointment" })}>
            <Plus size={17} />
            New appointment
          </button>
        </div>
      </div>
      <StatCards data={data} />
      <div className="dashboard-middle">
        <VisitsChart data={data} />
        <section className="panel today-panel">
          <PanelHeader title="Today's overview" subtitle="Every appointment is a moment of care." />
          <div className="donut-row">
            <div
              className="donut"
              style={{
                background: `conic-gradient(#85b9a2 0% ${completedPercent}%, #a58be9 ${completedPercent}% ${completedPercent + inProgressPercent}%, #e6def8 ${completedPercent + inProgressPercent}% 100%)`,
              }}
            >
              <div>
                <strong>{active.length}</strong>
                <span>appointments</span>
              </div>
            </div>
            <div className="donut-key">
              {categories.map((c) => (
                <div key={c.label}>
                  <span className="legend-dot" style={{ background: c.color }} />
                  <span>{c.label}</span>
                  <strong>{c.count.toString().padStart(2, "0")}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="overview-foot">
            <span>
              <Clock3 size={14} />A well-organized day starts here.
            </span>
            <button aria-label="View today's appointments" onClick={() => navigate("Appointments")}>
              <ArrowRight size={17} />
            </button>
          </div>
        </section>
      </div>
      <div className="dashboard-bottom">
        <section className="panel schedule-panel">
          <PanelHeader
            title="Appointments"
            subtitle="A thoughtful plan for the day ahead."
            action="View all"
            onAction={() => navigate("Appointments")}
          />
          <div className="schedule-toolbar">
            <div className="tabs small-tabs">
              {["All appointments", "Upcoming", "Completed"].map((tab) => (
                <button
                  key={tab}
                  className={filter === tab ? "active" : ""}
                  onClick={() => setFilter(tab)}
                >
                  {tab}
                  {tab === "All appointments" && <span>{today.length}</span>}
                </button>
              ))}
            </div>
            <div className="date-control">
              <button
                aria-label="Previous day"
                onClick={() =>
                  setDay((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1))
                }
              >
                <ChevronLeft size={15} />
              </button>
              <span>
                <CalendarDays size={13} />
                {sameDay(day, new Date()) ? "Today" : date(day, { month: "short", day: "numeric" })}
              </span>
              <button
                aria-label="Next day"
                onClick={() =>
                  setDay((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1))
                }
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
          <AppointmentTable
            compact
            appointments={today
              .filter(
                (a) =>
                  filter === "All appointments" ||
                  (filter === "Completed"
                    ? a.status === "Completed"
                    : !["Completed", "Cancelled"].includes(a.status)),
              )
              .slice(0, 5)}
            data={data}
            onStatus={onStatus}
            open={open}
          />
          <div className="table-foot">
            <span>Showing up to 5 of {today.length} appointments</span>
            <button className="text-button" onClick={() => navigate("Appointments")}>
              View schedule
              <ArrowRight size={13} />
            </button>
          </div>
        </section>
        <aside className="right-stack">
          <section className="panel activity-panel">
            <PanelHeader
              title="Recent activity"
              action="See all"
              onAction={() => navigate("Messages")}
            />
            <div className="activity-list">
              {data.messages.slice(0, 3).map((m, i) => (
                <button key={m.id} className="activity-item" onClick={() => navigate("Messages")}>
                  <span
                    className={`activity-icon ${i === 0 ? "purple" : i === 1 ? "green" : "blue"}`}
                  >
                    {i === 0 ? (
                      <Users size={14} />
                    ) : i === 1 ? (
                      <Check size={14} />
                    ) : (
                      <CalendarDays size={14} />
                    )}
                  </span>
                  <span>
                    <strong>{m.subject}</strong>
                    <span>
                      {data.patients.find((p) => p.id === m.patientId)?.name ?? "Patient"}
                    </span>
                    <small>
                      {date(m.createdAt, { month: "short", day: "numeric" })} · {time(m.createdAt)}
                    </small>
                  </span>
                  <span className="activity-dot" />
                </button>
              ))}
              {!data.messages.length && (
                <Empty
                  title="You're all caught up"
                  description="Messages and updates will appear here."
                />
              )}
            </div>
          </section>
          <section className="care-note">
            <div className="care-note-art">
              <span>✦</span>
              <span>✧</span>
              <span>+</span>
            </div>
            <span className="eyebrow">LESS ADMIN. MORE HUMAN.</span>
            <h3>
              Great care starts
              <br />
              with a little space.
            </h3>
            <p>
              Your practice, connected.
              <br />
              Your day, a little lighter.
            </p>
            <button onClick={() => open({ kind: "help" })}>
              Explore your workspace
              <ArrowUpRight size={14} />
            </button>
          </section>
        </aside>
      </div>
      <footer className="workspace-footer">
        <span>
          <span className="status-dot" />
          All systems operational
        </span>
        <span>
          Made for better days. And better care. <span className="footer-flower">✳</span>
        </span>
      </footer>
    </>
  );
}
