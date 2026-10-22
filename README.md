# dom-plan

A small, lazy DOM library in the style of jQuery. You describe the DOM work first, and run it later.

A `Plan` is a description of DOM work. To build a plan does not touch the DOM. Only `plan.run(root)` does the work. `root` is where `Plan.all` searches, usually `document`.

```js
import { Plan } from '@caasi/dom-plan'

const plan = Plan.all('.todo').removeClass('new').addClass('seen') // nothing happens yet
plan.run(document) // now the DOM changes
```

## Install and load

```sh
npm install @caasi/dom-plan
```

`dist/index.js` is one ES module with no imports. Without an import map, a page cannot import the bare name `@caasi/dom-plan`. Choose one way:

- Bundle `app.js`: `npx esbuild app.js --bundle --format=iife --outfile=bundle.js`. Load the result as a classic script: `<script src="bundle.js"></script>`. The page also opens from a `file://` URL.
- Load `app.js` as a module: `<script type="module" src="app.js"></script>`. In `app.js`, import the file by its path: `import { Plan } from './node_modules/@caasi/dom-plan/dist/index.js'`. This needs an HTTP server that serves `.js` with a JavaScript MIME type, for example `text/javascript`. Chromium blocks a module script on a `file://` page.

## The API

| Kind            | Members                                                                                                                                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Starting points | `Plan.all(css)`, `Plan.from(el)`, `Plan.create(tag)`, and `Plan.none`. `Plan.none` is a plan, not a function: write `Plan.none`, not `Plan.none()`.                                                                                                       |
| Select steps    | `find(css)`, `filter(fn)`, `closest(css)`, `first()`, `add(css)`, `flatMap(fn)`, where `fn` returns an array of elements. Each step starts from the elements that the step before it held. `end()` goes back to the set held before the last select step. |
| Effects         | `addClass`, `removeClass`, `toggleClass`, `attr`, `removeAttr`, `setText`, `remove`, `append`, `on`, `off`, and `tap(fn)` for anything else.                                                                                                              |
| Order           | `a.also(b)` runs plan `b` after plan `a`, in the same `run`. `b` is a plan, not a function.                                                                                                                                                               |
| Exit            | `run(root)` does the work and returns the elements that the plan holds at the end.                                                                                                                                                                        |

There is no other method. A select step reads the live DOM, so it sees the changes of earlier effects.

## Three facts

1. A plan does nothing until you call `run(root)`. Every method except `run` returns a new plan and leaves the old one as it is. A plan is not an element. To reach the elements, run the plan, or use the element that `tap` gives you.
2. The arguments of a method are fixed when you build the plan. To use a value from run time, read it inside `tap`.
3. A handler of `on` can return a plan, or nothing. dom-plan runs a returned plan in a microtask, with the bound element as root, so do not call `run` on it. In that plan, `Plan.all` searches only inside the bound element. The recommendation is to bind on a container that holds every element that the handler changes.

## A complete example

A todo list. The state is the DOM: a done item has the class `done`, and the count plan reads the list at run time. There is no array of items and no `render`.

```html
<div class="todoapp">
  <form><input type="text" placeholder="What needs to be done?" /><button>Add</button></form>
  <ul class="todos"></ul>
  <p class="count"></p>
</div>
<script src="bundle.js"></script>
```

```js
import { Plan } from '@caasi/dom-plan'

const item = text =>
  Plan.create('li')
    .append(Plan.create('input').attr('type', 'checkbox').addClass('toggle'))
    .append(Plan.create('span').addClass('title').setText(text))
    .append(Plan.create('button').addClass('delete').setText('Delete'))

// The count is read inside tap, at run time, so every handler can reuse this one plan.
const count = Plan.all('.count').tap(el => {
  const n = el.closest('.todoapp').querySelectorAll('li:not(.done)').length
  el.textContent = n === 1 ? '1 item left' : `${n} items left`
})

const add = (e, form) => {
  e.preventDefault()
  const input = form.querySelector('input')
  const text = input.value.trim()
  if (!text) return
  return Plan.all('.todos')
    .append(item(text))
    .also(Plan.from(input).tap(el => (el.value = '')))
    .also(count)
}

const toggle = (_e, box) =>
  Plan.from(box).closest('li').toggleClass('done', box.checked).also(count)

const remove = (_e, btn) => Plan.from(btn).closest('li').remove().also(count)

Plan.all('.todoapp')
  .on('submit', 'form', add)
  .on('change', '.toggle', toggle)
  .on('click', '.delete', remove)
  .also(count)
  .run(document)
```

The handlers return plans, and dom-plan runs them with `.todoapp` as root. So `Plan.all('.todos')` in `add` searches inside `.todoapp`. `Plan.all` never selects the bound element itself: to change it, start with `Plan.from(e.currentTarget as Element)` (in JavaScript, leave out the cast).

## Things to know

- Inside `tap`, use the native DOM API: `tap(li => li.remove())`. A plan that you build inside `tap` does nothing, because nothing runs it. dom-plan ignores the return value of `tap`.
- `attr` sets an attribute, not a property. To set `value` or `checked`, set the property inside `tap`: `tap(el => (el.value = ''))`.
- `closest` and `Plan.from(el)` can select elements outside the root. `find` and `Plan.all` search only inside it.
- After `remove()`, the plan still holds the removed elements. To change other elements, continue with `also`.
- There are no getters. To read a value, run a plan with no effects (`const [input] = Plan.all('#name').run(document)`), or read it inside `tap`.
- If a select step matches nothing, the later effects do nothing, and there is no error.
- Effects keep the native behavior: `addClass('a b')` throws, and `append` moves a node that is already in the document.

## Events

`plan.on(event, selector, handler)` delegates an event from each held element, with the rules of jQuery. `plan.on(event, handler)` binds to the element itself. Like every effect, it binds at `run`, so a plan with `on` that runs twice binds twice. `plan.off` works like jQuery's `.off`. Event namespaces, space-separated event lists and the event map are not supported.

## More

- [AGENTS.md](https://github.com/caasi/dom-plan/blob/main/AGENTS.md), also in the installed package: all rules, the event details, asynchronous work, the differences from jQuery, and tests.
- [docs/000-design.md](https://github.com/caasi/dom-plan/blob/main/docs/000-design.md): the design record, with each decision and its reason.
- `examples/` in the repository: a todo app and a weather app, with browser checks (`npm run e2e`).

The core is about 1 KB, minified and gzipped. MIT license, see [LICENSE](https://github.com/caasi/dom-plan/blob/main/LICENSE).

> Note: Claude Opus 5.5 wrote this README with the author (caasi). Claude Fable 5.1 added the sections for agents in 0.1.1, and Claude Opus 5.5 made it shorter in 0.1.2.
