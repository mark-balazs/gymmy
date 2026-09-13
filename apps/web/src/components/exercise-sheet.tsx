'use client';

import { Sheet } from '@/components/ui';
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

  return (
    <Sheet title={exercise.name} open onClose={onClose}>
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {images.map((src, i) => (
            <div
              key={src}
              className="relative aspect-[4/3] overflow-hidden rounded-[11px] bg-[var(--color-surface-2)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element --
                  these are fixed-size static files that need no transforming,
                  and the optimizer is a metered per-request function in front
                  of something already on disk. */}
              <img
                src={src}
                // The pair is always start-then-finish, which is the only thing
                // a screen reader can usefully say about a photograph here.
                alt={tr.t(i === 0 ? 'ex.start' : 'ex.finish')}
                // The photographs are the whole reason this sheet opens, so
                // they are fetched immediately rather than when scrolled to.
                loading="eager"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      )}

      {description ? (
        <p className="text-sm leading-relaxed text-[var(--color-ink)]">{description}</p>
      ) : (
        <p className="text-sm text-[var(--color-muted)]">{tr.t('ex.noDetail')}</p>
      )}

      {images.length === 0 && description !== '' && (
        <p className="text-xs text-[var(--color-muted)]">{tr.t('ex.noPhotos')}</p>
      )}
    </Sheet>
  );
}
