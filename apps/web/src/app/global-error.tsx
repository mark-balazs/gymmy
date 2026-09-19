'use client';

/**
 * Last resort: a crash in the root layout itself, where no provider, no
 * translator and no styling can be assumed to have loaded.
 *
 * It therefore replaces the whole document — html and body included — and says
 * everything in English with inline styles. A fallback that depends on the
 * thing that just failed is not a fallback.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: '#090b0f',
          color: '#e9eef5',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        }}
      >
        <div style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h1 style={{ fontSize: 19, margin: 0 }}>gymmy could not start</h1>
          {/* "Safe", not "saved on the server": a change not yet synced is
              still on this device — and neither button below touches it. */}
          <p style={{ fontSize: 14, color: '#8794a4', margin: 0 }}>Your training is safe.</p>
          {/* The raw message is for a bug report, not for the person reading:
              a native disclosure, which needs nothing that may have failed. */}
          <details style={{ fontSize: 12, color: '#8794a4' }}>
            <summary style={{ cursor: 'pointer' }}>Details</summary>
            <p
              style={{
                background: '#1a2029',
                padding: '8px 12px',
                borderRadius: 11,
                margin: '6px 0 0',
                wordBreak: 'break-word',
              }}
            >
              {error.message}
            </p>
          </details>
          <button
            onClick={reset}
            style={{
              minHeight: 46,
              borderRadius: 12,
              border: 'none',
              background: '#22c55e',
              color: '#04160d',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          {/* A hard navigation on purpose, not next/link: client-side routing
              would re-enter the tree that just failed to render. */}
          <button
            onClick={() => window.location.replace('/')}
            style={{
              minHeight: 46,
              borderRadius: 12,
              border: '1px solid #252e3a',
              background: 'transparent',
              color: '#e9eef5',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
