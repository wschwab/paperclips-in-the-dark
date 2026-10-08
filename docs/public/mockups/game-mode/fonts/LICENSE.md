# Font licenses — `frontend/public/fonts/`

All fonts are self-hosted under this directory. **None are hotlinked.**
No commercial faces are used (the original Blades sheets' Kirsty is
commercial and deliberately avoided, per PAPERCLIPS §12).

Each family has its own per-font license file alongside this index:

| Family | File prefix | License | Copyright |
|---|---|---|---|
| League Gothic | `leaguegothic-OFL.txt` | SIL Open Font License 1.1 | Copyright 2010 The League Gothic Project Authors (theleagueof/league-gothic) |
| Oswald | `oswald-OFL.txt` | SIL Open Font License 1.1 | Copyright 2016 The Oswald Project Authors (googlefonts/OswaldFont) |
| Alegreya Sans | `alegreyasans-OFL.txt` | SIL Open Font License 1.1 | Copyright 2013 The Alegreya Sans Project Authors (huertatipografica/Alegreya-Sans) |
| Alegreya | `alegreya-OFL.txt` | SIL Open Font License 1.1 | Copyright 2011 The Alegreya Project Authors (huertatipografica/Alegreya) |
| IM Fell English | `imfellenglish-OFL.txt` | SIL Open Font License 1.1 | Copyright (c) 2010, Igino Marini (mail@iginomarini.com) |
| Special Elite | `specialelite-LICENSE.txt` | **Apache License 2.0** | Copyright (c) 2010 by Brian J. Bonislawsky DBA Astigmatic (AOETI) |

> **Note on Special Elite:** Google Fonts catalogs this face under Apache 2.0
> (see `apache/specialelite/METADATA.pb` upstream), not OFL. It is OSI-approved
> and freely redistributable; the per-face `specialelite-LICENSE.txt` here is the
> canonical Apache 2.0 text. The task's wording ("OFL files") tracks the
> dominant case — five of six are OFL; this one is Apache 2.0 and is recorded
> honestly here. The spec's substantive rule — *"never the originals, no
> commercial faces"* — is preserved.

## Subsets kept

Per spec §12, latin + latin-ext with cyrillic + cyrillic-ext retained for
**Oswald** and **Alegreya Sans** (the salvaged game-data JSON includes Russian
translations; cyrillic coverage is required). vietnamese, greek, and greek-ext
subsets are dropped to keep the bundle small.

Rebuild: `python3 scripts/build-fonts.py` from `frontend/` (re-downloads
every woff2 and emits `public/fonts/*.self.css` plus `src/styles/fonts.css`).