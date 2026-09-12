-- The shared change sequence.
--
-- Every synced row takes its `seq` from here, which gives changes across all
-- tables a single total order. That is what lets a client ask "what happened
-- after N?" and receive a complete, gap-free answer — comparing timestamps
-- across devices could not, because device clocks drift.
--
-- Drizzle generates tables from the schema but has no concept of a bare
-- sequence, so this migration is hand-written.

CREATE SEQUENCE IF NOT EXISTS change_seq AS bigint START WITH 1 INCREMENT BY 1;
