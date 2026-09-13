/**
 * Per-table row validation for incoming mutations.
 *
 * The client is not trusted. `userId` and `seq` are never accepted from the
 * wire — the server sets both — so a client cannot write into another account
 * or forge its position in the change order.
 */

import { z } from 'zod';
import {
  BIASES,
  DAY_KEYS,
  LANG_CODES,
  PATTERN_KEYS,
  ROLES,
  SLOT_KEYS,
  SEXES,
  SLOT_ROLES,
  SPLIT_KEYS,
  THEMES,
} from '@athletic/domain';

const base = {
  id: z.string().min(1).max(64),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable().default(null),
};

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected yyyy-mm-dd');

export const rowSchemas = {
  patterns: z.object({
    ...base,
    key: z.enum(PATTERN_KEYS).nullable().default(null),
    name: z.string().min(1).max(60),
    role: z.enum(ROLES),
    counts: z.boolean(),
    position: z.number().int().min(0).max(999),
  }),

  exercises: z.object({
    ...base,
    name: z.string().min(1).max(80),
    patternId: z.string().min(1).max(64),
    where: z.enum(['gym', 'home']),
    tags: z.array(z.string().max(30)).max(10),
    description: z.string().max(600).default(''),
    // Relative, same-origin paths only: an absolute URL here would let a
    // compromised client point every device's image at a host it chose.
    images: z.array(z.string().max(200).startsWith('/')).max(8).default([]),
  }),

  slots: z.object({
    ...base,
    key: z.enum(SLOT_KEYS).nullable().default(null),
    name: z.string().min(1).max(60),
    requiredRole: z.enum(SLOT_ROLES),
    position: z.number().int().min(0).max(999),
    sessionIndex: z.number().int().min(0).max(13).nullable().default(null),
    patternKeys: z.array(z.enum(PATTERN_KEYS)).max(8).nullable().default(null),
    dayKey: z.enum(DAY_KEYS).nullable().default(null),
  }),

  splitPeriods: z.object({
    ...base,
    split: z.enum(SPLIT_KEYS),
    days: z.number().int().min(1).max(7),
    startWeek: isoDay,
    // At least one: a period covering nothing would score every week complete.
    patternKeys: z.array(z.enum(PATTERN_KEYS)).min(1).max(8),
  }),

  entries: z.object({
    ...base,
    sessionIndex: z.number().int().min(0).max(13),
    slotId: z.string().min(1).max(64),
    exerciseId: z.string().min(1).max(64).nullable().default(null),
    sets: z.number().int().min(0).max(50),
    repRange: z.string().max(40),
    startWeight: z.number().min(0).max(2000).nullable().default(null),
    note: z.string().max(500),
  }),

  logs: z.object({
    ...base,
    date: isoDay,
    session: z.string().min(1).max(4),
    exerciseId: z.string().min(1).max(64),
    setNo: z.number().int().min(1).max(100),
    weight: z.number().min(0).max(2000).nullable().default(null),
    reps: z.number().int().min(0).max(1000).nullable().default(null),
    rir: z.number().int().min(0).max(20).nullable().default(null),
    note: z.string().max(500),
  }),

  refSets: z.object({
    ...base,
    date: isoDay,
    exerciseId: z.string().min(1).max(64),
    weight: z.number().min(0).max(2000).nullable().default(null),
    reps: z.number().int().min(0).max(1000).nullable().default(null),
    note: z.string().max(2000),
  }),

  bodyLogs: z.object({
    ...base,
    date: isoDay,
    // A plausible human, in either unit. Out of range is a typo, and a typo in
    // the denominator of the strength score is worse than a rejected write.
    weight: z.number().min(20).max(700),
    note: z.string().max(500).default(''),
  }),

  profile: z.object({
    ...base,
    onboarded: z.boolean(),
    split: z.enum(SPLIT_KEYS).default('sevenPattern'),
    days: z.number().int().min(1).max(7),
    where: z.enum(['gym', 'home']),
    bias: z.enum(BIASES),
    blockStart: isoDay,
    blockWeeks: z.number().int().min(1).max(52),
    unit: z.enum(['kg', 'lb']),
    lang: z.enum(LANG_CODES),
    theme: z.enum(THEMES).default('system'),
    heightCm: z.number().int().min(80).max(260).nullable().default(null),
    sex: z.enum(SEXES).default('unspecified'),
    name: z.string().max(60).default(''),
    // A plausible living person. Out of range is a typo, and a typo here shifts
    // the age allowance on every week of the strength score.
    birthYear: z.number().int().min(1900).max(new Date().getUTCFullYear()).nullable().default(null),
    /**
     * Capped hard, and required to be an image.
     *
     * This row travels on every pull, so an un-capped field here would make
     * every sync carry a photograph. The client downscales to a small square
     * before encoding; this is the backstop that stops a client which does not.
     */
    avatar: z
      .string()
      .max(64_000)
      .refine((v) => v.startsWith('data:image/'), 'expected an image data URL')
      .nullable()
      .default(null),
  }),
} as const;

export type RowSchemas = typeof rowSchemas;
export type TableKey = keyof RowSchemas;
