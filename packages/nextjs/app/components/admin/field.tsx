import type { InputHTMLAttributes, ReactNode } from "react";

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "name"> {
  name: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  /** Offered via <datalist>; free text is still allowed. */
  suggestions?: readonly string[];
  suffix?: string;
  action?: ReactNode;
  /** Classes for the <input> itself (className styles the wrapper). */
  inputClassName?: string;
}

export function Field({
  name,
  label,
  error,
  hint,
  suggestions,
  suffix,
  action,
  className,
  inputClassName,
  ...input
}: FieldProps) {
  const id = `field-${name}`;
  const described =
    [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className={`grid content-start gap-1.5 ${className ?? ""}`}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <div className="flex gap-2">
        <div className="relative flex min-w-0 flex-1 items-center">
          <input
            id={id}
            name={name}
            aria-invalid={error ? true : undefined}
            aria-describedby={described}
            list={suggestions ? `${id}-list` : undefined}
            className={`w-full min-w-0 rounded-[10px] border border-line bg-surface px-3 py-2.5 text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-invalid:border-danger aria-invalid:bg-danger-soft ${suffix ? "pr-12" : ""} ${inputClassName ?? ""}`}
            {...input}
          />
          {suffix && (
            <span className="pointer-events-none absolute right-3 text-sm text-muted">
              {suffix}
            </span>
          )}
        </div>
        {action}
      </div>
      {suggestions && (
        <datalist id={`${id}-list`}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      {error ? (
        <p id={`${id}-error`} className="m-0 text-sm text-danger">
          {label} {error}
        </p>
      ) : (
        hint && (
          <div id={`${id}-hint`} className="text-xs text-muted">
            {hint}
          </div>
        )
      )}
    </div>
  );
}

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="m-0 grid min-w-0 gap-4 rounded-[14px] border border-line bg-surface p-5">
      <legend className="float-left mb-1 w-full">
        <span className="block text-lg font-bold">{title}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
