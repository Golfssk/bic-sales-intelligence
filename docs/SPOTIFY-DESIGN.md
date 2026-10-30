# Spotify-inspired analytics presentation

The owner's `DESIGN-spotify.md` replaces the earlier cream/coral presentation. The active entry point imports `src/spotify.css`; `src/claude.css` remains historical and is not imported or bundled.

- Near-black `#121212` canvas, `#181818` neutral cards, `#252525` elevated surfaces.
- White primary text; silver `#b3b3b3` supporting labels. Green `#1ed760` is reserved for primary actions, active states and analytical series, not page-wide green decoration.
- Pill buttons/search controls; circular close buttons; dark native date/select controls; visible keyboard focus, reduced-motion support and retained 44–48 px touch controls.
- Navigation, filters, tool inspector and nested sign-in/receipt dialogs use the same theme. Mobile bottom navigation and existing open/close sections are retained.
- Chart axes/labels/tooltips match dark surfaces. Red/green remain semantic; distinct category colors encode product groups rather than additional brand accents. Text and chart contrast are tested.
- System font fallbacks and the embedded Thai fallback are used. No proprietary Spotify font files, logo, remote font request or audio player is added. The owner's Dek Som Boon logo remains.

## Unchanged behavior

No calculation, unit conversion, product mapping, authentication, Cloud persistence or database policy is changed by this presentation update. The owner-approved ice cream 2 UNIT / UNI = 1 CUP rule remains active, with original source quantities retained. Existing unit/business/SQL tests and synthetic browser regressions cover those workflows.

## Checks

`npm test`, `npm run build`, and local Playwright scripts `tests/browser-theme.cjs`, `browser-mobile.cjs`, `browser-workbench.cjs`, `browser-cloud.cjs`, `browser-bi.cjs`, and `browser-units.cjs`. Theme checks inspect rendered colors, typography, dark inputs, pill geometry, responsive widths 320–1920 px, nested dialogs and unchanged KPI values. Supabase browser responses are mocked; no real sales data or live account credentials are used.
