"use client";

import { useEffect } from "react";

const MODAL_SELECTOR = '[role="dialog"][aria-modal="true"]';

function isDismissControl(button: HTMLButtonElement) {
  const label = button.getAttribute("aria-label")?.trim().toLowerCase() ?? "";
  const text = button.textContent?.trim().toLowerCase() ?? "";
  return (
    button.classList.contains("modal-close") ||
    label.startsWith("close") ||
    label === "cancel" ||
    text === "cancel" ||
    text === "close"
  );
}

export function useDialogDismissal() {
  useEffect(() => {
    const markDialogDirty = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const dialog = target.closest<HTMLElement>(MODAL_SELECTOR);
      if (dialog) dialog.dataset.crmDirty = "true";
    };

    const dismissOnOutsidePointer = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      const dialog = Array.from(
        document.querySelectorAll<HTMLElement>(MODAL_SELECTOR),
      )
        .reverse()
        .find((candidate) => {
          const overlay = candidate.parentElement;
          return overlay?.contains(target) && !candidate.contains(target);
        });
      if (!dialog) return;

      event.preventDefault();
      event.stopPropagation();

      if (
        dialog.dataset.crmDirty === "true" &&
        !window.confirm("You have unsaved changes. Discard them?")
      ) {
        return;
      }

      const buttons = Array.from(
        dialog.querySelectorAll<HTMLButtonElement>("button"),
      );
      const dismissButton =
        buttons.find(isDismissControl) ??
        buttons.find((button) => button.textContent?.trim().toLowerCase() === "cancel");
      dismissButton?.click();
    };

    document.addEventListener("input", markDialogDirty, true);
    document.addEventListener("change", markDialogDirty, true);
    document.addEventListener("crm:dirty", markDialogDirty, true);
    document.addEventListener("mousedown", dismissOnOutsidePointer, true);
    return () => {
      document.removeEventListener("input", markDialogDirty, true);
      document.removeEventListener("change", markDialogDirty, true);
      document.removeEventListener("crm:dirty", markDialogDirty, true);
      document.removeEventListener("mousedown", dismissOnOutsidePointer, true);
    };
  }, []);
}
