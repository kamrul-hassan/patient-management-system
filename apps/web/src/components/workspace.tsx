"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CreditCard,
  FileCheck2,
  FileHeart,
  FileText,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  X,
} from "lucide-react";
import type { ModalState, View, WorkspaceData } from "@/lib/types";
import { api, csvCell, date, download } from "@/lib/utils";
import { Avatar, Spinner } from "./ui";
import Dashboard from "./dashboard";
import Modules from "./modules";
import WorkflowModal from "./workflow-modal";

const mainNavigation = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Appointments", icon: CalendarDays },
  { label: "Patients", icon: Users },
  { label: "Medical records", icon: FileHeart },
  { label: "Billing", icon: CreditCard },
  { label: "Consent forms", icon: FileCheck2 },
  { label: "Visit summaries", icon: FileText },
] as const;
const practiceNavigation = [
  { label: "Telemedicine", icon: Video },
  { label: "Messages", icon: MessageSquare },
  { label: "Analytics", icon: ChartNoAxesCombined },
  { label: "Locations", icon: Building2 },
] as const;

export default function Workspace({ demo }: { demo: boolean }) {
  const [view, setView] = useState<View>("Overview");
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [locationId, setLocationId] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const requestId = useRef(0);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('input[aria-label="Search workspace"]')?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);
  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const result = await api<WorkspaceData>(
        `workspace${locationId ? `?locationId=${locationId}` : ""}`,
      );
      if (id === requestId.current) setData(result);
    } catch (err) {
      if (id === requestId.current)
        setError(err instanceof Error ? err.message : "Unable to load your workspace.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [locationId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (toast) {
      const timeout = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timeout);
    }
  }, [toast]);
  function navigate(next: View) {
    setView(next);
    setSearch("");
    setMobileOpen(false);
    setProfileOpen(false);
  }
  async function mutate(path: string, method = "POST", body?: unknown, success = "") {
    if (pending) return;
    setPending(true);
    try {
      await api(path, method, body);
      if (success) setToast(success);
      await load();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Unable to save changes.");
    } finally {
      setPending(false);
    }
  }
  function exportData() {
    if (!data) return;
    const rows = [
      ["Careflow practice report", date(new Date())],
      ["Location", data.locations.find((l) => l.id === locationId)?.name ?? "All locations"],
      [],
      ["Patient", "Email", "Date of birth", "Location"],
      ...data.patients.map((p) => [
        p.name,
        p.email,
        p.dateOfBirth,
        data.locations.find((l) => l.id === p.locationId)?.name ?? "",
      ]),
      [],
      ["Invoice", "Description", "Amount (USD)", "Status"],
      ...data.invoices.map((i) => [i.number, i.description, String(i.amount), i.status]),
    ];
    download(
      `careflow-report-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((row) => row.map(csvCell).join(",")).join("\r\n"),
      "text/csv;charset=utf-8;",
    );
    setToast("Practice report downloaded");
  }
  const unread = data?.messages.filter((m) => !m.isRead && m.direction === "Inbound").length ?? 0;
  const searchResults =
    search && view === "Overview"
      ? data?.patients
          .filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(search.toLowerCase()))
          .slice(0, 5)
      : null;
  const navigationButton = ({
    label,
    icon: Icon,
  }: (typeof mainNavigation)[number] | (typeof practiceNavigation)[number]) => (
    <button
      key={label}
      className={`nav-item ${view === label ? "active" : ""}`}
      onClick={() => navigate(label)}
    >
      <Icon size={18} strokeWidth={1.7} />
      <span>{label}</span>
      {label === "Messages" && unread > 0 && <span className="nav-count">{unread}</span>}
      {label === "Telemedicine" && <span className="nav-new">NEW</span>}
    </button>
  );

  return (
    <div className="app-shell">
      {mobileOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <button className="brand" onClick={() => navigate("Overview")} aria-label="Careflow home">
          <span className="brand-icon">
            <HeartPulse size={26} strokeWidth={2.2} />
          </span>
          careflow<span className="brand-period">.</span>
        </button>
        <button className="clinic-switcher" onClick={() => navigate("Locations")}>
          <span className="clinic-initial">W</span>
          <span>
            <strong>Wellness Medical</strong>
            <small>Your connected practice</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className="nav-heading">WORKSPACE</div>
        <nav aria-label="Workspace">{mainNavigation.map(navigationButton)}</nav>
        <div className="nav-heading practice-heading">YOUR PRACTICE</div>
        <nav aria-label="Practice">{practiceNavigation.map(navigationButton)}</nav>
        <div className="sidebar-bottom">
          <div className="trial-card">
            <div className="trial-card-top">
              <span>
                <Sparkles size={17} />
              </span>
              <span>MADE FOR YOUR PRACTICE</span>
            </div>
            <h3>A little more possibility.</h3>
            <p>
              Discover a better way to care.
              <br />
              Try all features for 14 days.
            </p>
            <button onClick={() => setModal({ kind: "trial" })}>
              Start your free trial
              <ArrowRight size={14} />
            </button>
            <small>No credit card required</small>
          </div>
          <button className="nav-item" onClick={() => setModal({ kind: "help" })}>
            <CircleHelp size={18} />
            <span>Help & getting started</span>
            <ArrowUpRightIcon />
          </button>
          <div className="sidebar-user">
            <Avatar name="Sarah Mitchell" index={1} />
            <span>
              <strong>Dr. Sarah Mitchell</strong>
              <small>Practice administrator</small>
            </span>
            <button
              className="icon-button"
              aria-label="Account options"
              onClick={() => setProfileOpen(!profileOpen)}
            >
              <Settings2 size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{view}</strong>
          </div>
          <div className="topbar-tools">
            <div className="global-search">
              <Search size={16} />
              <input
                aria-label="Search workspace"
                placeholder="Search anything…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>⌘ K</kbd>
              {search && (
                <button aria-label="Clear search" onClick={() => setSearch("")}>
                  <X size={13} />
                </button>
              )}
              {searchResults && (
                <div className="search-results">
                  <small>PATIENTS</small>
                  {searchResults.length ? (
                    searchResults.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setModal({ kind: "profile", patient: p });
                          setSearch("");
                        }}
                      >
                        <Avatar name={p.name} />
                        <span>
                          <strong>{p.name}</strong>
                          <small>{p.email}</small>
                        </span>
                        <ChevronRight size={15} />
                      </button>
                    ))
                  ) : (
                    <p>No matching patients.</p>
                  )}
                  <button className="text-button" onClick={() => navigate("Patients")}>
                    Open patient directory
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>
            <span className="topbar-divider" />
            <div className="location-select">
              <MapPin size={15} />
              <select
                aria-label="Filter by clinic location"
                value={locationId}
                onChange={(e) => {
                  setData(null);
                  setLocationId(e.target.value);
                }}
              >
                <option value="">All locations</option>
                {data?.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} />
            </div>
            <button
              className="notification-button"
              aria-label={`Notifications, ${unread} unread messages`}
              onClick={() => navigate("Messages")}
            >
              <Bell size={19} />
              {unread > 0 && <span />}
            </button>
            <button
              className="profile-button"
              aria-label="Open account menu"
              onClick={() => setProfileOpen(!profileOpen)}
            >
              <Avatar name="Sarah Mitchell" index={1} />
            </button>
          </div>
        </header>
        {profileOpen && (
          <div className="account-menu">
            <strong>Dr. Sarah Mitchell</strong>
            <span>Practice administrator</span>
            <button
              onClick={() => {
                navigate("Locations");
                setProfileOpen(false);
              }}
            >
              <Building2 size={15} />
              Manage locations
            </button>
            <button
              onClick={() => {
                setModal({ kind: "help" });
                setProfileOpen(false);
              }}
            >
              <CircleHelp size={15} />
              Workspace guide
            </button>
            {!demo && (
              <button
                onClick={async () => {
                  await fetch("/api/auth", { method: "DELETE" });
                  window.location.reload();
                }}
              >
                <LogOut size={15} />
                Sign out
              </button>
            )}
            {demo && <small>DEMO WORKSPACE · SAMPLE DATA</small>}
          </div>
        )}
        <main className="workspace-main" aria-busy={loading || pending}>
          {demo && (
            <div className="demo-indicator">
              <span />
              Demo workspace <span className="demo-separator">·</span> Sample patient data{" "}
              <span className="demo-label-right">
                Explore freely. Changes reset when the API restarts.
              </span>
            </div>
          )}
          {error ? (
            <div className="connection-error" role="alert">
              <HeartPulse size={36} />
              <h1>Let&apos;s reconnect your workspace.</h1>
              <p>{error}</p>
              <button className="button primary" onClick={() => void load()}>
                Try again
              </button>
              <p className="muted">See the README for database and API startup instructions.</p>
            </div>
          ) : !data ? (
            <div className="loading-workspace">
              <Spinner />
              <span>Getting your practice ready…</span>
            </div>
          ) : view === "Overview" ? (
            <Dashboard
              data={data}
              navigate={navigate}
              open={setModal}
              onStatus={(id, status) =>
                void mutate(`appointments/${id}`, "PATCH", { status }, "Appointment updated")
              }
              exportData={exportData}
            />
          ) : (
            <Modules
              key={view}
              view={view}
              data={data}
              search={search}
              open={setModal}
              mutate={mutate}
              setLocation={(id) => {
                setLocationId(id);
                navigate("Overview");
              }}
              exportData={exportData}
            />
          )}
        </main>
      </div>
      {modal && data && (
        <WorkflowModal
          key={JSON.stringify(modal)}
          modal={modal}
          data={data}
          onClose={() => setModal(null)}
          onSaved={async (message) => {
            setModal(null);
            setToast(message);
            await load();
          }}
          open={setModal}
          locationId={locationId}
        />
      )}
      <div className={`toast ${toast ? "visible" : ""}`} role="status" aria-live="polite">
        <Check size={17} />
        {toast}
        <button aria-label="Dismiss notification" onClick={() => setToast("")}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
function ArrowUpRightIcon() {
  return <span className="help-arrow">↗</span>;
}
