# dom-plan

> Note: Claude Opus 5.5 wrote this README with the author (caasi). Claude Opus 5.5 reviewed it.

A small, lazy DOM library in the style of jQuery. You describe the DOM work first, and run it later.

A `Plan` is a description of DOM work. To build a plan does not touch the DOM. Only `plan.run(root)` does the work. `root` is where `Plan.all` and `add` search, usually `document`.

```ts
import { Plan } from '@caasi/dom-plan'

const plan = Plan.all('.todo').removeClass('new').addClass('seen') // nothing happens yet
plan.run(document) // now the DOM changes
```

The core is about 1 KB, minified and gzipped.

## Install

```sh
npm install @caasi/dom-plan
```

Status: the package is not on npm yet.

## The core idea

dom-plan is a lazy, lightweight DOM operation language with a monadic interface, inspired by jQuery.

- **jQuery-inspired.** Chains, the step model of jQuery's `pushStack`, and the event delegation rules come from jQuery.
- **Monadic.** Selection is a monad over a list of elements: `Plan.from` is `return`, and `flatMap` is bind. Each select step removes duplicates and sorts the elements in document order. A plan is a sequence of steps, and the only value it carries is the set of elements that the current step holds.
- **Lazy.** To build a plan does not touch the DOM. `run` is the only exit. You decide when to leave the lazy part.
- **Lightweight.** One class and one array of steps. DOM behavior is the native behavior. The library does not try to wrap everything.

## Usage

### Select, then change

Each select step starts from the elements that the previous step held, like a jQuery chain.

```ts
Plan.all('form .field')
  .filter(el => el.hasAttribute('required'))
  .addClass('needs-check')
  .find('.error')
  .setText('')
  .run(document)
```

- Starting points: `Plan.all(css)`, `Plan.from(el)`, `Plan.create(tag)`, `Plan.none`.
- Select steps: `find`, `filter`, `closest`, `first`, `add`, `flatMap`, and `end` (back to the previous set).
- Effects: `addClass`, `removeClass`, `toggleClass`, `attr`, `removeAttr`, `setText`, `remove`, `append`, `on`, `off`, and `tap` for anything else.

`run` returns the elements that the plan holds at the end. A plan with no effects is a plain read:

```ts
const [input] = Plan.all('#name').run(document)
```

A plan is a query, not a result. If you call `run` again, it selects again and repeats the effects.

### Build elements

`Plan.create(tag)` starts from a new element. `append(child)` runs the child plan once for each target, with that target as the root. So a child that starts with `Plan.create` gives each target new elements.

```ts
const item = (text: string) =>
  Plan.create('li').addClass('todo').append(Plan.create('span').addClass('title').setText(text))

Plan.all('ul.todos').append(item('Buy milk')).run(document)
```

A child that starts with `Plan.all` searches inside the target, not the document. To move an element that is somewhere else, use `append(Plan.from(el))`.

### Do two things in order

`also(next)` runs another plan after this one, in the same `run`. `end()` goes back to the previous set, so one chain can change two parts of the same selection.

```ts
// button: the clicked element
Plan.from(button).closest('li').remove().also(Plan.all('.count').setText('2 left')).run(document)

Plan.all('#forecast').find('.days').setText('').end().find('.place').setText('Taipei').run(document)
```

### Events

`plan.on(event, selector, handler)` delegates an event from each element that the plan holds, with the rules of jQuery. `plan.on(event, handler)` binds to the element itself. Like every effect, it binds at `run`. A handler can return a plan, and that plan runs in a microtask with the bound element as root. `plan.off` works like jQuery's `.off`. These jQuery forms are not supported:

- Event namespaces (`click.menu`) and space-separated lists (`'click keydown'`): event names are compared as literal strings, so these match no browser event.
- `off(event, '**')`: `'**'` is compared as a plain selector, so it removes nothing.
- The event map (`on({ click: f })`) and the `data` argument: the TypeScript types reject them. An untyped call with a wrong argument shape can fail later, when the event fires.

The TypeScript types are the contract: `null` is not a selector.

```ts
const toggle = (_e: Event, box: Element) =>
  Plan.from(box)
    .closest('li')
    .toggleClass('done', (box as HTMLInputElement).checked)

Plan.all('.todoapp')
  .on('click', '.delete', (_e, btn) => Plan.from(btn).closest('li').remove())
  .on('change', '.toggle', toggle)
  .on('click', (_e, el) => Plan.from(el).addClass('touched'))
  .run(document)

// later
Plan.all('.todoapp').off('change', '.toggle', toggle).run(document) // one binding
Plan.all('.todoapp').off('click').run(document) // all click bindings
Plan.all('.todoapp').off().run(document) // everything
```

A plan with `on` that runs twice binds twice. Run it once, or call `off` first. To call `off` later, keep the bound element, so that a removed or changed element is not missed. There is no binding on `document` or `window`: use `Plan.from(document.documentElement)`, or the native API inside `tap`.

### Asynchronous work

dom-plan does not wrap promises. Build a plan when the data arrives, and run it. To ignore a stale response, keep a request id in the DOM and guard with `filter`. See section 6 of [the design record](https://github.com/caasi/dom-plan/blob/main/docs/000-design.md).

## Things to know

- A plan that is never run does nothing, and TypeScript does not report it.
- If a select step matches nothing, the later effects do nothing, and `run` returns an empty array. There is no error.
- Write to the DOM only in `tap` or in the effect methods, so that all changes happen in `run`. dom-plan cannot stop a handler, a `filter` function, or a `flatMap` function from changing the DOM.
- `Plan.from(el)` still selects `el` after `el` is removed. Add `filter(el => el.isConnected)` to skip it.
- Effects keep the native behavior: `addClass('a b')` throws, and `append` moves a node that is already in the document.

### Differences from jQuery that surprise users most

- Nothing happens before `run`.
- There are no getters (`.text()`, `.attr(name)`, `.val()`). Read with `run` and plain JavaScript, or inside `tap`.
- `filter` takes a function only: `filter(el => el.matches('.done'))`.
- HTML strings are not accepted. Build elements with `Plan.create`.
- The plans that the handlers of one bound element return run after all of that element's handlers for the event are called. A later handler of the same element does not see the DOM change of an earlier one. In jQuery, it does.

The full list is in section 9 of [the design record](https://github.com/caasi/dom-plan/blob/main/docs/000-design.md).

## Examples

`examples/` has a todo app, a weather app (Open-Meteo), and browser checks. To build them and run them in Chromium with Playwright:

```sh
npm install
npx playwright install chromium
npm run e2e
```

The script looks for Chromium in the Playwright cache at the Linux path. On other systems, set `CHROME` to the path of a Chrome executable. The weather checks need the network.

## Development

| Command             | What it does                               |
| ------------------- | ------------------------------------------ |
| `npm test`          | Unit checks with jsdom                     |
| `npm run typecheck` | `tsc` with `noEmit`                        |
| `npm run lint`      | oxlint                                     |
| `npm run format`    | prettier, writes the files                 |
| `npm run check`     | typecheck, lint, prettier check, and tests |
| `npm run build`     | writes `dist/`                             |
| `npm run e2e`       | browser checks with Playwright             |

## Documents

- [AGENTS.md](https://github.com/caasi/dom-plan/blob/main/AGENTS.md): rules for coding agents that use or change dom-plan.
- [docs/000-design.md](https://github.com/caasi/dom-plan/blob/main/docs/000-design.md): the design record, with each decision and its reason.
- [docs/known-issues.md](https://github.com/caasi/dom-plan/blob/main/docs/known-issues.md): known limits and facts that are not verified.
- [docs/todos.md](https://github.com/caasi/dom-plan/blob/main/docs/todos.md): planned work.

## License

MIT. See [LICENSE](https://github.com/caasi/dom-plan/blob/main/LICENSE).
