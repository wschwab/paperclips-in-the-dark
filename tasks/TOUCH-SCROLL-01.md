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
- 390×844: the card scrolled by the drag, the page was unchanged by it, the card reached its end (`cardScrollTop 850 = cardMax 850`), and the page then scrolled by the drag (`pageScrollY` 223 → 399). Horizontal overflow 0.
- 768×1024: the card scrolled by the drag, the page was unchanged by it, the card reached its end (`347 = 347`), and the page scrolled by the drag (74 → 249). Horizontal overflow 0. These values are from the `touch-scroll.json` regenerated in this commit; page positions vary with momentum between runs.

## Follow-up: mouse wheel (same trap)

- Red, `docs/public/evidence/touch-scroll-01/wheel-scroll-probe.mjs` (`wheel-scroll-red.log`): the wheel forwarder called `preventDefault` on every notch over the card. At 1440×560, 768×1024 and 390×844 the card scrolled, and then the page did not move at the card's end (`pageScrolledAtCardEnd: false`). 3 failures.
- Fix: `character-detail.ts` `forwardResolutionWheel` takes the notch only while the card can move in its direction, the same rule as the touch fix.
- Green (`wheel-scroll.json`, `wheel-scroll-green.log`): 0 failures. At each size the card reached its end, then the page scrolled 160px on the next notch. Horizontal overflow 0.
- The 1440 case uses height 560 instead of 1000. At 1440×1000 the card fits, so its inner list cannot be tested. This is recorded in the probe.

## Follow-up: horizontal-only input (review finding)

- Sol review at `9d689c61`: FAIL. A zero vertical delta counted as upward movement whenever the card was scrolled down, so both forwarders cancelled horizontal-only wheel and touch input that the card cannot use.
- Red, `docs/public/evidence/touch-scroll-01/horizontal-edge-probe.mjs` (`horizontal-edge-red.log`): the horizontal wheel notch was `defaultPrevented: true`, and all 11 horizontal touch moves were `defaultPrevented`. The card held at 100.
- Fix: both forwarders take input only for a non-zero vertical delta in a direction the card can still move.
- Green (`horizontal-edge.json`, `horizontal-edge-green.log`): neither input is prevented, the card holds at 100, 0 failures.


## Acceptance

- A vertical touch drag starting over the card scrolls the card's inner list.
- At the card's end, a further drag over the card scrolls the page.
- Horizontal overflow is 0 at 390×844 and 768×1024.
