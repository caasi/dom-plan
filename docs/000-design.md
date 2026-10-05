# dom-plan: a deferred subset of jQuery (design record, v4)

> Note: Claude Opus 5.5 wrote this document with the author (caasi), from their design sessions. Claude Fable 5.1 reviewed four drafts. In the "Decided by" column, "author" means caasi and "Claude" means the model.

Status: v4, 2026-10-05. The design is implemented in this repository, with 36 unit checks in jsdom and 21 browser checks. The package name is `@caasi/dom-plan`. **The code in `src/index.ts` is the source of truth.** This document records the decisions and the reasons for them.

History: Fable reviewed v1, v2.1, v3, and v3.1. v3 introduced the **step model** (section 4). v3.1 applied the author's decisions D19-D22 and the v3 review. v3.2 renamed the class to `Plan` (D19) and applied the v3.1 review. v4 applied the findings of the spike: `or` became jQuery's `add` and `end`, plus a new `also` (D25). Section 12 lists how each review finding was handled, and the v4 changes.

## 0. Core idea

A lazy, light-weight DOM operation language with a monadic interface, inspired by jQuery.

- **jQuery-inspired**: chain style, the step model (`pushStack`), and the delegation rules come from jQuery.
- **Monadic**: selection is a monad over a list, with `Plan.from` as `return` and `flatMap` as bind. A plan is a sequence of steps. The only value it carries is the held set. Each select step reads the live DOM. `run` is the only exit.
- **Lazy**: to build a plan does not touch the DOM. `run` does the work. The user decides when to leave the lazy part (D21).
- **Light**: one class and one array of steps. DOM behavior is the native behavior (D20). The library does not try to wrap everything.

## 1. Goals

- A subset of jQuery that **enhances existing HTML on a page**. It is for the DOM only, not a general tree language (D23).
- A value is a deferred **plan**: it selects elements, collects effects, and can build a tree from nothing. Nothing happens before `run`. This follows the idea of Haskell `runIO`.
- Chain style. Each step returns a new instance. Values are immutable at the type level (`readonly`).
- The approach of Paul Hudak: when a list and functions can express a thing, do not add a type. A plan is an array of steps.
- TypeScript, with an architecture that is easy to read and stays small.

## 2. Non-goals

General trees (hast, immutable trees), a single source of state (a Model), a virtual DOM, morphing, global subscriptions, `Msg` dispatch, continuations across `run`, a wrapper for asynchronous work, and window-level events (`resize`, `scroll` on the window).

## 3. Decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Decided by                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| D1  | Events use delegation. The selector is resolved when the event occurs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | author                                                      |
| D2  | `on` copies the bindings (the array and each tuple) when the plan is built, and they do not change after that. Binding selectors are validated at `run` (before D28: at `mount`). `off` removes bindings; an aborted `signal` removes the bindings it came with.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Claude (Fable S2, P2, v3 #8); the author did not object     |
| D3  | Imperative effects and DOM changes are both descriptions. Only `run` executes them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | author                                                      |
| D4  | No separate immutable tree and no morphing. `run` applies the effects to the live DOM.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Claude; the author did not object                           |
| D5  | **The only exit is `run(root)`.** It replays all steps and returns the elements of the last step.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | author                                                      |
| D6  | Chain style. Each step returns a new instance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | author                                                      |
| D7  | An empty selection does nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | author                                                      |
| D8  | **Step model**: each select step computes a new set from **the elements that the previous step held**. This occurs once, at `run`. Effects act on the set of the current step. Effects see the earlier changes to the DOM, but the selected elements are fixed at their step. This is jQuery's `pushStack`, replayed at `run`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | author                                                      |
| D9  | After each select step, the set is deduplicated and sorted in **document order** (`compareDocumentPosition`), like jQuery `uniqueSort`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | author                                                      |
| D10 | Delegation matches each ancestor between `event.target` and the root (the root is not included). Inner handlers run first. At one level, handlers run in binding order. `stopPropagation` stops the outer levels.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | author                                                      |
| D11 | A delegated binding never matches the element it is bound on. A direct binding (selector `null`, D28) matches only that element.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | author                                                      |
| D12 | Events that do not bubble are bound like in jQuery: `focus`→`focusin`, `blur`→`focusout`, `mouseenter`→`mouseover`, `mouseleave`→`mouseout`, `pointerenter`→`pointerover`, `pointerleave`→`pointerout`. Enter and leave are emulated with `relatedTarget`. Bindings are grouped by native event type, with one listener for each native type.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | author                                                      |
| D13 | **Effects inside closures are not prevented. The user must know what they do.** Handlers, the callback of `tap`, and the functions of `flatMap` and `filter` are ordinary closures. The library does not check, wrap, or block any operation in them: DOM writes, requests, `run` inside `tap`, or elements stored outside. The types cannot block these operations either. This is intentional, not a gap. Because the library cannot prevent these effects, it states no rule about them. It recommends writing the DOM and sending requests in `tap`, not in a handler.                                                                                                                                                                                                                                                                                                                                                                                                                      | author                                                      |
| D14 | ~~The common prefix of `or` runs once.~~ Removed in v4 together with `or` (D25).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | author                                                      |
| D15 | No Rust-style unwrap function. `run` returns a plain array. A plan with no effects is a plain read.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Claude; the author did not object                           |
| D16 | The effect primitive is named `tap`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | author                                                      |
| D17 | `stopImmediatePropagation` is not supported: the other handlers at the same level still run. The call still sets `cancelBubble`, so the outer levels stop.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | author                                                      |
| D18 | Handlers get the native event, not a rewritten one. A `focus` binding gets `e.type === 'focusin'`. The matched element is the second argument, `el`. `e.currentTarget` is the root **only while the handler runs**. After the handler returns, its value is not defined. For a real user event, the browser runs microtasks after each listener, so the plan still sees the root. After `dispatchEvent` or `el.click()`, the value is `null`. If a `tap` needs the root, store it in a `const` in the handler.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | author (the `currentTarget` part: Fable S3, v3 #4, v3.1 #2) |
| D19 | Package `@caasi/dom-plan`. The entry points are the static methods of the class `Plan` (`Plan.all`, `Plan.from`, `Plan.create`, `Plan.none`). There is no separate entry object. Reason: an agent that sees `$` applies the jQuery model of immediate execution. With `Plan`, the type, the entry point, and the documentation use one word, and the word is a reminder to call `run`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | author                                                      |
| D20 | Trees from nothing: `Plan.create(tag)` is a plan that starts from a new element. `append(child)` runs `child` once for each target, with the target as the root. It gives the returned elements to the native `Element.append`. **The behavior is the DOM behavior**: a node that is already in the document moves. The library does not filter or copy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | author                                                      |
| D21 | **No required style for asynchronous work, and no attempt at a complete wrapper.** A user can build many plans and run them many times, and can call `run` inside `tap` or `fetch().then()`. The user decides when to leave the lazy part. No Promise appears inside a plan.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | author                                                      |
| D22 | **No merging**: the plan of each handler gets its own microtask. The plans run in call order (inner first, then binding order). An error in one plan does not stop the others.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | author                                                      |
| D23 | DOM only. No general tree language.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | author                                                      |
| D24 | Effect methods keep the native behavior. `addClass('a b')` throws `InvalidCharacterError` at `run`, because `DOMTokenList` does not accept spaces. The library does not split the string.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | author (Fable v3 #6, same principle as D20)                 |
| D25 | **`or` is removed and split into three methods, like jQuery.** `add(css)` adds the elements of a selector (jQuery `.add`; it takes a selection only, not a plan with effects). `end()` goes back to the previous set (jQuery `.end`; `exec` keeps a stack for `prevObject`). `also(next)` runs `next` after this plan in the same `run` and returns the elements of `next`. Reason: in the spike, all 11 uses of `or` in the two examples were sequencing, and none was a union. `or` carried union, sequencing, and a shared-prefix rule at the same time. Its designers made an error with it in the weather app: a guard was bypassed by a branch that selected again from the root. jQuery has no `also`, because jQuery runs each line at once, so two statements are already in order. Laziness needs it. Every plan starts from a starting point (the constructor is private), so `next` does not start from the set of this plan (an `end()` in `next` can still go back into it, D26). | author                                                      |
| D26 | **No composition of effect order** (scheduling, interleaving, asynchronous order). That needs a lazy stream. `also` only concatenates steps, in the written order. Because the steps are concatenated, an `end()` after `also(next)` can go back into the first plan.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | author                                                      |
| D27 | **`Plan.from(el)` is the `return` of the selection monad**: it selects `el` wherever `el` is, without a check against the root. Reason: the root check was not jQuery and not needed by laziness. It made `append(Plan.from(el))` unable to move a node to a new parent, and it applied the root scope to `from` but not to `closest`. The result of `Plan.from(el)` is still a `Plan`: a description whose first step selects `el` at `run`. Consequence: a removed element is no longer skipped. A plan from a handler or a `.then` that starts with `Plan.from(el)` acts on `el` also after `el.remove()`. To skip it, add `filter(el => el.isConnected)` (R35). `Plan.create` stays separate from `from`: `create` makes a new element at each `run`, and `from` returns the same element each time.                                                                                                                                                                                        | author (Fable drift review, finding 4)                      |
| D28 | **`mount` is replaced by `Plan.on` and `Plan.off`.** To bind events is an effect on selected elements, so it is an effect step: `plan.on(bindings, { signal })` binds at `run`, on each held element, with the delegation rules of D10-D12. A handler plan runs with that element as root. `plan.off(bindings)` removes the equal bindings (same event, selector, and handler), and `off()` removes all of them. A binding with the selector `null` binds to the element itself (direct binding), and it runs after the delegated bindings, like in jQuery. Each bound element keeps its own table in a `WeakMap`, so that `off` can find the listeners. This is the only state that the library keeps. Because binding is an effect, a plan that runs twice binds twice.                                                                                                                                                                                                                       | author                                                      |

## 4. The core: a plan is an array of steps

The code is in `src/index.ts` (137 lines of code, without comments and empty lines). Structure:

- `Step` has three kinds: `q` (select: compute a new set from the previous set), `fx` (effect: act on each element of the current set), and `end` (go back to the previous set).
- `exec(steps, root)` processes the steps in order. Before each `q` step, it pushes the current set onto a stack. `end` pops it (jQuery's `prevObject`). After each `q` step, it deduplicates and sorts the set in document order (D9).
- `Plan` has one field, `steps` (private). Starting points: `Plan.all`, `Plan.from`, `Plan.create`, `Plan.none`. Selection: `flatMap`, `find`, `filter`, `closest`, `first`, `add`, `end`. Sequencing: `also`. Effects: `tap` and one-line wrappers (`addClass`, `removeClass`, `toggleClass`, `attr`, `removeAttr`, `setText`, `remove`, `append`). Exit: `run(root)`.
- `Plan` must not have a method named `then` (Fable v3 #2: a `then` method makes every plan a thenable).

### Usage

```ts
// removeClass then addClass act on the same held set (D8)
Plan.all('.a').removeClass('a').addClass('b').run(document)

// build a tree from zero (D20); each append builds a fresh copy
const item = (id: string, text: string) =>
  Plan.create('li')
    .attr('data-id', id)
    .addClass('todo')
    .append(Plan.create('input').attr('type', 'checkbox'))
    .append(Plan.create('span').addClass('title').setText(text))

Plan.all('ul.todos').append(item(id, text)).run(document)

// a plan with no effects is a plain read (D15)
const [first] = Plan.all('.chart').run(document)
```

### Semantics

- **The monad is the selection part.** A plan with only select steps is a function from the root to an ordered set. `Plan.from` is `return` (left identity: `Plan.from(x).flatMap(f)` selects `f(x)`, deduplicated and in document order by D9), and `flatMap` is associative and has a right identity. A plan is a sequence of steps, and the only value it carries is the held set. Each select step reads the live DOM, so effects change what a later select step sees. Right zero does not hold: `Plan.all('p').addClass('x').filter(() => false)` and `Plan.none` both return `[]`, but the first one adds a class.
- **A plan is a query, not a result set**: two calls to `run` select again and repeat the effects.
- **The child of `append`** returns the elements of its **last step**. The target is its root, so `append(Plan.all('.x'))` moves the `.x` elements under the target to the end of the target. To move a node to a new parent, use `append(Plan.from(el))` (D27).
- **A build script runs before its node is in the document.** Operations that need a node in the document, such as `focus`, have no effect in it.
- **`closest` and `flatMap` can select elements outside the root.** jQuery does the same.
- **To change two groups of elements in order, use `also`**: `Plan.from(btn).closest('li').remove().also(count)`. `remove` runs first, then `count`.
- **To keep a guard, branch with `end`, not with a new starting point in `also`**: `guarded.find('.days').setText('').end().find('.place').setText(p)`. `also(Plan.all(...))` selects again from the root and bypasses the guard. The spike hit this error in the weather app.
- **To append several new children, chain `append`**: `days.reduce((p, d) => p.append(item(d)), forecast.find('.days').setText(''))`.

## 5. Delegation

The code is `on`, `off`, and the functions `bind`, `unbind`, and `dispatch` in `src/index.ts`. The types:

```ts
type Handler = (e: Event, el: Element) => Plan | void
type Binding = readonly [event: string, selector: string | null, handler: Handler]
on(bindings: readonly Binding[], opts?: { signal?: AbortSignal }): Plan
off(bindings?: readonly Binding[]): Plan
```

At `run`, `on` adds the bindings to the table of each held element and adds one listener for each native event type (D12). For each event, the listener walks from `event.target` up to the bound element. At each element, it matches the bindings in order: a delegated binding matches a descendant (D10, D11), and a direct binding matches only the bound element. A handler that returns a plan gets its own microtask, and the plan runs with the bound element as root (D22). Like jQuery, the listener ignores a `click` with `button >= 1`, and a `click` on a disabled element. The listener reads a copy of the table at the start of a dispatch, so an `on` or `off` during a dispatch applies to the next one.

## 6. Asynchronous work (D21)

The library does not require a style. The weather app in the spike uses the most direct style: the handler reads values; the request starts in `tap`, after `data-req` is set; when the response arrives, a plan runs in `then`.

```ts
let seq = 0

const onSubmit: Handler = (e, form) => {
  e.preventDefault()
  const city = (form.querySelector('input') as HTMLInputElement).value
  const id = String(++seq) // Date.now() can repeat within 1 ms
  const forecast = Plan.all('#forecast').filter(el => (el as HTMLElement).dataset.req === id) // the guard
  return Plan.all('#forecast')
    .attr('data-req', id)
    .addClass('loading')
    .tap(() => {
      // starts after data-req exists
      fetchForecast(city)
        .then(data =>
          forecast
            .removeClass('loading')
            .tap(el => render(el, data))
            .run(document),
        )
        .catch(() => forecast.removeClass('loading').addClass('error').run(document))
    })
}
```

- The request must start in `tap`. If it starts in the handler and the promise is already settled (a cache, an immediate rejection of an empty string, `Promise.resolve` in a test), `then` runs before the plan that `mount` scheduled. The guard finds no `data-req`, and the page stays in the loading state (Fable v3.1 #1). A start in `tap` also follows the recommendation of D13.
- Race condition: the request id is stored in the DOM. The `filter` blocks an old response, because the set is empty (D7).
- `#forecast` must be under the element that `on` bound, because the plan that a handler returns runs with that element as root.
- An alternative is to dispatch the response as a `CustomEvent` on the element, and let a binding handle it. In that case, a delegated binding does not match the element that it is bound on (D11); use a direct binding (`null`) for it. The spike does not use this alternative.

## 7. Comparison with Elm

|                      | Elm                                        | dom-plan                                     |
| -------------------- | ------------------------------------------ | -------------------------------------------- |
| State                | A separate `Model`                         | The DOM itself                               |
| Update               | Computes `view` again, diffs a virtual DOM | Changes only the selected nodes              |
| Events               | `Msg` + `update`                           | A delegation table; a handler returns a plan |
| Effects              | `Cmd`, run by the runtime                  | A plan, run by `run`                         |
| Asynchronous work    | A `Cmd` produces a `Msg`                   | No required style; the user calls `run`      |
| Global subscriptions | `Sub`                                      | None                                         |

The Elm column comes from the knowledge of Claude about Elm 0.19. It was not checked against the Elm documentation.

## 8. jQuery source references (jquery/jquery main, read with `gh api` on 2026-10-05)

| Decision                  | What jQuery does                                                                                                                                                                                     | Location                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| D8                        | Selection methods call `pushStack`: a new object holds the new set, and `prevObject` points to the previous step. Effect methods act at once and `return this`. There is no merging or optimization. | `src/core.js` lines 57-67; `src/attributes/classes.js`                        |
| D9                        | `jQuery.uniqueSort` sorts with `compareDocumentPosition` and removes duplicates.                                                                                                                     | `src/traversing.js` lines 65, 91, 180; `src/traversing/findFilter.js` line 71 |
| D10, D11                  | It walks from `event.target` up to `this` (not included) and matches all delegated selectors at each level. `isPropagationStopped` stops the outer levels.                                           | `src/event.js` near lines 304-316, 350-398                                    |
| D12                       | `focus` and `blur` use `focusin` and `focusout`. Enter and leave use over and out, with a `relatedTarget` check in the `handle` of each handleObj.                                                   | `src/event.js` near lines 736, 807-835                                        |
| Click filter in section 5 | It ignores a `click` with `button >= 1` and a `click` on a disabled element.                                                                                                                         | `src/event.js` near lines 355-366                                             |
| D25                       | `.add(selector)` merges the current set with the elements of a selector, then calls `uniqueSort` and `pushStack`. `.end()` returns `prevObject`.                                                     | `src/traversing.js` lines 89-95; `src/core.js` lines 110-112                  |

## 9. Differences from jQuery (for the user documentation)

Taken from section 3 of the Fable v3 review.

- Nothing happens before `run`.
- `Plan.all('.a')` selects at `run`. In jQuery, `const $a = $('.a')` is a set that is fixed when it is created.
- `end()` exists. `.prevObject` and `.addBack()` do not. `add` takes a selector string only, not elements or a jQuery object.
- jQuery has no `also(next)`: only a lazy library needs an explicit "then do this".
- There are no getters (`.text()`, `.attr(n)`, `.val()`, `.hasClass()`). Use `run` and plain JavaScript, or read inside `tap`.
- `addClass('a b')` throws (D24).
- `filter` takes a function only: `filter(el => el.matches('.done'))`.
- HTML strings are not accepted, and there is no `.html()`. To empty an element, use `setText('')`.
- The child of `append` runs with the target as its root (D20).
- A handler that returns `false` is ignored (`false` is falsy). It is not `preventDefault()` + `stopPropagation()`.
- A handler gets `(e, el)`. `this` is not the element, and `e.type` is the native type. In a delegated handler, jQuery sets `currentTarget` to the matched element and `delegateTarget` to the root. dom-plan does not change the event: `currentTarget` is the root, the matched element is `el`, and after the handler returns, `currentTarget` is not defined (D18).
- A delegated binding never matches the element it is bound on (D11). For that element, use a direct binding: the selector `null` (D28).
- Events that do not bubble (`load`, `error`, `scroll` on an element, `toggle`, `invalid`, `play`, and more) do not reach the root. The only exceptions are the six events of D12. jQuery delegation has the same limit, but both libraries have direct binding.
- The plan that a handler returns runs **after** all handlers of the event are called. A later handler does not see the DOM change of an earlier handler. jQuery changes the DOM at once, so a later handler sees it.
- With several targets, `append(child)` runs the child once for each target. jQuery copies the node for all targets except the last. For a child that starts with `create`, the result is the same. For `append(Plan.all('.x'))`, it is different.
- There is no `trigger`. Use `dispatchEvent(new CustomEvent(...))` inside `tap`.
- `stopImmediatePropagation` does not stop the handlers at the same level (D17).
- `off(bindings)` removes bindings by value (same event, selector, and handler). There are no event namespaces.
- `attr(n, v)` takes strings only. There is no `prop`, `val`, or `css`. Use `tap`.
- If another listener on the root already called `stopPropagation`, dom-plan runs no handler. This is stricter than jQuery.
- Binding selectors use `Element.matches`. A relative selector (`> li`) throws `SyntaxError` at `run` (D2). `:scope` means the matched element.

## 10. Open questions and later work

The open questions are in `known-issues.md`. The planned work, with the generator style (`Plan.gen`), is in `todos.md`.

## 11. Spike

Two apps (`examples/`) and unit checks (`test/`).

- **Todo app**: add an item (`preventDefault` on submit, read the input value, `append` + `create`); toggle and remove items (delegation reaches items that were added later); filters for all, active, and done; the count of open items (on removal, `also` runs the count after the removal; see section 4); edit on double click (`focus` inside `tap`).
- **Weather app**: city → geocoding → forecast → list. It has three states: loading, error, and race (section 6). The API is Open-Meteo. On 2026-10-05, both endpoints answered 200 with `access-control-allow-origin: *`, so `file://` pages can call them.

Unit checks run in jsdom, except the checks marked "browser".

Compilation:

- C1 `strict`, `target es2019`, `lib: ["es2019","dom","dom.iterable"]`: 0 errors.
- C2 without `dom.iterable`: the expected error at the NodeList spreads does not occur with TypeScript 7.0.2, because `dom` includes the iterable types.
- C3 `lib` es2018: an error at `flatMap`.
- C4 `target es5`: TypeScript 7.0.2 removed this target, so the check cannot run.

Step model and selection (fixture: `<section id=root><div id=c2><div id=c1><span></span></div><span></span><p></p><input></div></section>`):

- R1 Deferral: a plan that is built but not run does not change the DOM. After `run`, it does.
- R2 D8, one step: after `Plan.all('.a').removeClass('a').addClass('b')`, the elements that had `a` have `b`.
- R3 D8, across steps: `Plan.all('.a').removeClass('a').find('.err').setText('')` empties the `.err` elements under the former `.a` elements.
- R4 `Plan.all('div').addClass('a').find('span').addClass('b')`: the divs have `a` only, and the spans have `b` only.
- R5 `run` returns the elements of the last step. `Plan.all('p').remove().run(root)` returns the removed `p`.
- R6 D9: `Plan.all('span, p').closest('div')` returns `[c2, c1]`.
- R7 D9 against the engine: `Plan.all('span').add('div').run(root)` equals `[...root.querySelectorAll('div, span')]` on the same root.
- R8 `end` goes back to the previous set. An empty guard stays empty after `end`, so neither part runs.
- R9 Two calls to `run` on one plan repeat the effects.
- R10 `Plan.from(el)` is `return`: it selects `el` also outside the root (D27). `Plan.from(root).run(root)` returns the root.
- R11 D7: `tap` does not call its callback on an empty set. `first()` on an empty set returns `[]`.
- R12 D20: `append(item(...))` builds one copy for each of two targets. A `create` plan that runs alone returns an element that is not attached. If the child ends with a select step, `append` attaches the set of that step.
- R13 Invalid selector: no error when the plan is built. `run` throws `SyntaxError`, and the later steps do not run.
- R14 `await Promise.resolve(plan)` settles (`Plan` has no `then`).
- R15 Removed in v4 (it tested `or`).
- R16 D24: `addClass('a b')` throws `InvalidCharacterError` at `run`.

Delegation (all synthetic events use `bubbles: true`):

- R17 A handler is called for an element that was added after `on` ran. When `click()` returns, the DOM is not changed yet. After `await null`, it is changed.
- R18 D10: with nested `.outer` and `.inner` and the binding order `[outer, inner]`, a click on `.inner` runs `[inner, outer]`. If one element matches both, the binding order applies. If inner calls `stopPropagation`, outer does not run.
- R19 D12 across types (browser): with `focus` on `.field` and `focusin` on `input`, focus on the input runs `[input, field]`. `blur` and `focusout` behave the same.
- R20 D11, D28: a delegated binding never matches the bound element. A direct binding (`null`) does, and it runs after the delegated bindings. A click on the bound element itself reaches only the direct binding.
- R21 D17: with two handlers at one level, the first calls `stopImmediatePropagation`. The second still runs, and the outer level does not.
- R22 D18: a `focus` binding gets `e.type === 'focusin'` (browser). In the handler, `e.currentTarget === root`. After **synthetic dispatch** (`dispatchEvent`), `e.currentTarget` read in `tap` is `null`.
- R23 Click filter: with a binding on an **ancestor** of a disabled button, `dispatchEvent(new MouseEvent('click', { bubbles: true }))` on the button calls the ancestor handler but not the binding on the button. A click with `button: 2` triggers nothing.
- R24 Enter and leave: a synthetic `mouseover` from one child of `.box` to another child does not trigger the `mouseenter` binding. A move from outside triggers it. `relatedTarget: null` triggers it.
- R25 A click handler on a checkbox calls `preventDefault`. After `click()` returns, `checked === false`.
- R26 D22: two handlers at two levels return plans with a shared prefix. The prefix runs twice. One plan object returned by two handlers also runs twice. If one plan throws, the other still runs. The check must catch the error first with `process.on('uncaughtException', ...)` or the unhandled-error hook of the test runner.
- R27 A handler that returns `undefined` schedules nothing. After `off()`, no handler is called. An invalid binding selector throws at `run`.
- R28 Browser: with two `on` calls on one element, the microtask of the first runs before the second listener on a real click. On a real click, `e.currentTarget` in `tap` is still the root. Also: a passive `touchstart`; focus events need a focused window.
- R29 `a.also(b)`: the effects of `a` run before the effects of `b`. `run` returns the elements of `b`.
- R30 `append(Plan.from(el))` moves `el` to a new parent (D20, D27).
- R31 F12 (browser): with a `focus` binding, `tap(el => el.focus())` calls the handler synchronously inside `run`. The plan of the handler runs in a later microtask, without an error.
- R32 Synthetic dispatch with two `on` calls on one element: the handlers of both listeners are called first. Then all microtasks run in order (compare R28).
- R33 `end()` after `also(next)` goes back into the first plan (D26).
- R34 Left identity: `Plan.from(x).flatMap(f)` selects `f(x)`, deduplicated in document order, with `x` outside the root.
- R35 `Plan.from(el)` still selects `el` after `el.remove()`; `filter(el => el.isConnected)` skips it (D27).
- R36 `on` is lazy: nothing is bound before `run`.
- R37 `off(bindings)` removes only the equal bindings.
- R38 A plan with `on` that runs twice binds twice; `off` removes both.
- R39 An aborted `signal` removes the bindings it came with.
- R40 `on` binds on each held element, and a handler plan runs with that element as root.

Dependencies on jsdom: R18 and R21 need `cancelBubble` to show `stopPropagation`. R27 needs the `signal` option of `addEventListener`. R25 needs the canceled activation of a checkbox. If one of these checks fails, first make sure that jsdom supports the feature. Then decide if the library has a fault.

## 12. Review findings and how they were handled

### v1

| #   | Finding                                            | Handling                                                                                             |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| F1  | The common prefix of `or` runs twice               | D14 (scope in v3 #3); removed with `or` in v4                                                        |
| F2  | A plan that schedules itself freezes the page      | Gone: effects do not return plans. A user can still call `run` inside `tap`; that is user code (D21) |
| F3  | `from` does not check the root                     | Applied                                                                                              |
| F4  | `mount` does not accept `document`                 | Applied                                                                                              |
| F5  | Errors                                             | Section 10                                                                                           |
| F6  | A handler cannot return nothing                    | Applied                                                                                              |
| F7  | Order of several bindings                          | Like jQuery (D10)                                                                                    |
| F8  | `freeze` freezes only the outer object             | Removed                                                                                              |
| F9  | `mount` keeps a reference to the caller's array    | Applied (D2)                                                                                         |
| F12 | `focus` inside `run` calls a handler synchronously | No re-entry: a handler only schedules a microtask                                                    |
| F13 | Passive listeners                                  | Section 10                                                                                           |
| F14 | Objects from another realm                         | `nodeType === 1`                                                                                     |

### v2.1

| #   | Finding                                    | Handling                                               |
| --- | ------------------------------------------ | ------------------------------------------------------ |
| M1  | A selection becomes invalid inside a chain | Step model (D8)                                        |
| M2  | One listener for each declared type        | Grouped by native type                                 |
| M3  | R14 tests nothing                          | Tests the ancestor instead (R23)                       |
| S1  | `closest` leaves the root                  | Section 4                                              |
| S2  | D2 copies only one level                   | Copies each tuple                                      |
| S3  | `currentTarget`                            | D18 (with v3 #4)                                       |
| S4  | `stopPropagation` was already called       | `!e.cancelBubble` in the loop condition; section 9     |
| P1  | Cost of `uniqSorted`                       | Not changed until measured                             |
| P2  | Unmount                                    | Applied                                                |
| P3  | Merge the plans of one dispatch            | No merging (D22, author)                               |
| P4  | `first()`                                  | Applied                                                |
| P5  | The `Element` type                         | Section 10                                             |
| P6  | `toggleClass(c, force)`                    | Applied                                                |
| P7  | The `root` parameter of a handler          | Removed; use `closest`, or store `currentTarget` (D18) |
| P8  | Opt out of passive listeners               | Section 10                                             |
| P9  | `nodeType === 1`                           | Applied                                                |
| P10 | Limits of `matches`                        | Section 9                                              |
| P11 | Window events                              | Non-goal                                               |

### v3

| #   | Finding                                                 | Handling                                     |
| --- | ------------------------------------------------------- | -------------------------------------------- |
| 1   | With merging (D22), the common prefix is not found      | No merging (D22, author); merge code removed |
| 2   | `private then` makes a plan a thenable                  | Renamed to `step`; R14                       |
| 3   | D14 is not associative                                  | Scope of D14 narrowed; removed in v4         |
| 4   | `currentTarget` is `null` in the microtask              | D18; R22                                     |
| 5   | The element that dispatches an event cannot be the root | Section 6                                    |
| 6   | `addClass('a b')` throws                                | Native behavior (D24, author); R16           |
| 7   | Expected error sites of C4                              | Corrected                                    |
| 8   | Validate selectors at `mount`                           | Applied (D2); R27                            |
| 9   | `as unknown as Binding`                                 | Removed                                      |
| 10  | `rel === el` is redundant                               | Removed                                      |
| 11  | `e.or(e)` adds an empty `or` step                       | Not changed; removed with `or` in v4         |

### v3.1

| #   | Finding                                                                                        | Handling                                                                                          |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | In section 6, the request starts before the plan, and a settled promise keeps the page loading | The request starts in `tap` (section 6)                                                           |
| 2   | In the microtask of a real event, `currentTarget` is still the root                            | D18, section 9, R22, and R28 corrected                                                            |
| 3   | `or` does not sort elements from different trees                                               | Section 4: chain `append`; removed with `or` in v4                                                |
| 4   | After a removal, `closest` cannot find the root                                                | Section 4: sequence the effects (`also` in v4); R29 (R30 tested `from` after a removal until D27) |
| 5   | `Date.now()` can repeat                                                                        | A counter instead                                                                                 |
| 6   | R26 must catch the error in the microtask                                                      | R26 corrected                                                                                     |
| 7   | Missing differences in section 9                                                               | Six items added                                                                                   |
| 8   | Dependencies on jsdom                                                                          | Listed in section 11                                                                              |
| 9   | A handler that throws stops the other handlers of the event                                    | Section 10                                                                                        |
| 10  | Wording of D14                                                                                 | General rule; removed in v4                                                                       |
| 11  | `steps` is public                                                                              | `private readonly`                                                                                |
| 12  | `then` has no `.catch`                                                                         | Section 6 uses `.then().catch()`                                                                  |
| 13  | `focus` can be done in `tap`                                                                   | Used in the spike                                                                                 |
| 14  | Missing unit checks                                                                            | R29-R32                                                                                           |

### v4 (after the spike)

| Source | Finding                                                                                                            | Handling                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| spike  | In the weather app, an `or` branch that started from the root bypassed the guard, and a stale response was shown   | Branch with `end()` (D25); R8; race check in the browser checks                                   |
| spike  | All 11 uses of `or` were sequencing, none was a union                                                              | Split into `add`, `end`, and `also` (D25)                                                         |
| spike  | The check "next must begin with a starting point" in `also` can never trigger                                      | Removed: the private constructor guarantees it                                                    |
| spike  | `assert.deepEqual` compares DOM elements by structure, not by identity                                             | The tests compare identity at each index. Four deliberate faults in the code made the checks fail |
| spike  | TypeScript 7.0.2: `dom` includes the iterable types (C2 reports no error); `target es5` is removed (C4 cannot run) | The expectations of C2 and C4 are withdrawn                                                       |
| author | A composition of effect order needs a lazy stream                                                                  | Not done (D26)                                                                                    |

### Fable review of drift from the core idea (after v4)

| #    | Finding                                                                                                  | Handling                                                                    |
| ---- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1    | The D13 convention cannot be obeyed (a request id must exist before the plan), and the examples break it | No rule for what the library cannot prevent; a recommendation instead (D13) |
| 2    | AGENTS.md omits the root rules, and the failures are silent                                              | AGENTS.md states them                                                       |
| 3    | AGENTS.md drops "does not try to wrap everything"                                                        | Restored                                                                    |
| 4    | The root check in `Plan.from` is not jQuery and has no decision                                          | Removed; `from` is `return` (D27); R10, R30, R34                            |
| 5    | `end` reaches across `also`                                                                              | Written as a rule (D26); R33                                                |
| 6    | "Effects ride along like a Writer" is the wrong model                                                    | Plain description in section 0, section 4, and AGENTS.md                    |
| 7-16 | Click filters, sort after `flatMap`, unused `Plan.none`, and smaller AGENTS.md corrections               | AGENTS.md corrections applied; the others are not urgent                    |
