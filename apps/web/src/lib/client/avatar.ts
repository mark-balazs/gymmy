'use client';

/**
 * Turning a photograph from a phone into something small enough to sync.
 *
 * The picture lives in the profile row rather than in object storage — it then
 * syncs with everything else, works offline, and needs no bucket, no signed
 * URLs and no second thing to back up. The price is that **this row travels on
 * every pull**, so a 4 MB photograph straight off a camera would make every
 * sync carry a photograph.
 *
 * So it is downscaled hard and cropped square before it is encoded. The wire
 * schema caps it at 64 KB as a backstop against a client that does not do this;
 * this is the code that makes sure we never hit that backstop.
 */

/** Big enough for a 96px avatar on a 3× screen, and nothing beyond that. */
const SIZE = 256;
/** Leaves room under the 64 KB wire cap even for a busy photograph. */
const QUALITY = 0.82;

export class AvatarError extends Error {}

/**
 * Reads an image file and returns a small square JPEG data URL.
 *
 * Square by centre-crop rather than by squashing: a face stretched to fit is
 * worse than a face with its edges trimmed.
 */
export async function toAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new AvatarError('not-an-image');

  const bitmap = await createImageBitmap(file).catch(() => {
    // A file the browser cannot decode — a HEIC on a browser without support,
    // or something that is not really an image whatever its name says.
    throw new AvatarError('undecodable');
  });

  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new AvatarError('no-canvas');

    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      SIZE,
      SIZE,
    );

    // JPEG rather than PNG: a photograph as PNG is several times larger for no
    // benefit, and transparency is meaningless on a cropped square.
    const url = canvas.toDataURL('image/jpeg', QUALITY);
    if (url.length > 64_000) throw new AvatarError('too-large');
    return url;
  } finally {
    bitmap.close();
  }
}
