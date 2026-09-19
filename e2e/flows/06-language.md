# Flow 06 — Language

**Who:** a Hungarian speaker, and anyone who switches afterwards.

**Why it matters:** a half-translated interface reads as broken software. The
risk is not a missing word — it is a missing *key*, which falls back to English
silently and ships looking finished.

## Preconditions

- An onboarded user

## Steps

1. Open `/settings` and switch language to **Magyar**.
2. Move through the tabs.
3. Switch back to **English**.
4. Reload.

## Expected

- The bottom tabs read `Edzés · Hét · Fejlődés · Beállítások`.
- The seven coverage tiles read `Guggolás · Csípőhajlítás · Kitörés · Nyomás ·
  Húzás · Forgatás · Cipelés`.
- Days are lettered **`A nap`**, and set numbers take the ordinal with its full
  stop: **`1. sorozat rögzítése`**.
- Counts take no plural after a numeral: **`2 sorozat`**, never `2 sorozatok`.
  This is the rule an English-speaking implementation gets wrong by default,
  because appending an "s" is the obvious move and it is wrong here. Hungarian
  does use the plural where no numeral precedes it ("Rögzített sorozatok"), so
  the check is on a count, not on the word anywhere on the page.
- Exercise names are translated too — *Goblet Squat* is *Goblet guggolás*.
- Switching repaints immediately, with no reload.
- The choice survives a reload, and a second device shows it — it lives on the
  profile and syncs, rather than sitting in one browser.
- `<html lang>` follows the choice, so screen readers and hyphenation behave.
- No hydration mismatch, with the browser itself in English or in Hungarian.

## Not translated, deliberately

Nothing the app itself names. The library is the catalogue in code, so every
exercise has a translated name; what a user types — their own name — stays as
they typed it.
