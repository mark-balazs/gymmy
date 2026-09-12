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
- Day labels take the Hungarian ordinal form — **`1. nap`**, with the full stop,
  not `Nap 1`.
- Counts take no plural after a numeral: **`3 sorozat`**, never `3 sorozatok`.
  This is the rule an English-speaking implementation gets wrong by default,
  because appending an "s" is the obvious move and it is wrong here.
- Switching repaints immediately, with no reload.
- The choice survives a reload — it lives on the profile and syncs across
  devices rather than sitting in one browser.
- `<html lang>` follows the choice, so screen readers and hyphenation behave.

## Not translated, deliberately

Exercise names stay in English. They are user-editable data, and English lift
names are normal in Hungarian gyms. Translating them would also mean translating
anything a user adds themselves, which is not possible.
