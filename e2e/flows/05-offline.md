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
- The server holds the sets logged offline — asked of the server itself. A
  reload proves nothing here: it reads IndexedDB, where the sets were all
  along, and an empty queue reads "All saved" whether or not anything was sent.

## Writing while a push is travelling

The subtle failure is a pull overwriting a write that was still queued. The sync
engine applies server changes first and then re-applies the outbox on top;
without that, a change made while a request was in flight would be undone by
the answer to it. The spec holds each push at the network to make that window:

- a set logged while a push is in flight stays queued, and reaches the server
  on the next one;
- a set deleted while its own push is travelling stays deleted — it does not
  reappear when that push comes back;
- a setting changed mid-sync survives the next setting changed after it.
