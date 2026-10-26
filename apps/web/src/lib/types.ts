export type View =
  | "Overview"
  | "Appointments"
  | "Patients"
  | "Medical records"
  | "Billing"
  | "Consent forms"
  | "Visit summaries"
  | "Telemedicine"
  | "Messages"
  | "Analytics"
  | "Locations";
export interface Location {
  id: string;
  name: string;
  address: string;
}
export interface Patient {
  id: string;
  name: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  locationId: string;
  bloodGroup: string;
  allergies: string;
  createdAt: string;
}
export interface Appointment {
  id: string;
  patientId: string;
  locationId: string;
  provider: string;
  type: string;
  startsAt: string;
  durationMinutes: number;
  status: string;
  reason: string;
}
export interface MedicalRecord {
  id: string;
  patientId: string;
  diagnosis: string;
  notes: string;
  provider: string;
  prescription: string;
  followUp: string;
  createdAt: string;
}
export interface Invoice {
  id: string;
  patientId: string;
  locationId: string;
  number: string;
  description: string;
  amount: number;
  status: string;
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
}
export interface Consent {
  id: string;
  patientId: string;
  title: string;
  body: string;
  signature: string | null;
  signedAt: string | null;
  createdAt: string;
}
export interface Message {
  id: string;
  patientId: string;
  subject: string;
  body: string;
  channel: string;
  direction: string;
  isRead: boolean;
  createdAt: string;
}
export interface WorkspaceData {
  locations: Location[];
  patients: Patient[];
  appointments: Appointment[];
  invoices: Invoice[];
  records: MedicalRecord[];
  consents: Consent[];
  messages: Message[];
  providers: string[];
  demo: boolean;
  generatedAt: string;
}
export type ModalKind =
  | "appointment"
  | "patient"
  | "record"
  | "invoice"
  | "consent"
  | "message"
  | "trial"
  | "help"
  | "location";
export type ModalState =
  | { kind: ModalKind; patientId?: string }
  | { kind: "sign"; consent: Consent }
  | { kind: "profile"; patient: Patient }
  | { kind: "summary"; record: MedicalRecord }
  | { kind: "video"; appointment: Appointment };
