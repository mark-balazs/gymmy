'use client';

import { useId } from 'react';

/**
 * An on/off setting, as the platform's own switch: `<input type="checkbox"
 * switch>`.
 *
 * On an iPhone, toggling one is the only thing a web page can do that gives a
 * haptic tick, which is why every on/off setting is one of these rather than a
 * button that draws a switch. Where the `switch` attribute is unknown it is a
 * checkbox, so `role="switch"` says what it is to assistive technology, and
 * `globals.css` draws it the same in every browser.
 *
 * The whole row is the target, not just the track: this is tapped with a
 * thumb, and a 48 px pill at the edge of the screen is easy to miss. The name
 * is the title alone and the hint is its description, so a screen reader says
 * "Load the bar on barbell lifts, switch, on" rather than reading the hint as
 * part of the name.
 */
export function Switch({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-h-[var(--spacing-tap)] items-center gap-3">
      <label
        htmlFor={id}
        className="flex min-w-0 flex-1 cursor-pointer flex-col justify-center gap-0.5 self-stretch"
      >
        <span id={`${id}-label`} className="text-sm font-semibold">
          {label}
        </span>
        <span id={`${id}-hint`} className="text-xs text-[var(--color-muted)]">
          {hint}
        </span>
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        // Not in React's types yet; an empty string renders the bare attribute.
        {...{ switch: '' }}
        checked={on}
        onChange={(e) => onChange(e.currentTarget.checked)}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
      />
    </div>
  );
}
