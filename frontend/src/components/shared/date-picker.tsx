"use client";

type DatePickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export function DatePicker({ label, value, onChange }: DatePickerProps) {
  return (
    <label>
      {label}
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}