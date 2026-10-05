# Known issues

This file lists known limits of dom-plan and facts that are not verified. The decisions behind the limits are in `000-design.md`.

## Limits by design

These limits are intentional. They follow from the core idea.

- **A plan that is never run does nothing.** TypeScript does not report it, and nothing happens at run time.
- **Effects inside closures are not prevented (D13).** A handler, a `tap` callback, or a `flatMap` function can write the DOM, send a request, or store an element outside the plan. The types cannot block this.
- **`Plan.from(el)` does not skip a removed element (D27).** A plan that starts from a captured element still acts on it after `el.remove()`. Add `filter(el => el.isConnected)` to skip it.
- **Elements can escape.** The array that `run` returns, and elements that a `tap` callback stores, are plain DOM elements. Changes to them are outside the plan.
- **No effect-order composition (D26).** `also` concatenates steps in the written order. There is no scheduling, no interleaving, and no asynchronous ordering.
- **`addClass('a b')` throws `InvalidCharacterError` (D24).** This is the native behavior of `DOMTokenList`.
- **`stopImmediatePropagation` does not stop other handlers at the same level (D17).**
- **The root of `mount` is never matched (D11),** and there is no direct binding.

## Open questions

1. **Errors.** An invalid selector in a plan throws at `run`. The rest of the plan does not run. An error that a microtask throws has no stack that points to the code that built the chain. If a handler throws, the remaining handlers of that event are not called.
2. **Passive listeners.** If the root is `document` or `body`, a browser can treat `touchstart`, `wheel`, and similar events as passive. Then `preventDefault()` in a handler has no effect. The list of these events is not confirmed.
3. **The `Element` type.** `run(document)[0].value` needs a cast to `HTMLInputElement`. No generic type parameter is planned.
4. **Order of nodes in different trees.** `docOrder` uses `compareDocumentPosition`. For nodes in different trees, the order depends on the implementation. Transitivity across three or more trees is not confirmed. This affects held sets that mix nodes in the document with detached nodes, which `create`, `from`, `flatMap`, and `closest` can bring in.

## Not verified

- **The cost of `uniqSorted`.** Each select step deduplicates and sorts. The cost on large documents is not measured.
- **Contrast in the examples.** The title of the weather example is light text on blue (`#4d7cff`). The estimate is about 4:1, which is enough for large text. No tool measured it.
- **Browsers other than Chromium.** The browser checks run only in Chromium (Playwright). Firefox and Safari are not tested.
- **jsdom features.** Some unit checks depend on jsdom behavior: `cancelBubble` after `stopPropagation`, the `signal` option of `addEventListener`, and the canceled activation of a checkbox. They pass with the jsdom version in `package-lock.json`.

## Test environment

- **The browser checks need the network.** The weather example calls Open-Meteo. Without the network, the weather checks fail.
- **The browser checks use the newest cached Chromium.** `scripts/e2e.mjs` takes the newest `~/.cache/ms-playwright/chromium-*`, because the cached revision can differ from the revision of the installed Playwright. Set `CHROME` to use another executable.
- **TypeScript 7 changed two compile checks.** `dom` includes the iterable types, and `target es5` is removed. See section 11 of `000-design.md`.
