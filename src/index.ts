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

/** Return a Plan to have it run in a microtask after the event, or nothing. */
export type Handler = (e: Event, el: Element) => Plan | void
export type Binding = readonly [event: string, selector: string, handler: Handler]

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

/**
 * Delegates events from `root` to handlers by selector, with jQuery's dispatch rules:
 * every ancestor from the target up to (not including) root is matched, inner first.
 * Returns a function that removes the listeners.
 */
export function mount(root: ParentNode, bindings: readonly Binding[]): () => void {
  const table = bindings.map((b): Binding => [...b])
  for (const [, css] of table) root.querySelector(css) // throw on a bad selector now, not at the first event
  const ac = new AbortController()
  for (const native of new Set(table.map(b => nativeOf(b[0])))) {
    root.addEventListener(
      native,
      e => {
        if (e.type === 'click' && (e as MouseEvent).button >= 1) return
        for (
          let n = e.target as Node | null;
          n && n !== root && !e.cancelBubble;
          n = n.parentNode
        ) {
          if (n.nodeType !== 1) continue
          const el = n as Element
          if (e.type === 'click' && (el as HTMLButtonElement).disabled === true) continue
          for (const [t, css, h] of table) {
            if (nativeOf(t) !== native || !el.matches(css)) continue
            if (ENTER_LEAVE.has(t)) {
              const rel = (e as MouseEvent).relatedTarget as Node | null
              if (rel && el.contains(rel)) continue
            }
            const p = h(e, el)
            if (p)
              queueMicrotask(() => {
                p.run(root)
              })
          }
        }
      },
      { signal: ac.signal },
    )
  }
  return () => ac.abort()
}
