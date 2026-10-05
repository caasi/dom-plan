# AGENTS.md

This file is for coding agents that write code with `@caasi/dom-plan`, or that change this repository.

## What dom-plan is

dom-plan is a lazy, monadic, jQuery-inspired layer for the DOM. A `Plan` is a description of DOM work. To build a plan does not touch the DOM. Only `plan.run(root)` does the work.

The core idea has four parts:

- **jQuery-inspired.** Chains, the step model of `pushStack`, and the delegation rules come from jQuery.
- **Monadic.** Selection is a monad over a list of elements, with `Plan.from` as `return` and `flatMap` as bind (`flatMap` takes a function that returns an array of elements, not a plan). A plan is a sequence of steps. The only value it carries is the held set. Each select step reads the live DOM, so it sees the changes of earlier effects. `run` is the only exit.
- **Lazy.** To build a plan does not touch the DOM. The user decides when to leave the lazy part.
- **Light.** One class and one array of steps. DOM behavior is the native behavior. The library does not try to wrap everything: it does not change native behavior to make it easier, and it does not wrap promises.

The design record is `docs/000-design.md`. Known limits are in `docs/known-issues.md`, and planned work is in `docs/todos.md`. The code in `src/index.ts` is the source of truth.

## Rules for code that uses dom-plan

### Run the plan

1. End each plan that must change the DOM with `.run(root)`.
2. If a handler returns a plan, do not call `run` on it. The plan runs in a microtask, with the element that `on` bound as `root`.

In a plan that a handler returns, `Plan.all` and `add` select only under the bound element. `Plan.all('#elsewhere')` outside it selects nothing, and nothing reports it.

3. Do not write `$(...)`. Start a plan with `Plan.all`, `Plan.from`, `Plan.create`, or `Plan.none`.

A plan that is built and never run does nothing. TypeScript does not report this mistake.

### Select

- Each select step starts from the elements that the previous step held: `flatMap`, `find`, `filter`, `closest`, `first`, `add`. `flatMap` is the primitive of `find`, `filter`, and `closest`.
- `Plan.from(el)` selects `el` wherever it is: outside the root, and also after `el` is removed. To skip a removed element, add `filter(el => el.isConnected)`.
- `closest` and `flatMap` can select elements outside the root.
- `also` concatenates the steps, so an `end()` after `also(next)` can go back into the first plan.
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

3. To append several new children, chain `append`. `append` runs the child plan once for each target, so a child that starts with `Plan.create` builds a new element each time.

### Effects inside closures

dom-plan does not prevent effects inside handlers, `tap`, `flatMap`, or `filter`. You are responsible for them.

The recommendation is to write the DOM and to send requests in `tap`, not in a handler. Then all DOM changes happen in `run`, in the order of the plan.

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

`plan.on(event, selector, handler)` delegates an event from each element that the plan holds, at `run`, with the rules of jQuery. `plan.on(event, handler)` binds to the element itself. Each call adds one binding; chain calls to add more. `plan.off` works like jQuery's `.off`: `off()` removes all bindings, `off(event)` removes those of the event, and `off(event, selector)`, `off(event, handler)`, or `off(event, selector, handler)` narrow it. An omitted trailing argument matches any.

Differences from jQuery's `.on` and `.off`. These forms are not supported. Event names are compared as literal strings, so most of them match no browser event and nothing reports it:

- No event namespaces: `on('click.menu', ...)` listens to an event named `click.menu`, which no browser event matches.
- No space-separated lists: `on('click keydown', ...)` listens to the literal name `click keydown`. Call `on` once for each event.
- No event map (`on({ click: f })`) and no `data` argument. Use a closure.
- `off('click', '**')` does not mean "all delegated bindings". `'**'` is compared as a plain selector.
- An omitted trailing argument of `off` matches any, and a trailing `undefined` is the same as omitting it. `undefined` before a given argument, and `null` anywhere, are not part of the contract.
- The TypeScript types are the contract. `null` is not a selector: write `on(event, handler)` for a direct binding. An untyped call with a wrong argument shape (for example a `data` object before the handler) can fail later, when the event fires.

```ts
Plan.all('.todoapp')
  .on('click', '.delete', (_e, btn) => Plan.from(btn).closest('li').remove()) // delegated
  .on('click', (_e, el) => Plan.from(el).addClass('touched')) // direct, on .todoapp itself
  .run(document)
```

- A plan with `on` that runs twice binds twice. Run it once, or call `off` first.
- To call `off` later, keep the bound element (`Plan.from(el).off(...)`). A selector that runs again can miss an element that was removed or changed.
- A delegated binding never matches the element that it is bound on. To handle events on that element, use a direct binding: `on(event, handler)` without a selector.
- Handlers for inner elements run first. `stopPropagation()` stops the outer levels.
- `stopImmediatePropagation()` does not stop other handlers at the same level.
- In a delegated binding, `focus`, `blur`, `mouseenter`, `mouseleave`, `pointerenter`, and `pointerleave` use the events that bubble. The handler gets the native event, so `e.type` is, for example, `focusin`. A direct binding uses its own event type.
- There is no binding on `document` or `window`. Use `Plan.from(document.documentElement)`, or the native API inside `tap`.
- `e.currentTarget` is the bound element only while the handler runs. If a `tap` needs it, store it in a `const` in the handler, or use the `el` of a direct binding.
- The plans that the handlers of one bound element return run after all of that element's handlers for the event are called. A later handler of the same element does not see the DOM change of an earlier one. In jQuery, it does. A bound element further out has its own listener, so on a real event its handlers can see those changes.
- If a handler throws, the remaining handlers of that bound element are not called for this event. The listeners of other elements still run.
- A handler cannot return `false` (TypeScript rejects it). To stop the default action, call `e.preventDefault()`.

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
