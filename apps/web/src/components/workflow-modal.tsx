"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  CalendarDays,
  Check,
  CheckCircle2,
  FileText,
  HeartPulse,
  Mail,
  Mic,
  MicOff,
  Monitor,
  ShieldCheck,
  Video,
  VideoOff,
} from "lucide-react";
import type { ModalState, WorkspaceData } from "@/lib/types";
import { api, date, download, inputDate, time } from "@/lib/utils";
import { Avatar, Badge, Modal, Spinner } from "./ui";

interface Props {
  modal: ModalState;
  data: WorkspaceData;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
  open: (m: ModalState) => void;
  locationId: string;
}
const consentText =
  "I authorize the clinical team to perform the consultation and examination discussed with me. I understand the proposed care, have had an opportunity to ask questions, and understand that I may withdraw consent at any time. This consent does not authorize additional procedures without further discussion.";

function Field({
  label,
  name,
  type = "text",
  required = true,
  defaultValue,
  placeholder,
  maxLength,
  min,
  max,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  maxLength?: number;
  min?: string;
  max?: string;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        maxLength={maxLength ?? 250}
        min={min}
        max={max}
        step={type === "number" ? "0.01" : undefined}
      />
    </label>
  );
}
function TextArea({
  label,
  name,
  defaultValue,
  required = true,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="full-field">
      {label}
      <textarea
        name={name}
        required={required}
        defaultValue={defaultValue}
        rows={4}
        maxLength={10000}
        placeholder={placeholder}
      />
    </label>
  );
}

export default function WorkflowModal({ modal, data, onClose, onSaved, open, locationId }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [trialEnd, setTrialEnd] = useState<string | null>(null);
  const kind = modal.kind;
  const patientId = "patientId" in modal ? modal.patientId : undefined;
  const patientSelect = (
    <label>
      Patient
      <select name="patientId" required defaultValue={patientId ?? ""}>
        <option value="" disabled>
          Select a patient
        </option>
        {data.patients.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
  const locationSelect = (
    <label>
      Clinic location
      <select name="locationId" required defaultValue={locationId || data.locations[0]?.id}>
        {data.locations.map((l) => (
          <option value={l.id} key={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
  const providerSelect = (
    <label>
      Provider
      <select name="provider" required>
        {data.providers.map((p) => (
          <option key={p}>{p}</option>
        ))}
      </select>
    </label>
  );
  const title = {
    appointment: "Schedule an appointment",
    patient: "Welcome a new patient",
    record: "Add a medical record",
    invoice: "Create an invoice",
    consent: "Create a consent form",
    message: "A little more connection",
    trial: "Make room for better care",
    help: "Your practice, connected",
    profile: "Patient profile",
    summary: "Post-visit summary",
    sign: "Patient consent",
    video: "Prepare your virtual visit",
    location: "Connect a new location",
  }[kind];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const fields = Object.fromEntries(form.entries()) as Record<string, string>;
    try {
      let path = "";
      let body: unknown = fields;
      switch (kind) {
        case "location":
          path = "locations";
          break;
        case "appointment":
          path = "appointments";
          body = {
            ...fields,
            startsAt: new Date(fields.startsAt).toISOString(),
            durationMinutes: Number(fields.durationMinutes),
          };
          break;
        case "patient":
          path = "patients";
          break;
        case "record":
          path = "records";
          break;
        case "invoice":
          path = "invoices";
          body = {
            ...fields,
            amount: Number(fields.amount),
            dueAt: new Date(fields.dueAt + "T23:59:00").toISOString(),
          };
          break;
        case "consent":
          path = "consents";
          break;
        case "message":
          path = "messages";
          break;
        case "sign":
          path = `consents/${modal.kind === "sign" ? modal.consent.id : ""}/sign`;
          body = { signature: fields.signature, accepted: fields.accepted === "on" };
          break;
        case "trial": {
          const result = await api<{ endsAt: string }>("trials", "POST", fields);
          setTrialEnd(result.endsAt);
          return;
        }
        default:
          return;
      }
      await api(path, "POST", body);
      await onSaved(
        kind === "message"
          ? "Message saved to the portal outbox"
          : kind === "sign"
            ? "Signed acknowledgment saved"
            : "Saved successfully",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (kind === "profile" && modal.kind === "profile") {
    const p = modal.patient;
    const records = data.records.filter((r) => r.patientId === p.id);
    return (
      <Modal title={title} onClose={onClose} wide>
        <div className="profile-hero">
          <Avatar name={p.name} size="large" />
          <div>
            <h2>{p.name}</h2>
            <p>Patient since {date(p.createdAt, { month: "long", year: "numeric" })}</p>
          </div>
          <span className="blood-badge">{p.bloodGroup}</span>
        </div>
        <div className="profile-details">
          {[
            ["Date of birth", date(p.dateOfBirth + "T12:00:00")],
            ["Email", p.email],
            ["Phone", p.phone],
            ["Location", data.locations.find((l) => l.id === p.locationId)?.name],
            ["Allergies", p.allergies],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <div className="profile-section">
          <h3>Clinical history</h3>
          {records.map((r) => (
            <button
              className="profile-record"
              key={r.id}
              onClick={() => open({ kind: "summary", record: r })}
            >
              <FileText size={18} />
              <span>
                <strong>{r.diagnosis}</strong>
                <small>
                  {date(r.createdAt)} · {r.provider}
                </small>
              </span>
              <ArrowDownToLine size={16} />
            </button>
          ))}
          {!records.length && <p className="muted">No medical records recorded yet.</p>}
        </div>
        <div className="modal-actions">
          <button
            className="button secondary"
            onClick={() => open({ kind: "record", patientId: p.id })}
          >
            <FileText size={15} />
            Add record
          </button>
          <button
            className="button primary"
            onClick={() => open({ kind: "appointment", patientId: p.id })}
          >
            <CalendarDays size={15} />
            Schedule visit
          </button>
        </div>
      </Modal>
    );
  }
  if (kind === "summary" && modal.kind === "summary") {
    const r = modal.record;
    const p = data.patients.find((p) => p.id === r.patientId);
    const content = `CAREFLOW | POST-VISIT SUMMARY\n\nPatient: ${p?.name ?? "Patient"}\nDate: ${date(r.createdAt)}\nProvider: ${r.provider}\n\nDIAGNOSIS\n${r.diagnosis}\n\nCLINICAL NOTES\n${r.notes}\n\nMEDICATION / CARE PLAN\n${r.prescription || "None recorded"}\n\nFOLLOW-UP\n${r.followUp || "None recorded"}\n`;
    return (
      <Modal title={title} subtitle="A clear plan to take home." onClose={onClose} wide>
        <div className="visit-summary">
          <div className="summary-brand">
            <HeartPulse size={23} />
            careflow<span>{date(r.createdAt)}</span>
          </div>
          <h2>{p?.name}</h2>
          <p className="muted">Consultation with {r.provider}</p>
          {[
            ["Diagnosis", r.diagnosis],
            ["Clinical notes", r.notes],
            ["Medication & care plan", r.prescription || "None recorded."],
            ["Next steps", r.followUp || "No follow-up recorded."],
          ].map(([label, value]) => (
            <section key={label}>
              <h3>{label}</h3>
              <p>{value}</p>
            </section>
          ))}
        </div>
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            Close
          </button>
          <button
            className="button primary"
            onClick={() =>
              download(`visit-summary-${p?.name.replaceAll(" ", "-") ?? "patient"}.txt`, content)
            }
          >
            <ArrowDownToLine size={15} />
            Download summary
          </button>
        </div>
      </Modal>
    );
  }
  if (kind === "video" && modal.kind === "video")
    return <VideoPreview data={data} modal={modal} onClose={onClose} />;
  if (kind === "help")
    return (
      <Modal title={title} subtitle="A little less admin, a lot more human." onClose={onClose}>
        <div className="help-grid">
          {[
            [
              CalendarDays,
              "A calmer schedule",
              "Schedule visits, avoid overlapping appointments, and move from check-in to completion.",
            ],
            [
              FileText,
              "The complete picture",
              "Keep clinical notes, patient consent, and visit summaries together.",
            ],
            [
              ShieldCheck,
              "One connected workspace",
              "Switch clinic locations from the header. Export your current data whenever you need it.",
            ],
          ].map(([Icon, heading, text], i) => {
            const Component = Icon as typeof FileText;
            return (
              <div key={i}>
                <Component size={23} />
                <div>
                  <h3>{heading as string}</h3>
                  <p>{text as string}</p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="info-note">
          This starter saves portal messages and payment records. Patient delivery, video calls,
          payment processing, and a patient login portal require additional integrations.
        </p>
        <div className="modal-actions">
          <button className="button primary" onClick={onClose}>
            Back to better care
            <Check size={16} />
          </button>
        </div>
      </Modal>
    );

  return (
    <Modal
      title={title}
      subtitle={
        kind === "trial"
          ? "Try Careflow for 14 days. No card required."
          : "The small details make a big difference."
      }
      onClose={onClose}
    >
      {trialEnd ? (
        <div className="trial-success">
          <CheckCircle2 size={52} />
          <h2>Your trial is registered.</h2>
          <p>
            Your 14-day evaluation ends on {date(trialEnd)}. Explore this workspace to get a feel
            for Careflow.
          </p>
          <p className="muted">
            This registers your interest locally; it does not provision a separate clinic account.
          </p>
          <button className="button primary" onClick={onClose}>
            Explore your workspace
          </button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <fieldset disabled={busy} className="form-fields">
            <div className="form-grid">
              {kind === "location" && (
                <>
                  <Field label="Location name" name="name" maxLength={120} />
                  <Field label="Address" name="address" maxLength={500} />
                </>
              )}
              {kind === "appointment" && (
                <>
                  {patientSelect}
                  {locationSelect}
                  {providerSelect}
                  <label>
                    Appointment type
                    <select name="type">
                      <option>Consultation</option>
                      <option>Follow-up</option>
                      <option>Telemedicine</option>
                      <option>Check-up</option>
                    </select>
                  </label>
                  <Field
                    label="Date & time"
                    name="startsAt"
                    type="datetime-local"
                    min={`${inputDate()}T00:00`}
                  />
                  <label>
                    Duration
                    <select name="durationMinutes">
                      <option value="15">15 minutes</option>
                      <option value="30">30 minutes</option>
                      <option value="45">45 minutes</option>
                      <option value="60">60 minutes</option>
                    </select>
                  </label>
                  <TextArea
                    label="Reason for visit"
                    name="reason"
                    required={false}
                    placeholder="What brings the patient in today?"
                  />
                </>
              )}
              {kind === "patient" && (
                <>
                  <Field
                    label="Full name"
                    name="name"
                    placeholder="e.g. Olivia Rhye"
                    maxLength={120}
                  />
                  <Field
                    label="Date of birth"
                    name="dateOfBirth"
                    type="date"
                    max={inputDate()}
                    min="1900-01-01"
                  />
                  <Field
                    label="Email address"
                    name="email"
                    type="email"
                    placeholder="patient@example.com"
                    maxLength={254}
                  />
                  <Field label="Phone number" name="phone" type="tel" maxLength={40} />
                  {locationSelect}
                  <label>
                    Blood group
                    <select name="bloodGroup">
                      {["Unknown", "O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                    </select>
                  </label>
                  <TextArea label="Known allergies" name="allergies" defaultValue="None recorded" />
                </>
              )}
              {kind === "record" && (
                <>
                  {patientSelect}
                  {providerSelect}
                  <div className="full-field">
                    <Field label="Diagnosis / visit title" name="diagnosis" maxLength={250} />
                  </div>
                  <TextArea
                    label="Clinical notes"
                    name="notes"
                    placeholder="Document the consultation, examination, and findings."
                  />
                  <TextArea label="Medication & care plan" name="prescription" required={false} />
                  <TextArea label="Follow-up instructions" name="followUp" required={false} />
                </>
              )}
              {kind === "invoice" && (
                <>
                  {patientSelect}
                  {locationSelect}
                  <div className="full-field">
                    <Field
                      label="Service description"
                      name="description"
                      placeholder="e.g. General consultation"
                    />
                  </div>
                  <Field
                    label="Amount (USD)"
                    name="amount"
                    type="number"
                    min="0.01"
                    max="1000000"
                  />
                  <Field
                    label="Due date"
                    name="dueAt"
                    type="date"
                    min={inputDate()}
                    defaultValue={inputDate(new Date(Date.now() + 14 * 86400000))}
                  />
                  <p className="info-note full-field">
                    This creates a billing record. No card will be charged.
                  </p>
                </>
              )}
              {kind === "consent" && (
                <>
                  {patientSelect}
                  <Field
                    label="Form title"
                    name="title"
                    defaultValue="General treatment consent"
                    maxLength={200}
                  />
                  <TextArea label="Consent terms" name="body" defaultValue={consentText} />
                </>
              )}
              {kind === "message" && (
                <>
                  <div className="full-field">{patientSelect}</div>
                  <div className="full-field">
                    <Field label="Subject" name="subject" maxLength={200} />
                  </div>
                  <TextArea label="Message" name="body" placeholder="Write a thoughtful message…" />
                  <p className="info-note full-field">
                    <Mail size={15} />
                    Saved to the portal outbox. Email and SMS delivery are not connected.
                  </p>
                </>
              )}
              {kind === "trial" && (
                <>
                  <div className="trial-perks full-field">
                    <span>
                      <CheckCircle2 size={16} />
                      All workspace features
                    </span>
                    <span>
                      <CheckCircle2 size={16} />
                      14 days to explore
                    </span>
                    <span>
                      <CheckCircle2 size={16} />
                      No payment required
                    </span>
                  </div>
                  <div className="full-field">
                    <Field
                      label="Clinic name"
                      name="clinicName"
                      placeholder="Your practice name"
                      maxLength={120}
                    />
                  </div>
                  <div className="full-field">
                    <Field label="Work email" name="email" type="email" maxLength={254} />
                  </div>
                  <p className="info-note full-field">
                    Registers a local evaluation request. Separate accounts and automatic trial
                    expiry are not provisioned by this starter.
                  </p>
                </>
              )}
              {kind === "sign" && modal.kind === "sign" && (
                <>
                  <div className="full-field consent-document">
                    <div className="consent-document-heading">
                      <FileText size={25} />
                      <div>
                        <h3>{modal.consent.title}</h3>
                        <p>{data.patients.find((p) => p.id === modal.consent.patientId)?.name}</p>
                      </div>
                      <Badge>{modal.consent.signedAt ? "Signed" : "Pending"}</Badge>
                    </div>
                    <p>{modal.consent.body}</p>
                    {modal.consent.signedAt && (
                      <div className="signature-box">
                        <span>Signed acknowledgment</span>
                        <strong>{modal.consent.signature}</strong>
                        <small>
                          {date(modal.consent.signedAt)} at {time(modal.consent.signedAt)}
                        </small>
                      </div>
                    )}
                  </div>
                  {!modal.consent.signedAt && (
                    <>
                      <div className="full-field">
                        <Field
                          label="Patient / authorized representative full name"
                          name="signature"
                          maxLength={120}
                        />
                      </div>
                      <label className="checkbox-label full-field">
                        <input name="accepted" type="checkbox" required />I have read the terms
                        above, had an opportunity to ask questions, and voluntarily agree.
                      </label>
                      <p className="info-note full-field">
                        Capture this acknowledgment with the patient present. Identity verification
                        and jurisdiction-specific signature requirements are not implemented.
                      </p>
                    </>
                  )}
                </>
              )}
            </div>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="button secondary" onClick={onClose}>
                {kind === "sign" && modal.kind === "sign" && modal.consent.signedAt
                  ? "Close"
                  : "Cancel"}
              </button>
              {!(kind === "sign" && modal.kind === "sign" && modal.consent.signedAt) && (
                <button className="button primary" type="submit" disabled={busy}>
                  {busy ? (
                    <Spinner />
                  ) : kind === "message" ? (
                    <Mail size={15} />
                  ) : (
                    <Check size={16} />
                  )}{" "}
                  {busy
                    ? "Saving…"
                    : kind === "appointment"
                      ? "Schedule appointment"
                      : kind === "trial"
                        ? "Register free trial"
                        : kind === "sign"
                          ? "Sign acknowledgment"
                          : kind === "message"
                            ? "Save to outbox"
                            : "Save changes"}
                </button>
              )}
            </div>
          </fieldset>
        </form>
      )}
    </Modal>
  );
}

function VideoPreview({
  data,
  modal,
  onClose,
}: {
  data: WorkspaceData;
  modal: Extract<ModalState, { kind: "video" }>;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const [camera, setCamera] = useState(false);
  const [microphone, setMicrophone] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  async function enableCamera() {
    if (camera) {
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      setCamera(false);
      return;
    }
    setError("");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (!mounted.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      media.getAudioTracks().forEach((t) => {
        t.enabled = microphone;
      });
      if (video.current) video.current.srcObject = media;
      setCamera(true);
    } catch {
      setError(
        "Camera or microphone access was unavailable. Check your browser permissions and connected devices.",
      );
    }
  }
  const p = data.patients.find((p) => p.id === modal.appointment.patientId);
  return (
    <Modal
      title="Prepare your virtual visit"
      subtitle={`${p?.name ?? "Patient"} · ${date(modal.appointment.startsAt)} at ${time(modal.appointment.startsAt)}`}
      onClose={onClose}
      wide
    >
      <div className="video-preview">
        <video ref={video} autoPlay muted playsInline className={camera ? "" : "hidden"} />
        {!camera && (
          <div>
            <VideoOff size={42} />
            <p>Your camera is off</p>
          </div>
        )}
        <span className="video-label">You · {modal.appointment.provider}</span>
      </div>
      <div className="video-controls">
        <button
          className={`button ${camera ? "primary" : "secondary"}`}
          onClick={() => void enableCamera()}
        >
          {camera ? <Video size={17} /> : <VideoOff size={17} />}{" "}
          {camera ? "Camera on" : "Test camera"}
        </button>
        <button
          className="button secondary"
          onClick={() => {
            const enabled = !microphone;
            setMicrophone(enabled);
            stream.current?.getAudioTracks().forEach((t) => {
              t.enabled = enabled;
            });
          }}
        >
          {microphone ? <Mic size={17} /> : <MicOff size={17} />}{" "}
          {microphone ? "Mic on" : "Mic off"}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="info-note">
        <Monitor size={18} />
        This is a local device check. Connect a telehealth provider and authenticated patient rooms
        to enable live consultations.
      </p>
      <div className="modal-actions">
        <button className="button primary" onClick={onClose}>
          Finish device check
          <Check size={16} />
        </button>
      </div>
    </Modal>
  );
}
