"use client";

import TimePickerControl from "react-time-picker";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type {
  ClipboardEvent,
  ChangeEvent,
  KeyboardEvent,
} from "react";

// Usage: <TimePicker value={time} onChange={setTime} format12h />
export type TimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  format12h?: boolean;
  minuteStep?: number;
  disabled?: boolean;
  required?: boolean;
  minTime?: string;
  maxTime?: string;
  label?: string;
  className?: string;
};

function parseTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i.exec(value.trim());
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (minute > 59) return null;

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === "PM" ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function minutesSinceMidnight(value: string) {
  const parsed = parseTime(value);
  if (!parsed) return null;
  const [hour, minute] = parsed.split(":").map(Number);
  return hour * 60 + minute;
}

export function TimePicker({
  value,
  onChange,
  format12h = false,
  minuteStep = 1,
  disabled = false,
  required = false,
  minTime,
  maxTime,
  label = "Time",
  className = "",
}: TimePickerProps) {
  const classes = ["time-picker", className].filter(Boolean).join(" ");
  const errorId = `${useId()}-error`;
  const [invalid, setInvalid] = useState(false);
  const [clockUnit, setClockUnit] = useState<"hour" | "minute">("hour");
  const [clockDraft, setClockDraft] = useState<string | null>(null);
  const [clockPortal, setClockPortal] = useState<HTMLDivElement | null>(null);
  const [clockSize, setClockSize] = useState(180);
  const draggingPointer = useRef<number | null>(null);
  const pointerCaptureTarget = useRef<HTMLElement | null>(null);
  const pointerSelectedUnit = useRef<"hour" | "minute" | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const clockValue = parseTime(clockDraft ?? value) ?? "00:00";
  const [clockHour, clockMinute] = clockValue.split(":").map(Number);
  const selectedClockIndex =
    clockUnit === "hour"
      ? clockHour % 12 || 12
      : Math.round(clockMinute / 5) % 12 || 12;
  const clockClassName = `meeting-analog-clock meeting-analog-clock--${clockUnit} meeting-analog-clock--selected-${selectedClockIndex}`;

  useEffect(() => {
    const portal = document.createElement("div");
    portal.className = "time-picker-clock-portal time-picker-control";
    portal.style.position = "fixed";
    portal.style.zIndex = "1200";
    portal.style.pointerEvents = "auto";
    document.body.appendChild(portal);
    setClockPortal(portal);

    return () => {
      portal.remove();
    };
  }, []);

  useEffect(() => {
    if (!clockPortal) return;

    function closeOnOutsideAction(event: MouseEvent | TouchEvent) {
      const popup = clockPortal?.querySelector(".react-time-picker__clock");
      const target = event.target;
      if (
        !popup?.classList.contains("react-time-picker__clock--open") ||
        !(target instanceof Node) ||
        pickerRef.current?.contains(target) ||
        clockPortal?.contains(target)
      ) {
        return;
      }

      pickerRef.current
        ?.querySelector<HTMLButtonElement>(".react-time-picker__clock-button")
        ?.click();
    }

    document.addEventListener("mousedown", closeOnOutsideAction, true);
    document.addEventListener("touchstart", closeOnOutsideAction, true);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideAction, true);
      document.removeEventListener("touchstart", closeOnOutsideAction, true);
    };
  }, [clockPortal]);

  function positionClock() {
    const wrapper = pickerRef.current?.querySelector(
      ".react-time-picker__wrapper",
    );
    if (!wrapper || !clockPortal) return;

    const bounds = wrapper.getBoundingClientRect();
    const size = Math.max(
      80,
      Math.min(180, window.innerHeight - 280, window.innerWidth - 48),
    );
    const popupSize = size + 22;
    const left = Math.min(
      Math.max(12, bounds.left),
      window.innerWidth - popupSize - 12,
    );
    const belowTop = bounds.bottom + 5;
    const top =
      belowTop + popupSize <= window.innerHeight - 12
        ? belowTop
        : Math.max(12, bounds.top - popupSize - 5);

    setClockSize(size);
    clockPortal.style.left = `${left}px`;
    clockPortal.style.top = `${top}px`;
  }

  const isInRange = useCallback((nextValue: string) => {
    const next = minutesSinceMidnight(nextValue);
    const minimum = minTime ? minutesSinceMidnight(minTime) : null;
    const maximum = maxTime ? minutesSinceMidnight(maxTime) : null;
    return (
      next !== null &&
      (minimum === null || next >= minimum) &&
      (maximum === null || next <= maximum)
    );
  }, [maxTime, minTime]);

  function handleChange(nextValue: string | null) {
    if (!nextValue) return;
    const parsed = parseTime(nextValue);
    if (parsed && isInRange(parsed)) {
      setClockDraft(parsed);
      setInvalid(false);
      onChange(parsed);
    } else {
      setInvalid(true);
    }
  }

  function handleControlChange(event: ChangeEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || target.name !== "amPm") return;

    requestAnimationFrame(() => {
      if (document.activeElement === document.body) {
        target.focus();
      }
    });

    const hourInput = event.currentTarget.querySelector<HTMLInputElement>(
      ".react-time-picker__inputGroup__hour",
    );
    const minuteInput = event.currentTarget.querySelector<HTMLInputElement>(
      ".react-time-picker__inputGroup__minute",
    );
    if (!hourInput?.value || minuteInput?.value) return;

    const hour12 = Number(hourInput.value);
    if (!Number.isInteger(hour12) || hour12 < 1 || hour12 > 12) return;

    const hour24 = (hour12 % 12) + (target.value === "pm" ? 12 : 0);
    const nextValue = `${String(hour24).padStart(2, "0")}:00`;
    if (!isInRange(nextValue)) {
      setInvalid(true);
      return;
    }

    setClockDraft(nextValue);
    setInvalid(false);
    onChange(nextValue);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const pasted = parseTime(event.clipboardData.getData("text"));
    if (!pasted) return;
    event.preventDefault();
    if (!isInRange(pasted)) {
      setInvalid(true);
      return;
    }
    setClockDraft(pasted);
    setInvalid(false);
    onChange(pasted);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target;
    if (
      format12h &&
      target instanceof HTMLSelectElement &&
      target.name === "amPm" &&
      /^[ap]$/i.test(event.key)
    ) {
      event.preventDefault();
      const meridiem = event.key.toLowerCase() === "a" ? "am" : "pm";
      if (target.value !== meridiem) {
        target.value = meridiem;
        target.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return;
    }

    if (
      !(target instanceof HTMLInputElement) ||
      (target.name !== "hour" && target.name !== "minute") ||
      (event.key !== "ArrowUp" && event.key !== "ArrowDown")
    ) {
      return;
    }

    const parsed = parseTime(value);
    if (!parsed) return;
    event.preventDefault();
    const [hour, minute] = parsed.split(":").map(Number);
    const direction = event.key === "ArrowUp" ? 1 : -1;
    const change = target.name === "hour"
      ? direction * 60
      : direction * Math.max(1, Math.floor(minuteStep));
    const nextTotal = (hour * 60 + minute + change + 1440) % 1440;
    const nextValue = `${String(Math.floor(nextTotal / 60)).padStart(2, "0")}:${String(nextTotal % 60).padStart(2, "0")}`;
    if (!isInRange(nextValue)) {
      setInvalid(true);
      return;
    }
    setClockDraft(nextValue);
    setInvalid(false);
    onChange(nextValue);
  }

  function handleKeyUp(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target;
    if (
      !format12h ||
      !(target instanceof HTMLInputElement) ||
      target.name !== "minute" ||
      !/^\d$/.test(event.key) ||
      target.value.length < 2 ||
      Number(target.value) > 59
    ) {
      return;
    }

    event.currentTarget
      .querySelector<HTMLSelectElement>(".react-time-picker__inputGroup__amPm")
      ?.focus();
  }

  const selectClockValue = useCallback((
    event: Pick<PointerEvent, "clientX" | "clientY">,
    exactMinute = false,
  ) => {
    const clock = clockPortal?.querySelector(
      ".react-time-picker__clock .react-clock",
    );
    if (!(clock instanceof HTMLElement)) return;
    const bounds = clock.getBoundingClientRect();
    const x = event.clientX - bounds.left - bounds.width / 2;
    const y = event.clientY - bounds.top - bounds.height / 2;
    const angle = ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360;
    const clockIndex = Math.round(angle / 30) % 12;
    const parsed = clockDraft ?? parseTime(value) ?? "00:00";
    const [currentHour, currentMinute] = parsed.split(":").map(Number);

    if (clockUnit === "hour") {
      let hour: number;
      if (format12h) {
        const hour12 = clockIndex || 12;
        hour = (hour12 % 12) + (currentHour >= 12 ? 12 : 0);
      } else if (Math.hypot(x, y) < bounds.width * 0.32) {
        hour = clockIndex === 0 ? 0 : clockIndex + 12;
      } else {
        hour = clockIndex || 12;
      }

      const nextValue = `${String(hour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`;
      setClockDraft(nextValue);
      setClockUnit("minute");
      if (isInRange(nextValue)) {
        setInvalid(false);
        onChange(nextValue);
      }
      return;
    }

    const rawMinute = Math.round(angle / 6) % 60;
    const step = Math.max(1, Math.floor(minuteStep));
    const minute = exactMinute
      ? rawMinute
      : (Math.round(rawMinute / step) * step) % 60;
    const nextValue = `${String(currentHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    if (!isInRange(nextValue)) {
      setInvalid(true);
      setClockDraft(nextValue);
      return;
    }
    setClockDraft(nextValue);
    setInvalid(false);
    onChange(nextValue);
  }, [
    clockDraft,
    clockPortal,
    clockUnit,
    format12h,
    isInRange,
    minuteStep,
    onChange,
    value,
  ]);

  useEffect(() => {
    if (!clockPortal) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      const clock =
        target instanceof Element
          ? target.closest<HTMLElement>(".react-clock")
          : null;
      if (!clock) return;

      event.preventDefault();
      event.stopPropagation();
      draggingPointer.current = event.pointerId;
      pointerSelectedUnit.current = clockUnit;
      pointerCaptureTarget.current = clock;
      clock.setPointerCapture(event.pointerId);
      selectClockValue(event);
    }

    function handlePointerMove(event: PointerEvent) {
      if (draggingPointer.current !== event.pointerId || clockUnit !== "minute") {
        return;
      }
      selectClockValue(event, true);
    }

    function handlePointerEnd(event: PointerEvent) {
      if (draggingPointer.current !== event.pointerId) return;
      draggingPointer.current = null;
      if (pointerCaptureTarget.current?.hasPointerCapture(event.pointerId)) {
        pointerCaptureTarget.current.releasePointerCapture(event.pointerId);
      }
      pointerCaptureTarget.current = null;

      if (
        event.type === "pointerup" &&
        pointerSelectedUnit.current === "minute"
      ) {
        pickerRef.current
          ?.querySelector<HTMLButtonElement>(".react-time-picker__clock-button")
          ?.click();
      }
      pointerSelectedUnit.current = null;
    }

    clockPortal.addEventListener("pointerdown", handlePointerDown);
    clockPortal.addEventListener("pointermove", handlePointerMove);
    clockPortal.addEventListener("pointerup", handlePointerEnd);
    clockPortal.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      clockPortal.removeEventListener("pointerdown", handlePointerDown);
      clockPortal.removeEventListener("pointermove", handlePointerMove);
      clockPortal.removeEventListener("pointerup", handlePointerEnd);
      clockPortal.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [clockPortal, clockUnit, selectClockValue]);

  return (
    <div
      ref={pickerRef}
      aria-label={required ? `${label}, required` : label}
      aria-describedby={invalid ? errorId : undefined}
      className={classes}
      onChange={handleControlChange}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onPaste={handlePaste}
      role="group"
    >
      <div className="time-picker-label">{label}</div>
      <TimePickerControl
        amPmAriaLabel="Select AM or PM"
        className="time-picker-control"
        clearIcon={null}
        clockAriaLabel="Open clock time picker"
        closeClock={false}
        disabled={disabled}
        format={format12h ? "h:mm a" : "HH:mm"}
        hourAriaLabel="Hours"
        locale="en-US"
        maxTime={maxTime}
        minTime={minTime}
        minuteAriaLabel="Minutes"
        name={label}
        onChange={handleChange}
        clockProps={{
          className: clockClassName,
          formatHour: (_locale, hour) =>
            clockUnit === "minute"
              ? String(((hour % 12) * 5) % 60).padStart(2, "0")
              : String(hour),
          renderHourMarks: false,
          renderMinuteMarks: false,
          renderNumbers: true,
          renderSecondHand: false,
          hourHandLength: 60,
          hourHandOppositeLength: 0,
          minuteHandLength: 60,
          minuteHandOppositeLength: 0,
          size: `${clockSize}px`,
        }}
        onClockOpen={() => {
          setClockDraft(parseTime(value) ?? "00:00");
          setClockUnit("hour");
          positionClock();
        }}
        onClockClose={() => {
          setClockDraft(null);
        }}
        onInvalidChange={() => setInvalid(true)}
        openClockOnFocus={false}
        portalContainer={clockPortal}
        required={false}
        shouldCloseClock={({ reason }) => reason !== "outsideAction"}
        value={parseTime(clockDraft ?? value) ?? ""}
      />
      {invalid && (
        <span className="time-picker-error" id={errorId} role="alert">
          Enter a valid time.
        </span>
      )}
    </div>
  );
}
