"use client";
import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  FileHeart,
  FileText,
  Mail,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Users,
  Video,
} from "lucide-react";
import type { ModalState, View, WorkspaceData } from "@/lib/types";
import { date, money, sameDay, time } from "@/lib/utils";
import { Avatar, Badge, Empty, PanelHeader } from "./ui";
import { AppointmentTable, StatCards } from "./dashboard";
import { RevenueChart, VisitsChart } from "./charts";

interface Props {
  view: View;
  data: WorkspaceData;
  search: string;
  open: (m: ModalState) => void;
  mutate: (path: string, method?: string, body?: unknown, success?: string) => Promise<void>;
  setLocation: (id: string) => void;
  exportData: () => void;
}
const subtitles: Record<string, string> = {
  Appointments: "Every visit starts with a thoughtful plan.",
  Patients: "A familiar face. A complete picture of their care.",
  "Medical records": "Connected records for more informed care.",
  Billing: "Keep the business of care beautifully simple.",
  "Consent forms": "Clear conversations. Confident decisions.",
  "Visit summaries": "Good care continues beyond the consultation.",
  Telemedicine: "A little closer, wherever they are.",
  Messages: "Keep the conversation going.",
  Analytics: "A clearer view of your growing practice.",
  Locations: "One connected practice. Every location.",
};
export default function Modules({
  view,
  data,
  search,
  open,
  mutate,
  setLocation,
  exportData,
}: Props) {
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [status, setStatus] = useState("All statuses");
  const [messageId, setMessageId] = useState<string | null>(null);
  const patient = (id: string) => data.patients.find((p) => p.id === id);
  const matches = (value: string) => value.toLowerCase().includes(search.toLowerCase());
  const action = (
    {
      Appointments: "appointment",
      Patients: "patient",
      "Medical records": "record",
      Billing: "invoice",
      "Consent forms": "consent",
      "Visit summaries": "record",
      Telemedicine: "appointment",
      Messages: "message",
      Locations: "location",
    } as const
  )[view as Exclude<View, "Overview" | "Analytics">];
  const actionLabel: Record<string, string> = {
    appointment: "New appointment",
    patient: "Add patient",
    record: "Add medical record",
    invoice: "Create invoice",
    consent: "Create consent form",
    message: "Compose message",
    location: "Add location",
  };
  const message = data.messages.find((m) => m.id === messageId);
  const selectedDateAppointments = data.appointments.filter(
    (a) =>
      sameDay(a.startsAt, selectedDay) &&
      matches(`${patient(a.patientId)?.name ?? ""} ${a.provider} ${a.type}`) &&
      (status === "All statuses" || a.status === status),
  );
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">YOUR CONNECTED WORKSPACE</span>
          <h1>{view}</h1>
          <p>{subtitles[view]}</p>
        </div>
        <div className="intro-actions">
          {view === "Analytics" && (
            <button className="button secondary" onClick={exportData}>
              <ArrowDownToLine size={16} />
              Export report
            </button>
          )}
          {action && (
            <button className="button primary" onClick={() => open({ kind: action })}>
              <Plus size={17} />
              {actionLabel[action]}
            </button>
          )}
        </div>
      </div>
      {view === "Appointments" && (
        <section className="panel">
          <div className="panel-heading schedule-page-heading">
            <div className="schedule-title">
              <CalendarDays size={20} />
              <div>
                <h2>{date(selectedDay, { weekday: "long", month: "long", day: "numeric" })}</h2>
                <p>{selectedDateAppointments.length} appointments scheduled</p>
              </div>
            </div>
            <div className="schedule-controls">
              <button className="small-button" onClick={() => setSelectedDay(new Date())}>
                Today
              </button>
              <button
                className="icon-button"
                aria-label="Previous day"
                onClick={() =>
                  setSelectedDay((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1))
                }
              >
                <ChevronLeft size={18} />
              </button>
              <input
                aria-label="Schedule date"
                type="date"
                value={`${selectedDay.getFullYear()}-${String(selectedDay.getMonth() + 1).padStart(2, "0")}-${String(selectedDay.getDate()).padStart(2, "0")}`}
                onChange={(e) =>
                  e.target.value && setSelectedDay(new Date(e.target.value + "T12:00:00"))
                }
              />
              <button
                className="icon-button"
                aria-label="Next day"
                onClick={() =>
                  setSelectedDay((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1))
                }
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className="filter-row">
            <span>
              <Search size={15} />
              Search patients or providers using the search above
            </span>
            <select
              aria-label="Appointment status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {[
                "All statuses",
                "Pending",
                "Confirmed",
                "Checked in",
                "In progress",
                "Completed",
                "Cancelled",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <AppointmentTable
            appointments={selectedDateAppointments}
            data={data}
            open={open}
            onStatus={(id, value) =>
              void mutate(`appointments/${id}`, "PATCH", { status: value }, "Appointment updated")
            }
          />
        </section>
      )}
      {view === "Patients" && (
        <section className="panel">
          <PanelHeader
            title="Patient directory"
            subtitle={`${data.patients.length} people, each with a story.`}
          />
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Date of birth</th>
                  <th>Contact</th>
                  <th>Location</th>
                  <th>Blood group</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.patients
                  .filter((p) => matches(`${p.name} ${p.email} ${p.phone}`))
                  .map((p, i) => (
                    <tr key={p.id}>
                      <td>
                        <button
                          className="patient-cell"
                          onClick={() => open({ kind: "profile", patient: p })}
                        >
                          <Avatar name={p.name} index={i} />
                          <span>
                            <strong>{p.name}</strong>
                            <small>Patient · {p.id.slice(0, 8).toUpperCase()}</small>
                          </span>
                        </button>
                      </td>
                      <td>{date(p.dateOfBirth + "T12:00:00")}</td>
                      <td>
                        <div className="cell-stack">
                          <strong>{p.email}</strong>
                          <small>{p.phone}</small>
                        </div>
                      </td>
                      <td>{data.locations.find((l) => l.id === p.locationId)?.name}</td>
                      <td>
                        <span className="blood-badge">{p.bloodGroup}</span>
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => open({ kind: "profile", patient: p })}
                        >
                          View profile
                          <ArrowUpRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!data.patients.filter((p) => matches(`${p.name} ${p.email} ${p.phone}`)).length && (
            <Empty
              title="No patients found"
              description="Try another search or add your first patient."
            />
          )}
        </section>
      )}
      {view === "Medical records" && (
        <div className="record-grid">
          {data.records
            .filter((r) => matches(`${patient(r.patientId)?.name} ${r.diagnosis} ${r.notes}`))
            .map((r, i) => (
              <article className="panel record-card" key={r.id}>
                <div className="record-patient">
                  <Avatar name={patient(r.patientId)?.name ?? "Patient"} index={i} />
                  <div>
                    <strong>{patient(r.patientId)?.name}</strong>
                    <small>{date(r.createdAt)}</small>
                  </div>
                  <FileHeart size={21} />
                </div>
                <h3>{r.diagnosis}</h3>
                <p>{r.notes}</p>
                <div className="record-meta">
                  <span>{r.provider}</span>
                  <button
                    className="text-button"
                    onClick={() => open({ kind: "summary", record: r })}
                  >
                    Open record
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              </article>
            ))}
          {!data.records.length && (
            <Empty
              title="A fresh patient chart"
              description="Add a record to document a consultation."
            />
          )}
        </div>
      )}
      {view === "Billing" && (
        <>
          <div className="billing-stats">
            <div className="panel">
              <span>Total billed</span>
              <strong>{money(data.invoices.reduce((s, i) => s + i.amount, 0))}</strong>
              <small>Across all invoices</small>
            </div>
            <div className="panel">
              <span>Payments recorded</span>
              <strong className="green-text">
                {money(
                  data.invoices
                    .filter((i) => i.status === "Paid")
                    .reduce((s, i) => s + i.amount, 0),
                )}
              </strong>
              <small>Manually recorded payments</small>
            </div>
            <div className="panel">
              <span>Outstanding balance</span>
              <strong>
                {money(
                  data.invoices
                    .filter((i) => i.status !== "Paid")
                    .reduce((s, i) => s + i.amount, 0),
                )}
              </strong>
              <small>Awaiting payment</small>
            </div>
          </div>
          <section className="panel">
            <PanelHeader title="Invoices" subtitle="All your billing, in one place." />
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Patient</th>
                    <th>Service</th>
                    <th>Due date</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.invoices
                    .filter((i) =>
                      matches(`${i.number} ${patient(i.patientId)?.name} ${i.description}`),
                    )
                    .map((i) => (
                      <tr key={i.id}>
                        <td className="invoice-number">{i.number}</td>
                        <td>{patient(i.patientId)?.name ?? "Visiting patient"}</td>
                        <td>{i.description}</td>
                        <td>{date(i.dueAt)}</td>
                        <td className="amount">{money(i.amount)}</td>
                        <td>
                          <Badge>{i.status}</Badge>
                        </td>
                        <td>
                          {i.status !== "Paid" && (
                            <button
                              className="small-button"
                              onClick={() =>
                                void mutate(`invoices/${i.id}/pay`, "POST", {}, "Payment recorded")
                              }
                            >
                              Record payment
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!data.invoices.length && (
              <Empty
                title="Your billing starts here"
                description="Create an invoice for a patient consultation."
              />
            )}
          </section>
          <p className="module-note">
            <ShieldCheck size={14} />
            Recording a payment updates the ledger. This workspace does not charge a card.
          </p>
        </>
      )}
      {view === "Consent forms" && (
        <section className="panel">
          <PanelHeader
            title="Patient consent"
            subtitle="Review terms together, then capture an acknowledgment."
          />
          <div className="consent-list">
            {data.consents
              .filter((c) => matches(`${patient(c.patientId)?.name} ${c.title}`))
              .map((c) => (
                <div className="consent-item" key={c.id}>
                  <span className={`document-icon ${c.signedAt ? "green" : "purple"}`}>
                    <FileCheck2 size={23} />
                  </span>
                  <div>
                    <h3>{c.title}</h3>
                    <p>
                      {patient(c.patientId)?.name} <span>·</span> Created {date(c.createdAt)}
                    </p>
                  </div>
                  <Badge>{c.signedAt ? "Signed" : "Awaiting signature"}</Badge>
                  <button
                    className="button secondary"
                    onClick={() => open({ kind: "sign", consent: c })}
                  >
                    {c.signedAt ? "View form" : "Review & sign"}
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              ))}
          </div>
          {!data.consents.length && (
            <Empty
              title="Care starts with understanding"
              description="Create your first consent form."
            />
          )}
        </section>
      )}
      {view === "Visit summaries" && (
        <div className="summary-grid">
          {data.records
            .filter((r) => matches(`${patient(r.patientId)?.name} ${r.diagnosis}`))
            .map((r, i) => (
              <article className="panel summary-card" key={r.id}>
                <div className="summary-card-top">
                  <span className="document-icon purple">
                    <FileText size={23} />
                  </span>
                  <span>{date(r.createdAt)}</span>
                </div>
                <h3>{r.diagnosis}</h3>
                <div className="summary-patient">
                  <Avatar name={patient(r.patientId)?.name ?? "Patient"} index={i} />
                  <div>
                    <strong>{patient(r.patientId)?.name}</strong>
                    <small>{r.provider}</small>
                  </div>
                </div>
                <div className="summary-followup">
                  <span>FOLLOW-UP PLAN</span>
                  <p>{r.followUp || "No follow-up instructions recorded."}</p>
                </div>
                <button
                  className="button secondary"
                  onClick={() => open({ kind: "summary", record: r })}
                >
                  View visit summary
                  <ArrowRight size={15} />
                </button>
              </article>
            ))}
          {!data.records.length && (
            <Empty
              title="Care to take home"
              description="Visit summaries are generated from medical records."
            />
          )}
        </div>
      )}
      {view === "Telemedicine" && (
        <>
          <div className="telemedicine-banner">
            <div>
              <span className="eyebrow">CARE BEYOND THE CLINIC</span>
              <h2>
                A familiar face.
                <br />
                From any place.
              </h2>
              <p>
                Manage virtual appointments and check your camera
                <br />
                before your consultation.
              </p>
            </div>
            <div className="tele-art">
              <div>
                <Video size={48} />
              </div>
              <span className="tele-spark">✦</span>
              <span className="tele-spark small">✧</span>
            </div>
          </div>
          <section className="panel">
            <PanelHeader
              title="Virtual appointments"
              subtitle="Upcoming and recent remote consultations"
            />
            <div className="virtual-list">
              {data.appointments
                .filter(
                  (a) =>
                    a.type === "Telemedicine" &&
                    !["Completed", "Cancelled"].includes(a.status) &&
                    matches(`${patient(a.patientId)?.name} ${a.provider}`),
                )
                .map((a, i) => (
                  <div className="virtual-item" key={a.id}>
                    <Avatar name={patient(a.patientId)?.name ?? "Patient"} index={i} />
                    <div>
                      <h3>{patient(a.patientId)?.name ?? "Visiting patient"}</h3>
                      <p>
                        {a.provider} · {date(a.startsAt)} at {time(a.startsAt)}
                      </p>
                    </div>
                    <Badge>{a.status}</Badge>
                    <button
                      className="button primary"
                      onClick={() => open({ kind: "video", appointment: a })}
                    >
                      <Video size={15} />
                      Prepare visit
                    </button>
                  </div>
                ))}
            </div>
            {!data.appointments.some(
              (a) => a.type === "Telemedicine" && !["Completed", "Cancelled"].includes(a.status),
            ) && (
              <Empty
                title="No virtual visits queued"
                description="Choose Telemedicine when scheduling an appointment."
              />
            )}
          </section>
          <p className="module-note">
            <Video size={14} />
            Camera preview is local. A video provider must be connected to enable patient calls.
          </p>
        </>
      )}
      {view === "Messages" && (
        <section className="panel messages-panel">
          <div className="message-inbox">
            <PanelHeader
              title="Inbox"
              subtitle={`${data.messages.filter((m) => !m.isRead && m.direction === "Inbound").length} unread conversations`}
            />
            {data.messages
              .filter((m) => matches(`${patient(m.patientId)?.name} ${m.subject} ${m.body}`))
              .map((m, i) => (
                <button
                  className={`message-preview ${m.id === messageId ? "selected" : ""} ${!m.isRead ? "unread" : ""}`}
                  key={m.id}
                  onClick={() => {
                    setMessageId(m.id);
                    if (!m.isRead) void mutate(`messages/${m.id}/read`, "PATCH");
                  }}
                >
                  <Avatar name={patient(m.patientId)?.name ?? "Patient"} index={i} />
                  <span>
                    <span className="message-from">
                      <strong>{patient(m.patientId)?.name}</strong>
                      <small>{date(m.createdAt, { month: "short", day: "numeric" })}</small>
                    </span>
                    <strong className="message-subject">{m.subject}</strong>
                    <span className="message-excerpt">{m.body}</span>
                  </span>
                  {!m.isRead && <span className="unread-dot" />}
                </button>
              ))}
          </div>
          <div className="message-detail">
            {message ? (
              <>
                <div className="message-detail-heading">
                  <span className="eyebrow">
                    {message.direction === "Inbound"
                      ? "RECEIVED IN PORTAL"
                      : "SAVED TO PORTAL OUTBOX"}
                  </span>
                  <h2>{message.subject}</h2>
                  <div className="summary-patient">
                    <Avatar name={patient(message.patientId)?.name ?? "Patient"} />
                    <div>
                      <strong>{patient(message.patientId)?.name}</strong>
                      <small>
                        {date(message.createdAt)} at {time(message.createdAt)}
                      </small>
                    </div>
                  </div>
                </div>
                <p className="message-body">{message.body}</p>
                <div className="message-reply">
                  <button
                    className="button primary"
                    onClick={() => open({ kind: "message", patientId: message.patientId })}
                  >
                    <Mail size={15} />
                    Compose reply
                  </button>
                </div>
              </>
            ) : (
              <Empty
                title="A little connection goes a long way"
                description="Select a message to read the conversation."
              />
            )}
          </div>
        </section>
      )}
      {view === "Analytics" && (
        <>
          <StatCards data={data} />
          <div className="analytics-grid">
            <VisitsChart data={data} />
            <RevenueChart data={data} />
          </div>
          <section className="panel">
            <PanelHeader
              title="Practice at a glance"
              subtitle="Calculated from your current location selection."
            />
            <div className="analytics-breakdown">
              {["Consultation", "Follow-up", "Telemedicine", "Check-up"].map((type) => {
                const count = data.appointments.filter(
                  (a) => a.type === type && a.status !== "Cancelled",
                ).length;
                const denominator = data.appointments.filter(
                  (a) => a.status !== "Cancelled",
                ).length;
                return (
                  <div key={type}>
                    <div>
                      <strong>{type}</strong>
                      <span>
                        {count} visits · {Math.round((count / Math.max(1, denominator)) * 100)}%
                      </span>
                    </div>
                    <div className="progress-track">
                      <span style={{ width: `${(count / Math.max(1, denominator)) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
      {view === "Locations" && (
        <div className="location-grid">
          {data.locations
            .filter((l) => matches(`${l.name} ${l.address}`))
            .map((l, i) => (
              <article className="panel location-card" key={l.id}>
                <div className={`location-art location-art-${i}`}>
                  <MapPin size={34} />
                  <span>+</span>
                  <i />
                  <i />
                </div>
                <div className="location-card-body">
                  <span className="eyebrow">CONNECTED LOCATION</span>
                  <h2>{l.name}</h2>
                  <p>
                    <MapPin size={14} />
                    {l.address}
                  </p>
                  <div className="location-count">
                    <Users size={16} />
                    {data.patients.filter((p) => p.locationId === l.id).length} patients in current
                    view
                  </div>
                  <button className="button secondary" onClick={() => setLocation(l.id)}>
                    Open this location
                    <ArrowRight size={15} />
                  </button>
                </div>
              </article>
            ))}
        </div>
      )}
    </>
  );
}
