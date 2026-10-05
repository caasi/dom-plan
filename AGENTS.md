# AGENTS.md

This file is for coding agents that write code with `@caasi/dom-plan`, or that change this repository.

## What dom-plan is

dom-plan is a lazy, monadic, jQuery-inspired layer for the DOM. A `Plan` is a description of DOM work. To build a plan does not touch the DOM. Only `plan.run(root)` does the work.

The core idea has four parts:

- **jQuery-inspired.** Chains, the step model of `pushStack`, and the delegation rules come from jQuery.
- **Monadic.** Selection is a monad over a list of elements. Effects ride along, like a Writer. `run` is the only exit.
- **Lazy.** Nothing happens before `run`. The user decides when to leave the lazy part.
- **Light.** One class and one array of steps. DOM behavior is the native behavior.

The design record is `docs/000-design.md` (Traditional Chinese). The code in `src/index.ts` is the source of truth.

## Rules for code that uses dom-plan

### Run the plan

1. End each plan that must change the DOM with `.run(root)`.
2. If a `mount` handler returns a plan, do not call `run` on it. `mount` runs it in a microtask.
3. Do not write `$(...)`. Start a plan with `Plan.all`, `Plan.from`, `Plan.create`, or `Plan.none`.

A plan that is built and never run does nothing. TypeScript does not report this mistake.

### Select

- Each select step starts from the elements that the previous step held: `find`, `filter`, `closest`, `first`, `add`.
- `end()` goes back to the set of the previous select step, like jQuery `.end()`.
- `add(css)` takes a selector string only.

There are no getters. To read a value, run a plan with no effects and read the returned elements. You can also read a value inside `tap`.

### Do several things in one plan

1. To run another plan after this one, use `also(next)`.
2. To keep a guard for several parts, branch with `end()`. Do not start the second part with `also(Plan.all(...))`.

`Plan.all` selects again from the root, so it ignores the guard. This example keeps the guard for both parts:

```ts
const current = Plan.all('#forecast').filter(el => (el as HTMLElement).dataset.req === id)
current.find('.days').setText('').end().find('.place').setText(place).run(document)
```

3. To append several new children, chain `append`. Each call builds a new copy of the child plan.

### Effects inside closures

dom-plan does not prevent effects inside handlers, `tap`, `flatMap`, or `filter`. You are responsible for them.

In this repository, obey this convention:

1. In a handler, only call methods on the event and read values.
2. Put all other effects in `tap`.
3. If you break this convention, write a comment that gives the reason.

### Asynchronous work

dom-plan does not wrap promises. Use native `Promise`.

1. Store a request id in a `data-` attribute of the target element.
2. Start the request inside `tap`, after the plan sets the id.
3. When the response arrives, build a plan with a `filter` guard on the id. Then call `run`.

If the request starts in the handler and the promise is already settled, the response arrives before the id exists.

### Native behavior

- `addClass('a b')` throws `InvalidCharacterError` at `run`. Use one class per call.
- `append` uses `Element.append`. A node that is already in the document moves.
- `append(child)` runs `child` with each target as the root.

### Events

`mount(root, bindings)` delegates events with the rules of jQuery. It returns a function that removes the listeners.

- The root element itself is never matched.
- Handlers for inner elements run first. `stopPropagation()` stops the outer levels.
- `stopImmediatePropagation()` does not stop other handlers at the same level.
- `focus`, `blur`, `mouseenter`, `mouseleave`, `pointerenter`, and `pointerleave` are delegated with the events that bubble. The handler gets the native event, so `e.type` is, for example, `focusin`.
- `e.currentTarget` is the root only while the handler runs. If a `tap` needs the root, store it in a `const` in the handler.
- A handler that returns `false` does not stop the event. Call `e.preventDefault()`.

## Rules for changes to this repository

1. Do not add a method named `then` to `Plan`. A `then` method makes every plan a thenable, and `await plan` never settles.
2. Keep `Plan` with one field: the array of steps.
3. If a change adds a concept, compare it with the four parts of the core idea first.
4. In tests, compare DOM elements by identity. Use the `same` helper in `test/plan.test.ts`.

`assert.deepEqual` compares elements by structure, so `[a, b]` equals `[b, a]`.

5. After you change `src/`, break the new code once and make sure that a test fails.

### Commands

| Command             | What it does                                                  |
| ------------------- | ------------------------------------------------------------- |
| `npm test`          | Unit checks with jsdom, about 1 second                        |
| `npm run typecheck` | `tsc` with `noEmit`                                           |
| `npm run lint`      | oxlint on `src`, `test`, and `examples`                       |
| `npm run format`    | prettier, writes the files                                    |
| `npm run check`     | typecheck, lint, prettier check, and tests                    |
| `npm run build`     | writes `dist/`                                                |
| `npm run e2e`       | builds the examples and runs them in Chromium with Playwright |

No hook runs these commands. Run them yourself before you commit.
