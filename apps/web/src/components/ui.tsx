"use client";
import { useEffect, useRef } from "react";
import { X, ArrowUpRight, Inbox, LoaderCircle } from "lucide-react";
import { initials } from "@/lib/utils";

export function Avatar({
  name,
  size = "",
  index = 0,
}: {
  name: string;
  size?: string;
  index?: number;
}) {
  return (
    <span className={`avatar ${size} avatar-${index % 6}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
export function Badge({ children }: { children: string }) {
  return (
    <span className={`badge badge-${children.toLowerCase().replaceAll(" ", "-")}`}>
      <span />
      {children}
    </span>
  );
}
export function Empty({
  title = "Nothing here yet",
  description = "New items will appear here as your practice grows.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty">
      <Inbox size={30} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function Spinner() {
  return <LoaderCircle className="spin" size={20} aria-label="Loading" />;
}
export function PanelHeader({
  title,
  subtitle,
  action,
  onAction,
}: {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="panel-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && (
        <button className="text-button" onClick={onAction}>
          {action}
          <ArrowUpRight size={15} />
        </button>
      )}
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const focus = document.activeElement as HTMLElement | null;
    element?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
      focus?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-inner">
        <div className="modal-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
