'use client';

import { useId } from 'react';
import { InfoTip } from '@/components/info-tip';
import { useT } from '@/lib/client/hooks';

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
 * thumb, and a 48 px pill at the edge of the screen is easy to miss. The title
 * is one `<label>` and the empty space after the ⓘ a second, so a tap anywhere
 * but the ⓘ flips it — the ⓘ cannot sit inside a label, or tapping it would
 * flip the switch too.
 *
 * The name is the title alone and the hint is its description — kept in the
 * tip behind the ⓘ, which a screen reader still reads while it is closed — so
 * it says "Load the bar on barbell lifts, switch, on" and then the hint.
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
  const { t } = useT();
  return (
    <div className="flex min-h-[var(--spacing-tap)] items-center gap-1.5">
      <label htmlFor={id} id={`${id}-label`} className="cursor-pointer text-sm font-semibold">
        {label}
      </label>
      <InfoTip label={t('info.more', { subject: label })} textId={`${id}-hint`}>
        {hint}
      </InfoTip>
      <label
        htmlFor={id}
        aria-hidden
        className="min-h-[var(--spacing-tap)] min-w-3 flex-1 cursor-pointer self-stretch"
      />
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
