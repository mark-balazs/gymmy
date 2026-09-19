'use client';

import { useState } from 'react';
import { Sheet } from '@/components/ui';
import { Lightbox } from '@/components/lightbox';
import { useT } from '@/lib/client/hooks';
import type { Exercise } from '@athletic/domain';

/**
 * What an exercise actually is: two photographs and a sentence.
 *
 * Reachable from wherever a name appears, because the moment you need it is the
 * moment you read a name you do not recognise — not on some separate library
 * screen you would have to go looking for.
 */
export function ExerciseSheet({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  const tr = useT();
  // Not redundant with the normalising in `index()`: this component can be
  // handed an exercise from anywhere, and a sheet that throws takes the whole
  // screen down with it.
  const images = exercise.images ?? [];
  const description = exercise.description ?? '';
  const [zoomed, setZoomed] = useState<number | null>(null);

  /* The pair is always start-then-finish, which is the only thing a screen
     reader can usefully say about a photograph here — and the only caption
     worth putting on the enlarged one. */
  const shots = images.map((src, i) => ({ src, alt: tr.t(i === 0 ? 'ex.start' : 'ex.finish') }));

  return (
    <Sheet title={tr.exercise(exercise)} open onClose={onClose}>
      {shots.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {shots.map((shot, i) => (
            /* Tappable, because side by side in a 4:3 box each of these is a
               cropped third of a phone's width: enough to recognise a movement
               you know and not enough to learn one you do not. */
            <button
              key={shot.src}
              type="button"
              onClick={() => setZoomed(i)}
              aria-label={tr.t('ex.enlarge', { what: shot.alt })}
              className="relative aspect-[4/3] cursor-zoom-in overflow-hidden rounded-[11px] bg-[var(--color-surface-2)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element --
                  these are fixed-size static files that need no transforming,
                  and the optimizer is a metered per-request function in front
                  of something already on disk. */}
              <img
                src={shot.src}
                alt={shot.alt}
                // The photographs are the whole reason this sheet opens, so
                // they are fetched immediately rather than when scrolled to.
                loading="eager"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Without photos the description stands alone: saying there are none
          tells somebody what they can already see. Without either, one line
          says so, or the sheet would be a title over nothing. */}
      {description ? (
        <p className="text-sm leading-relaxed text-[var(--color-ink)]">{description}</p>
      ) : (
        <p className="text-sm text-[var(--color-muted)]">{tr.t('ex.noDetail')}</p>
      )}

      {zoomed !== null && (
        <Lightbox
          shots={shots}
          index={zoomed}
          onIndex={setZoomed}
          onClose={() => setZoomed(null)}
        />
      )}
    </Sheet>
  );
}
