# Flow 05 — Training offline

**Who:** somebody in a basement gym with no signal. This is not an edge case —
for a training app it is the normal case.

**Why it matters:** the entire local-first architecture exists for this flow. If
logging a set requires connectivity, the architecture bought nothing and should
be replaced with something simpler.

## Preconditions

- An onboarded user with the app already loaded

## Steps

1. Log one set normally, with the network up.
2. Cut the network (`context.setOffline(true)`).
3. Log two more sets.
4. Reload the page while still offline.
5. Restore the network.
6. Wait for sync.

## Expected

- **While offline:** sets save exactly as they do online. The counter advances,
  the sets list grows, nothing errors and nothing is lost.
- The sync indicator reports *"Offline — saved on this device"* rather than
  claiming everything is saved. The distinction between "on this device" and
  "everywhere" is one the user genuinely needs.
- **After reload, still offline:** the sets logged offline are still there. They
  are in IndexedDB, not in memory, so a crash or a reload cannot lose them.
- **After reconnecting:** the indicator returns to *"All saved"* and the pending
  count falls to zero.
- Reloading once more shows the same sets — they survived the round trip to the
  server and back.

## Notes

The subtle failure this guards against is a pull overwriting a write that was
still queued. The sync engine applies server changes first and then re-applies
the outbox on top; without that, a set logged while a request was in flight
would silently vanish, and the user would simply see the app lose their work.
