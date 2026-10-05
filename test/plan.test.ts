import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><body></body>')
const g = globalThis as any
for (const k of [
  'window',
  'document',
  'Node',
  'Element',
  'HTMLElement',
  'Event',
  'MouseEvent',
  'CustomEvent',
  'AbortController',
])
  g[k] = (dom.window as any)[k]

const { Plan } = await import('../src/index.ts')
type Binding = import('../src/index.ts').Binding

// Binds through on(), and returns an unbind that goes through off().
const bindOn = (host: Element, bindings: readonly Binding[]) => {
  Plan.from(host).on(bindings).run(host)
  return () => void Plan.from(host).off().run(host)
}

const FIXTURE = '<div id=c2><div id=c1><span></span></div><span></span><p></p><input></div>'

function fixture(html = FIXTURE) {
  document.body.innerHTML = `<section id=root>${html}</section>`
  return document.getElementById('root')!
}
const $ = (css: string) => document.querySelector(css)!
// deepEqual compares DOM elements by structure, so [c1, c2] equals [c2, c1]. Compare identity.
function same(actual: readonly Element[], expected: readonly Element[]) {
  assert.equal(actual.length, expected.length, 'length')
  actual.forEach((el, i) => assert.equal(el, expected[i], `index ${i}`))
}
const click = (el: Element, init: MouseEventInit = {}) =>
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, ...init }))
const tick = () => new Promise<void>(r => queueMicrotask(r))

// --- step model and selection ---

test('R1 nothing happens before run', () => {
  const root = fixture()
  const plan = Plan.all('p').addClass('x')
  assert.equal($('p').className, '')
  plan.run(root)
  assert.equal($('p').className, 'x')
})

test('R2 same step: removeClass then addClass act on the same held set', () => {
  const root = fixture('<p class=a></p><p class=a></p>')
  Plan.all('.a').removeClass('a').addClass('b').run(root)
  assert.deepEqual(
    [...root.querySelectorAll('p')].map(p => p.className),
    ['b', 'b'],
  )
})

test('R3 cross step: find starts from the held set, not from root', () => {
  const root = fixture('<div class=a><i class=err>x</i></div><div><i class=err>y</i></div>')
  Plan.all('.a').removeClass('a').find('.err').setText('').run(root)
  assert.deepEqual(
    [...root.querySelectorAll('.err')].map(e => e.textContent),
    ['', 'y'],
  )
})

test('R4 effects act on the current set', () => {
  const root = fixture()
  Plan.all('div').addClass('a').find('span').addClass('b').run(root)
  for (const d of root.querySelectorAll('div')) assert.equal(d.className, 'a')
  for (const s of root.querySelectorAll('span')) assert.equal(s.className, 'b')
})

test('R5 run returns the last step; remove returns the removed elements', () => {
  const root = fixture()
  const p = $('p')
  same(Plan.all('div').find('p').run(root), [p])
  same(Plan.all('p').remove().run(root), [p])
  assert.equal(p.isConnected, false)
})

test('R6 dedupe and document order', () => {
  const root = fixture()
  same(Plan.all('span, p').closest('div').run(root), [$('#c2'), $('#c1')])
})

test('R7 add matches the engine order', () => {
  const root = fixture()
  same(Plan.all('span').add('div').run(root), [...root.querySelectorAll('div, span')])
})
test('R8 end goes back to the previous set; a guard stays in force across end', () => {
  const root = fixture('<section class=f data-req=1><ul></ul><h2></h2></section>')
  const f = $('.f')
  same(Plan.all('.f').find('ul').end().run(root), [f])
  same(Plan.all('.f').end().run(root), [])

  const guarded = (id: string) =>
    Plan.all('.f').filter(el => (el as HTMLElement).dataset.req === id)
  guarded('2').find('ul').setText('x').end().find('h2').setText('y').run(root)
  assert.equal(f.textContent, '', 'stale guard: neither branch runs')
  guarded('1').find('ul').setText('x').end().find('h2').setText('y').run(root)
  assert.equal(f.textContent, 'xy', 'live guard: both branches run')
})
test('R9 running a plan twice repeats the effects', () => {
  const root = fixture('<p></p>')
  const t = Plan.all('p').toggleClass('on')
  t.run(root)
  t.run(root)
  assert.equal($('p').classList.contains('on'), false)
})

test('R10 from(el) is return: it selects el wherever el is', () => {
  const root = fixture()
  const outside = document.createElement('p')
  document.body.append(outside)
  same(Plan.from(outside).addClass('x').run(root), [outside])
  assert.equal(outside.className, 'x')
  same(Plan.from(root).run(root), [root])
})
test('R11 empty set: tap not called; first of empty', () => {
  const root = fixture()
  let called = false
  Plan.all('.none')
    .tap(() => (called = true))
    .run(root)
  assert.equal(called, false)
  same(Plan.all('.none').first().run(root), [])
})

test('R12 append builds a fresh copy per target; create run alone gives a detached element', () => {
  const root = fixture('<ul></ul><ul></ul>')
  const item = Plan.create('li').addClass('todo').append(Plan.create('span').setText('hi'))
  Plan.all('ul').append(item).run(root)
  const lis = [...root.querySelectorAll('li')]
  assert.equal(lis.length, 2)
  assert.notEqual(lis[0], lis[1])
  assert.equal(lis[0].outerHTML, '<li class="todo"><span>hi</span></li>')

  const [li] = item.run(document)
  assert.equal(li.isConnected, false)

  fixture('<ul></ul>')
  Plan.all('ul')
    .append(Plan.create('li').append(Plan.create('b')).find('b'))
    .run(document)
  assert.equal($('ul').innerHTML, '<b></b>', 'child ending in a select step attaches that set')
})

test('R13 invalid selector: no throw at build, SyntaxError at run, later steps skipped', () => {
  const root = fixture('<p></p>')
  const plan = Plan.all('p').addClass('x').find('p[').addClass('y')
  assert.throws(
    () => plan.run(root),
    (err: any) => err.name === 'SyntaxError',
  )
  assert.equal($('p').className, 'x')
})

test('R14 a Plan is not a thenable', async () => {
  const p = Plan.all('p')
  const q = await Promise.resolve(p)
  assert.equal(q, p)
})

test('R16 addClass with a space throws at run (native behaviour)', () => {
  const root = fixture('<p></p>')
  assert.throws(
    () => Plan.all('p').addClass('a b').run(root),
    (err: any) => err.name === 'InvalidCharacterError',
  )
})

test('R29 also: effects of this run before effects of next; run returns next', () => {
  const root = fixture('<p></p><i></i>')
  const log: string[] = []
  const out = Plan.all('p')
    .tap(() => log.push('a'))
    .also(Plan.all('i').tap(() => log.push('b')))
    .run(root)
  assert.deepEqual(log, ['a', 'b'])
  same(out, [$('i')])
})
test('R30 append(from(el)) moves el to a new parent (native append)', () => {
  const root = fixture('<ul id=a><li>x</li></ul><ul id=b></ul>')
  const li = $('#a li')
  Plan.all('#b').append(Plan.from(li)).run(root)
  assert.equal($('#a').children.length, 0)
  assert.equal(li.parentElement, $('#b'))
})

test('R33 end after also goes back into the first plan (steps are concatenated)', () => {
  const root = fixture('<p></p><i></i>')
  same(Plan.all('p').also(Plan.all('i')).end().run(root), [$('p')])
})

test('R34 left identity: from(x).flatMap(f) selects f(x), deduplicated in document order', () => {
  const root = fixture()
  const outside = document.createElement('div')
  outside.innerHTML = '<b></b><i></i>'
  document.body.append(outside)
  const [b, i] = [...outside.children]
  // x is outside the root, and f returns duplicates in reverse order
  same(
    Plan.from(outside)
      .flatMap(() => [i, b, i])
      .run(root),
    [b, i],
  )
})

test('R35 from(el) still selects el after el.remove(); guard with isConnected', () => {
  const root = fixture('<p></p>')
  const p = $('p')
  p.remove()
  same(Plan.from(p).run(root), [p])
  same(
    Plan.from(p)
      .filter(el => el.isConnected)
      .run(root),
    [],
  )
})

// --- delegation ---

test('R17 delegation reaches elements added after on; plan runs after dispatch', async () => {
  const root = fixture('<ul></ul>')
  const off = bindOn(root, [['click', 'button', (_e, el) => Plan.from(el).addClass('hit')]])
  const b = document.createElement('button')
  $('ul').append(b)
  b.click()
  assert.equal(b.className, '')
  await tick()
  assert.equal(b.className, 'hit')
  off()
})

test('R18 inner first; same element by binding order; stopPropagation stops outer', () => {
  const root = fixture('<div class=outer><div class="inner both"><i></i></div></div>')
  const log: string[] = []
  const off = bindOn(root, [
    ['click', '.outer', () => void log.push('outer')],
    ['click', '.inner', () => void log.push('inner')],
    ['click', '.both', () => void log.push('both')],
  ])
  click($('i'))
  assert.deepEqual(log, ['inner', 'both', 'outer'])
  off()

  log.length = 0
  const off2 = bindOn(root, [
    ['click', '.outer', () => void log.push('outer')],
    ['click', '.inner', e => void (log.push('inner'), e.stopPropagation())],
  ])
  click($('i'))
  assert.deepEqual(log, ['inner'])
  off2()
})

test('R20 a delegated binding never matches the host; a direct binding (null) does', () => {
  const root = fixture('<p></p>')
  const log: string[] = []
  const off = bindOn(root, [
    ['click', 'section', () => void log.push('delegated section')],
    ['click', null, () => void log.push('direct')],
    ['click', 'p', () => void log.push('p')],
  ])
  click($('p'))
  assert.deepEqual(log, ['p', 'direct'], 'delegated inner first, direct on the host last')
  log.length = 0
  click(root)
  assert.deepEqual(log, ['direct'], 'a click on the host itself reaches only the direct binding')
  off()
})

test('R21 stopImmediatePropagation: same level runs, outer stops', () => {
  const root = fixture('<div class=outer><b class=x></b></div>')
  const log: string[] = []
  const off = bindOn(root, [
    ['click', '.x', e => void (log.push('1'), e.stopImmediatePropagation())],
    ['click', '.x', () => void log.push('2')],
    ['click', '.outer', () => void log.push('outer')],
  ])
  click($('.x'))
  assert.deepEqual(log, ['1', '2'])
  off()
})

test('R22 currentTarget: root in handler, null in tap after synthetic dispatch', async () => {
  const root = fixture('<p></p>')
  let inHandler: unknown,
    inTap: unknown = 'unset'
  const off = bindOn(root, [
    [
      'click',
      'p',
      (e, el) => {
        inHandler = e.currentTarget
        return Plan.from(el).tap(() => (inTap = e.currentTarget))
      },
    ],
  ])
  click($('p'))
  await tick()
  assert.equal(inHandler, root)
  assert.equal(inTap, null)
  off()
})

test('R23 disabled button: ancestor still reached; non-primary click ignored', () => {
  const root = fixture('<div class=box><button disabled>x</button></div>')
  const log: string[] = []
  const off = bindOn(root, [
    ['click', 'button', () => void log.push('button')],
    ['click', '.box', () => void log.push('box')],
  ])
  click($('button'))
  assert.deepEqual(log, ['box'])
  log.length = 0
  click($('.box'), { button: 2 })
  assert.equal(log.length, 0)
  off()
})

test('R24 mouseenter emulation via mouseover + relatedTarget', () => {
  const root = fixture('<div class=box><i class=a></i><i class=b></i></div><p class=out></p>')
  let n = 0
  const off = bindOn(root, [['mouseenter', '.box', () => void n++]])
  const over = (target: Element, related: Element | null) =>
    target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: related }))
  over($('.b'), $('.a'))
  assert.equal(n, 0, 'child to child')
  over($('.a'), $('.out'))
  assert.equal(n, 1, 'from outside')
  over($('.a'), null)
  assert.equal(n, 2, 'relatedTarget null')
  off()
})

test('R25 preventDefault in handler keeps checkbox unchecked', () => {
  const root = fixture('<input type=checkbox>')
  const off = bindOn(root, [['click', 'input', e => void e.preventDefault()]])
  const cb = $('input') as HTMLInputElement
  cb.click()
  assert.equal(cb.checked, false)
  off()
})

test('R26 D22: no merging; a throwing plan does not stop the next', async () => {
  const root = fixture('<div class=o><ul class=i><li></li></ul></div>')
  let n = 0
  const base = Plan.all('ul').tap(() => n++)
  const off = bindOn(root, [
    ['click', '.i', () => base.find('li')],
    ['click', '.o', () => base],
  ])
  click($('li'))
  await tick()
  await tick()
  assert.equal(n, 2, 'shared prefix runs once per handler')
  off()

  const errors: unknown[] = []
  const onErr = (err: unknown) => void errors.push(err)
  // The library throws inside a microtask by design (D22); take over the runner's handler for this check.
  const saved = process.listeners('uncaughtException')
  process.removeAllListeners('uncaughtException')
  process.on('uncaughtException', onErr)
  let ran = false
  const off2 = bindOn(root, [
    ['click', '.i', () => Plan.all('p[')],
    ['click', '.o', () => Plan.all('ul').tap(() => (ran = true))],
  ])
  click($('li'))
  await new Promise(r => setTimeout(r, 0))
  process.off('uncaughtException', onErr)
  for (const l of saved) process.on('uncaughtException', l)
  assert.equal(ran, true)
  assert.equal(errors.length, 1)
  off2()
})

test('R27 void return schedules nothing; off removes all; bad selector throws at run', async () => {
  const root = fixture('<p></p>')
  let n = 0
  const off = bindOn(root, [['click', 'p', () => void n++]])
  click($('p'))
  off()
  click($('p'))
  assert.equal(n, 1)
  const plan = Plan.from(root).on([['click', '> p', () => {}]])
  assert.throws(
    () => plan.run(root),
    (err: any) => err.name === 'SyntaxError',
  )
})

test('R32 synthetic dispatch, two bindings on one host: both handlers before any plan', async () => {
  const root = fixture('<p></p>')
  const log: string[] = []
  const a = bindOn(root, [
    ['click', 'p', () => (log.push('h1'), Plan.all('p').tap(() => log.push('p1')))],
  ])
  const b = bindOn(root, [
    ['click', 'p', () => (log.push('h2'), Plan.all('p').tap(() => log.push('p2')))],
  ])
  click($('p'))
  await tick()
  await tick()
  assert.deepEqual(log, ['h1', 'h2', 'p1', 'p2'])
  a()
  b()
})

test('R36 on is lazy: nothing is bound before run', () => {
  const root = fixture('<p></p>')
  let n = 0
  const plan = Plan.from(root).on([['click', 'p', () => void n++]])
  click($('p'))
  assert.equal(n, 0)
  plan.run(root)
  click($('p'))
  assert.equal(n, 1)
  Plan.from(root).off().run(root)
})

test('R37 off(bindings) removes only the equal bindings', () => {
  const root = fixture('<p></p>')
  const log: string[] = []
  const a = () => void log.push('a')
  const b = () => void log.push('b')
  Plan.from(root)
    .on([
      ['click', 'p', a],
      ['click', 'p', b],
    ])
    .run(root)
  Plan.from(root)
    .off([['click', 'p', a]])
    .run(root)
  click($('p'))
  assert.deepEqual(log, ['b'])
  Plan.from(root).off().run(root)
})

test('R38 running on twice binds twice; off removes both', () => {
  const root = fixture('<p></p>')
  let n = 0
  const h = () => void n++
  const plan = Plan.from(root).on([['click', 'p', h]])
  plan.run(root)
  plan.run(root)
  click($('p'))
  assert.equal(n, 2)
  Plan.from(root)
    .off([['click', 'p', h]])
    .run(root)
  click($('p'))
  assert.equal(n, 2)
})

test('R39 an aborted signal removes the bindings it came with', () => {
  const root = fixture('<p></p>')
  const log: string[] = []
  const ac = new AbortController()
  Plan.from(root)
    .on([['click', 'p', () => void log.push('signal')]], { signal: ac.signal })
    .run(root)
  Plan.from(root)
    .on([['click', 'p', () => void log.push('kept')]])
    .run(root)
  ac.abort()
  click($('p'))
  assert.deepEqual(log, ['kept'])
  Plan.from(root).off().run(root)
})

test('R40 on binds on each held element; a handler plan runs with that element as root', async () => {
  const root = fixture('<ul id=a><li></li></ul><ul id=b><li></li></ul>')
  Plan.all('ul')
    .on([['click', 'li', () => Plan.all('li').addClass('hit')]])
    .run(root)
  click($('#a li'))
  await tick()
  assert.equal($('#a li').className, 'hit')
  assert.equal($('#b li').className, '', 'the plan ran with #a as root')
  Plan.all('ul').off().run(root)
})
