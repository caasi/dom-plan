/**
 * dom-plan: a lazy, monadic, jQuery-inspired layer for the DOM.
 *
 * A `Plan` is a description. Building one never touches the DOM.
 * Nothing happens until you call `plan.run(root)`.
 */

type Step =
  | { readonly k: 'q'; readonly f: (els: Element[], root: ParentNode) => Element[] }
  | { readonly k: 'fx'; readonly fx: (el: Element) => void }
  | { readonly k: 'end' }

const docOrder = (a: Element, b: Element) =>
  a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1

// Dedupe and document order after every select step (jQuery uniqueSort).
const uniqSorted = (els: Element[]) => [...new Set(els)].sort(docOrder)

function exec(steps: readonly Step[], root: ParentNode): Element[] {
  let els: Element[] = []
  const prev: Element[][] = [] // jQuery's prevObject chain, as a stack
  for (const s of steps) {
    if (s.k === 'q') {
      prev.push(els)
      els = uniqSorted(s.f(els, root))
    } else if (s.k === 'fx') for (const el of els) s.fx(el)
    else els = prev.pop() ?? []
  }
  return els
}

/**
 * A lazy plan of DOM work: select elements, describe effects, or build new elements.
 *
 * - Every method returns a new Plan. Nothing touches the DOM until `run(root)`.
 * - A plan is a sequence of steps. The only value it carries is the held set of elements.
 *   Select steps (`flatMap`, `find`, `filter`, `closest`, `first`, `add`) start from the set that
 *   the previous step held, like jQuery's chain, and read the live DOM. Effects act on the current
 *   set, so a later select step sees their changes.
 * - `end()` goes back to the previous set (jQuery `.end`). `also(next)` runs another plan after
 *   this one.
 * - A Plan is a query, not a result: calling `run` twice selects again and repeats the effects.
 *
 * @example
 * Plan.all('.a').removeClass('a').addClass('b').run(document)
 */
export class Plan {
  private constructor(private readonly steps: readonly Step[]) {}

  // Not named `then`: a `then` method makes every Plan a thenable, and `await plan` never settles.
  // ponytail: copies the steps on each call, so a chain of k steps costs O(k^2) to build (1000 chained
  // `on` calls took about 14 ms in jsdom). If that ever matters, keep the steps as a persistent list.
  private step(s: Step) {
    return new Plan([...this.steps, s])
  }

  /** Starts from `root.querySelectorAll(css)` at run time. */
  static all = (css: string) => new Plan([{ k: 'q', f: (_, r) => [...r.querySelectorAll(css)] }])

  /** Starts from `el`, wherever it is. This is the `return` of the selection monad. */
  static from = (el: Element) => new Plan([{ k: 'q', f: () => [el] }])

  /** Starts from a new, detached element. Each `run` creates a new one. */
  static create = (tag: string) =>
    new Plan([{ k: 'q', f: (_, r) => [(r.ownerDocument ?? (r as Document)).createElement(tag)] }])

  /** Selects nothing. Effects after it never run. */
  static none = new Plan([{ k: 'q', f: () => [] }])

  flatMap(f: (el: Element) => Element[]) {
    return this.step({ k: 'q', f: els => els.flatMap(f) })
  }
  find(css: string) {
    return this.flatMap(el => [...el.querySelectorAll(css)])
  }
  filter(p: (el: Element) => boolean) {
    return this.flatMap(el => (p(el) ? [el] : []))
  }
  closest(css: string) {
    return this.flatMap(el => {
      const c = el.closest(css)
      return c ? [c] : []
    })
  }
  first() {
    return this.step({ k: 'q', f: els => els.slice(0, 1) })
  }

  /** Adds `root.querySelectorAll(css)` to the held set (jQuery `.add` with a selector). */
  add(css: string) {
    return this.step({ k: 'q', f: (els, r) => [...els, ...r.querySelectorAll(css)] })
  }

  /** Goes back to the set held before the last select step (jQuery `.end`). */
  end() {
    return this.step({ k: 'end' })
  }

  /**
   * Runs `next` after this plan, in the same `run`, and returns `next`'s elements. Every Plan
   * begins with a starting point (the constructor is private), so `next` does not start from this
   * plan's set. The steps are concatenated, so an `end()` after `also` can go back into this plan.
   * jQuery needs no such operator because it runs each line at once.
   */
  also(next: Plan) {
    return new Plan([...this.steps, ...next.steps])
  }

  /** Adds an effect: at run time, `fx` is called once for each held element. */
  tap(fx: (el: Element) => void) {
    return this.step({ k: 'fx', fx })
  }
  addClass(c: string) {
    return this.tap(el => el.classList.add(c))
  }
  removeClass(c: string) {
    return this.tap(el => el.classList.remove(c))
  }
  toggleClass(c: string, force?: boolean) {
    return this.tap(el => el.classList.toggle(c, force))
  }
  attr(n: string, v: string) {
    return this.tap(el => el.setAttribute(n, v))
  }
  removeAttr(n: string) {
    return this.tap(el => el.removeAttribute(n))
  }
  setText(t: string) {
    return this.tap(el => {
      el.textContent = t
    })
  }
  remove() {
    return this.tap(el => el.remove())
  }

  /**
   * Binds an event on each held element, like jQuery's `.on`. With a selector, the binding is
   * delegated to descendants that match; without one, it is bound to the element itself. Binding
   * happens at `run`, like every effect, so running the plan twice binds twice.
   */
  on(event: string, handler: Handler): Plan
  on(event: string, selector: string, handler: Handler): Plan
  on(event: string, a: string | Handler, b?: Handler) {
    const binding: Binding = typeof a === 'string' ? [event, a, b!] : [event, null, a]
    return this.tap(el => {
      if (binding[1] !== null) el.querySelector(binding[1]) // throw on a bad selector before binding
      bind(el, binding)
    })
  }

  /**
   * Removes bindings from each held element, like jQuery's `.off`: all of them; or those of `event`;
   * or those of `event` with this `selector`, this `handler`, or both. An omitted trailing argument matches any.
   */
  off(): Plan
  off(event: string, handler?: Handler): Plan
  off(event: string, selector: string, handler?: Handler): Plan
  off(event?: string, a?: string | Handler, b?: Handler) {
    const [selector, handler] = typeof a === 'function' ? [undefined, a] : [a, b]
    return this.tap(el =>
      unbind(
        el,
        ([t, css, h]) =>
          (event === undefined || t === event) &&
          (selector === undefined || css === selector) &&
          (handler === undefined || h === handler),
      ),
    )
  }

  /**
   * For each held element, runs `child` with that element as root and appends what it returns
   * (native `Element.append`: a node already in the document is moved).
   */
  append(child: Plan) {
    return this.tap(el => el.append(...child.run(el)))
  }

  /** The only exit: runs every step against `root` and returns the elements of the last step. */
  run(root: ParentNode): Element[] {
    return exec(this.steps, root)
  }
}

/** Return a Plan to have it run in a microtask after the event, with the bound element as root. */
export type Handler = (e: Event, el: Element) => Plan | void
// selector null: a direct binding on the element itself; a string: delegated to its descendants.
type Binding = readonly [event: string, selector: string | null, handler: Handler]

const DELEGATE: Record<string, string> = {
  focus: 'focusin',
  blur: 'focusout',
  mouseenter: 'mouseover',
  mouseleave: 'mouseout',
  pointerenter: 'pointerover',
  pointerleave: 'pointerout',
}
const ENTER_LEAVE = new Set(['mouseenter', 'mouseleave', 'pointerenter', 'pointerleave'])
const nativeOf = (t: string) => DELEGATE[t] ?? t
// Only delegation needs the bubbling twin; a direct binding listens to its own event type.
const listenType = (b: Binding) => (b[1] === null ? b[0] : nativeOf(b[0]))

// Each element that `on` ran on keeps its own table. The listener of a type reads the table at
// dispatch time, so `off` takes effect at once.
type Bound = { table: Binding[]; listeners: Map<string, (e: Event) => void> }
const registry = new WeakMap<Element, Bound>()

function bind(host: Element, b: Binding) {
  let r = registry.get(host)
  if (!r) registry.set(host, (r = { table: [], listeners: new Map() }))
  r.table.push(b)
  const type = listenType(b)
  if (!r.listeners.has(type)) {
    const bound = r
    const fn = (e: Event) => dispatch(host, bound, type, e)
    r.listeners.set(type, fn)
    host.addEventListener(type, fn)
  }
}

function unbind(host: Element, remove: (b: Binding) => boolean) {
  const r = registry.get(host)
  if (!r) return
  r.table = r.table.filter(b => !remove(b))
  for (const [type, fn] of r.listeners)
    if (!r.table.some(b => listenType(b) === type)) {
      host.removeEventListener(type, fn)
      r.listeners.delete(type)
    }
}

// The relatedTarget is inside el: the pointer moved within el, so this is not an enter or a leave.
const within = (e: Event, el: Element) => {
  const rel = (e as MouseEvent).relatedTarget as Node | null
  return !!rel && el.contains(rel)
}

// jQuery's dispatch: build the whole handler queue first, then call it, so that a handler that
// changes the DOM does not change who is called for this event. Delegated bindings match the
// ancestors from the target up to the host (not the host), inner first, and skip non-primary
// clicks and disabled elements. Direct bindings (selector null) run last, on the host, unfiltered.
function dispatch(host: Element, r: Bound, type: string, e: Event) {
  const table = r.table.filter(b => listenType(b) === type) // on and off apply from the next event
  const queue: [Element, Handler[]][] = []
  const delegated = table.filter(b => b[1] !== null)
  if (delegated.length && !(e.type === 'click' && (e as MouseEvent).button >= 1))
    for (let n = e.target as Node | null; n && n !== host && host.contains(n); n = n.parentNode) {
      if (n.nodeType !== 1) continue
      const el = n as Element
      if (e.type === 'click' && (el as HTMLButtonElement).disabled === true) continue
      const hs = delegated
        .filter(([t, css]) => el.matches(css!) && !(ENTER_LEAVE.has(t) && within(e, el)))
        .map(b => b[2])
      if (hs.length) queue.push([el, hs])
    }
  const direct = table.filter(b => b[1] === null).map(b => b[2])
  if (direct.length) queue.push([host, direct])
  for (const [el, hs] of queue) {
    if (e.cancelBubble) break // stopPropagation stops the outer levels, as in jQuery
    for (const h of hs) {
      const p = h(e, el)
      if (p)
        queueMicrotask(() => {
          p.run(host)
        })
    }
  }
}
