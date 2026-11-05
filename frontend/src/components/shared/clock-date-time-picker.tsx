"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TimePicker } from "./time-picker";

type ClockDateTimePickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  minValue?: string;
  className?: string;
};

type Meridiem = "AM" | "PM";

const pad = (value: number) => String(value).padStart(2, "0");

function displayValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return "Select date and time";
  const [, year, month, day, hour, minute] = match;
  const hourValue = Number(hour);
  const meridiem = hourValue >= 12 ? "PM" : "AM";
  const displayHour = hourValue % 12 || 12;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const dateLabel = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
  return `${dateLabel} · ${displayHour}:${minute} ${meridiem}`;
}

function currentDraft(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (match) {
    const hour = Number(match[2]);
    return {
      date: match[1],
      hour: hour % 12 || 12,
      minute: Number(match[3]),
      meridiem: (hour >= 12 ? "PM" : "AM") as Meridiem,
    };
  }
  return {
    date: "",
    hour: 12,
    minute: 0,
    meridiem: "AM" as Meridiem,
  };
}

export function ClockDateTimePicker({
  label,
  value,
  onChange,
  required = false,
  minValue,
  className = "",
}: ClockDateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => currentDraft(value));
  const [popoverPosition, setPopoverPosition] = useState({ left: 12, top: 12 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const classes = ["clock-date-time-picker", className]
    .filter(Boolean)
    .join(" ");
  const draftTime = `${pad((draft.hour % 12) + (draft.meridiem === "PM" ? 12 : 0))}:${pad(draft.minute)}`;
  const draftValue = draft.date
    ? `${draft.date}T${draftTime}`
    : "";
  const belowMinimum = Boolean(minValue && draftValue && draftValue < minValue);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!trigger || !popover) return;

      const bounds = trigger.getBoundingClientRect();
      const margin = 12;
      const popoverWidth = Math.min(
        popover.offsetWidth,
        window.innerWidth - margin * 2,
      );
      const popoverHeight = Math.min(
        popover.offsetHeight,
        window.innerHeight - margin * 2,
      );
      const left = Math.min(
        Math.max(margin, bounds.left),
        window.innerWidth - popoverWidth - margin,
      );
      const belowTop = bounds.bottom + 7;
      const top =
        belowTop + popoverHeight <= window.innerHeight - margin
          ? belowTop
          : Math.max(margin, bounds.top - popoverHeight - 7);
      setPopoverPosition({ left, top });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (
        !(target instanceof Node) ||
        popoverRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      const parentDialog = triggerRef.current?.closest(
        '[role="dialog"][aria-modal="true"]',
      );
      if (parentDialog && !parentDialog.contains(target)) return;
      if (
        draftValue !== value &&
        !window.confirm("You have unsaved changes. Discard them?")
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [draftValue, open, value]);

  function openPicker() {
    setDraft(currentDraft(value));
    setOpen(true);
  }

  function markParentDialogDirty() {
    triggerRef.current?.dispatchEvent(
      new Event("crm:dirty", { bubbles: true }),
    );
  }

  function save() {
    if (!draft.date || belowMinimum) return;
    markParentDialogDirty();
    onChange(draftValue);
    setOpen(false);
  }

  return (
    <div className={classes}>
      <span className="clock-date-time-label">
        {label}
        {required ? " *" : ""}
      </span>
      <button
        ref={triggerRef}
        type="button"
        className="clock-date-time-trigger"
        aria-label={`${label}: ${displayValue(value)}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openPicker}
      >
        <span>{displayValue(value)}</span>
        <span className="clock-date-time-trigger-icon" aria-hidden="true">
          ◷
        </span>
      </button>
      {open && (
        createPortal(
          <div
            ref={popoverRef}
            className="clock-date-time-popover"
            style={{ left: popoverPosition.left, top: popoverPosition.top }}
            role="dialog"
            aria-label={`${label} picker`}
          >
          <div className="clock-date-time-popover-heading">
            <strong>{label}</strong>
            <button
              type="button"
              aria-label="Close date and time picker"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
          <label className="clock-date-time-date">
            Date
            <input
              type="date"
              required={required}
              max="9999-12-31"
              min={minValue?.slice(0, 10) || undefined}
              value={draft.date}
              onChange={(event) => {
                markParentDialogDirty();
                setDraft((current) => ({ ...current, date: event.target.value }))
              }}
            />
          </label>
          <TimePicker
            className="clock-date-time-time"
            format12h
            label="Time"
            required={required}
            value={draftTime}
            onChange={(time) => {
              markParentDialogDirty();
              const [hour24, minute] = time.split(":").map(Number);
              setDraft((current) => ({
                ...current,
                hour: hour24 % 12 || 12,
                minute,
                meridiem: hour24 >= 12 ? "PM" : "AM",
              }));
            }}
          />
          {belowMinimum && (
            <p className="clock-date-time-error" role="alert">
              Choose a time on or after the minimum allowed date and time.
            </p>
          )}
          <div className="clock-date-time-actions">
            <button type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="confirm"
              disabled={!draft.date || belowMinimum}
              onClick={save}
            >
              OK
            </button>
          </div>
          </div>,
          document.body,
        )
      )}
    </div>
  );
}
