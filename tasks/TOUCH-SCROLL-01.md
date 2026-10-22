# TOUCH-SCROLL-01

Touch scrolling over the Resolution card must scroll the card's own list, and at the card's end it must hand the drag to the page. The overlay must not trap touch scrolling.

## Finding

- The Resolution card is non-blocking (`pointer-events: none`), so a touch drag over it reaches the page underneath. `character-detail.ts` forwards touch drags to the card's scroll position.
- The forwarder called `preventDefault` on every move over the card. Once the card reached its scroll end, the page could not scroll either. That is a scroll trap.
- Red, Chromium touch emulation (`hasTouch`, `isMobile`), real CDP `Input.dispatchTouchEvent` drags, before the fix: `docs/public/evidence/touch-scroll-01/touch-scroll-red.log`. At 390×844 and 768×1024 the card scrolled by the drag (`cardScrolledByDrag: true`) and the page did not move during it, but at the card's end the page did not scroll (`pageScrolledAtCardEnd: false`, page scrollable). 2 failures.

## Fix

- `frontend/src/pages/character-detail.ts` `forwardResolutionTouch`: take the gesture only while the card can still move in the drag direction. At the card's end (or top) the touch is left to the page.

## Green

- `docs/public/evidence/touch-scroll-01/touch-scroll-probe.mjs` (run through `conformance/scripts/managed-browser-smoke.mjs --seed-defaults`), output `touch-scroll.json`. 0 failures.
- 390×844: the card scrolled by the drag, the page was unchanged by it, the card reached its end (`cardScrollTop 850 = cardMax 850`), and the page then scrolled by the drag (`pageScrollY` 220 → 396). Horizontal overflow 0.
- 768×1024: the card scrolled by the drag, the page was unchanged by it, the card reached its end (`347 = 347`), and the page scrolled by the drag (75 → 251). Horizontal overflow 0.

## Known exception, not changed

- The wheel forwarder (`forwardResolutionWheel`) has the same always-`preventDefault` pattern. This card covers touch only. A wheel trap at the card's end is not covered by this card or its probe.

## Acceptance

- A vertical touch drag starting over the card scrolls the card's inner list.
- At the card's end, a further drag over the card scrolls the page.
- Horizontal overflow is 0 at 390×844 and 768×1024.
