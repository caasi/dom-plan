# dom-plan

> Note: Claude Opus 5.5 wrote this README with the author (caasi).

A lazy, light-weight DOM operation language with a monadic interface, inspired by jQuery.

A `Plan` is a description of DOM work. To build a plan does not touch the DOM. Only `plan.run(root)` does the work.

```ts
import { Plan } from '@caasi/dom-plan'

const plan = Plan.all('.todo').removeClass('new').addClass('seen') // nothing happens yet
plan.run(document) // now the DOM changes
```

Status: not published to npm yet. The core is about 1 KB with minify and gzip (2,320 bytes minified, 1,020 bytes with gzip, measured with esbuild on 2026-10-05).

## The core idea

- **jQuery-inspired.** Chains, the step model of jQuery's `pushStack`, and the event delegation rules come from jQuery.
- **Monadic.** Selection is a monad over a list of elements. `Plan.from` is `return`, and `flatMap` is bind. A plan is a sequence of steps, and the only value it carries is the set of elements that the current step holds.
- **Lazy.** To build a plan does not touch the DOM. `run` is the only exit. You decide when to leave the lazy part.
- **Light.** One class and one array of steps. DOM behavior is the native behavior. The library does not try to wrap everything.

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
- Effects: `addClass`, `removeClass`, `toggleClass`, `attr`, `removeAttr`, `setText`, `remove`, `append`, and `tap` for anything else.

`run` returns the elements of the last step. A plan with no effects is a plain read:

```ts
const [input] = Plan.all('#name').run(document)
```

### Build elements

`Plan.create(tag)` starts from a new element. `append(child)` runs the child plan once for each target, so each target gets its own copy.

```ts
const item = (text: string) =>
  Plan.create('li').addClass('todo').append(Plan.create('span').addClass('title').setText(text))

Plan.all('ul.todos').append(item('Buy milk')).run(document)
```

### Do two things in order

`also(next)` runs another plan after this one, in the same `run`. `end()` goes back to the previous set, so one chain can change two parts of the same selection.

```ts
Plan.from(button).closest('li').remove().also(Plan.all('.count').setText('…')).run(document)

Plan.all('#forecast').find('.days').setText('').end().find('.place').setText('Taipei').run(document)
```

### Events

`mount(root, bindings)` delegates events from `root` with the rules of jQuery. A handler can return a plan. `mount` runs that plan in a microtask, with `root` as the root. `mount` returns a function that removes the listeners.

```ts
import { Plan, mount } from '@caasi/dom-plan'

const unmount = mount(document.querySelector('.todoapp')!, [
  ['click', '.delete', (_e, btn) => Plan.from(btn).closest('li').remove()],
  [
    'change',
    '.toggle',
    (_e, box) =>
      Plan.from(box)
        .closest('li')
        .toggleClass('done', (box as HTMLInputElement).checked),
  ],
])
```

### Asynchronous work

dom-plan does not wrap promises. Build a plan when the data arrives, and run it. To ignore a stale response, keep a request id in the DOM and guard with `filter`. See section 6 of [the design record](docs/000-design.md).

## Things to know

- A plan that is never run does nothing, and TypeScript does not report it.
- dom-plan does not prevent effects inside handlers or `tap`. It is better to write the DOM in `tap`, so that all changes happen in `run`.
- `Plan.from(el)` selects `el` also after `el` is removed. Add `filter(el => el.isConnected)` to skip it.
- Effects keep the native behavior: `addClass('a b')` throws, and `append` moves a node that is already in the document.
- The differences from jQuery are listed in section 9 of [the design record](docs/000-design.md).

## Examples

`examples/` has a todo app, a weather app (Open-Meteo), and browser checks. To build them and run them in Chromium with Playwright:

```sh
npm install
npm run e2e
```

The weather checks need the network.

## Development

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm test`          | Unit checks with jsdom (31 checks, about 1 s) |
| `npm run typecheck` | `tsc` with `noEmit`                           |
| `npm run lint`      | oxlint                                        |
| `npm run format`    | prettier, writes the files                    |
| `npm run check`     | typecheck, lint, prettier check, and tests    |
| `npm run build`     | writes `dist/`                                |
| `npm run e2e`       | browser checks with Playwright (21 checks)    |

## Documents

- [AGENTS.md](AGENTS.md): rules for coding agents that use or change dom-plan.
- [docs/000-design.md](docs/000-design.md): the design record, with each decision and its reason.
- [docs/known-issues.md](docs/known-issues.md): known limits and facts that are not verified.
- [docs/todos.md](docs/todos.md): planned work.

## License

MIT. See [LICENSE](LICENSE).
