# Warm editorial design system

Adapted for this dashboard from the owner's attached `DESIGN-claude.md`.
This is a visual direction, not a claim of affiliation with Claude/Anthropic.
The user's Dek Som Boon logo stays unchanged. No Anthropic mark, proprietary
font files, external font service, tracking or third-party asset is introduced.

## Roles

- Canvas `#faf9f5`: warm off-white, the main reading surface.
- Soft surface `#f5f0e8`: sidebar, filter bar, secondary controls.
- Card `#efe9de`: selected tabs and the primary sales KPI.
- Ink `#141413`, body `#3d3d3a`, muted `#6c6a64`: text hierarchy.
- Coral `#cc785c`: primary CTA and restrained emphasis.
- Active coral `#a9583e`: hover/focus; small text on cream uses the darker
  `#8d4a31` variant for contrast. Coral CTA uses dark ink, not low-contrast white.
- Success `#28754f`, negative/error `#b0443f`, warning `#875c12`: darker
  text variants for light backgrounds, not the former neon-green UI.
- Hairline `#e6dfd8`: quiet structure without heavy boxes or gradients.

Georgia/Times New Roman with the embedded Thai fallback provides the editorial
heading voice without shipping Copernicus/Tiempos/StyreneB. Body, controls and
numerical metrics remain Arial + embedded Noto Sans Thai for legibility.
Headings are calmer, supporting KPI text is larger, and spacing is more open.

Rounded corners follow the supplied hierarchy: 8px controls, 12px cards.
No decorative dark panels are added to the analysis surface. Dark warm tooltips
and code/audit blocks retain inverse text. Chart lines use muted terracotta,
positive/negative variance uses darker teal/red, and categorical groups retain
eight distinct muted colors. Values and signs remain available in tables.
Colors are centralized in `src/visual-tokens.js`; CSS roles in `src/claude.css`.

## Behavior and scope

All prior primary views, closable utility tabs, native dialogs, keyboard focus,
mobile bottom navigation, checkboxes, hour drill, table sorting and filters remain.
No measure formulas, Group mapping rules, import parsing, Auth flow, SQL/RLS,
Cloud project or sales records change as part of this theme release.

`tests/design.test.js` checks design tokens and representative text/chart contrast.
`tests/browser-theme.cjs` checks computed rendered styles, chart presentation,
filter/native-input theme and nested dialog surfaces. Existing workbench/mobile,
Cloud mocks and BI regressions remain required. These checks are not a blanket
accessibility certification; real assistive-technology testing remains valuable.

## Owner typography update

All rendered typography now uses pure black (`#000`), including secondary copy,
menu labels, positive/negative textual values, placeholders and chart tick labels.
Surface, border, series and status-marker colors remain. Signs, wording and chart
colors continue to distinguish positive/negative data. Tooltips and audit code
blocks use light cream backgrounds so their black text remains readable.
