import { chromium } from 'playwright'
import { build } from 'esbuild'
import { homedir } from 'node:os'
import { readdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

// The cached chromium revision may not match this Playwright version; use the newest one cached.
const cache = `${homedir()}/.cache/ms-playwright`
const newest = readdirSync(cache)
  .filter(d => /^chromium-\d+$/.test(d))
  .sort((a, b) => +b.slice(9) - +a.slice(9))[0]
const executablePath = process.env.CHROME ?? `${cache}/${newest}/chrome-linux64/chrome`

for (const name of ['todo', 'weather', 'browser-checks']) {
  await build({
    entryPoints: [`examples/${name}/app.ts`],
    bundle: true,
    format: 'iife',
    outfile: `examples/${name}/bundle.js`,
    logLevel: 'warning',
  }).catch(() => {})
}

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
const url = name => pathToFileURL(resolve(`examples/${name}/index.html`)).href
// A FAIL must make the script exit non-zero, so that CI and other callers can see it.
let failed = 0
const ok = (cond, msg) => {
  if (!cond) failed++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`)
}

// --- todo ---
await page.goto(url('todo'))
for (const t of ['buy milk', 'write spike', 'read review']) {
  await page.fill('form.new input', t)
  await page.press('form.new input', 'Enter')
}
ok((await page.locator('.todos li').count()) === 3, 'todo: add 3 items')
ok((await page.inputValue('form.new input')) === '', 'todo: input cleared after add')
ok((await page.textContent('.count')) === '3', 'todo: count 3')
await page.locator('.todos li').nth(1).locator('.toggle').check()
ok((await page.locator('.todos li.done').count()) === 1, 'todo: toggle marks done')
ok((await page.textContent('.count')) === '2', 'todo: count 2 after toggle')
await page.click('.filters button[data-filter=active]')
ok((await page.locator('.todos li:visible').count()) === 2, 'todo: active filter shows 2')
await page.click('.filters button[data-filter=done]')
ok((await page.locator('.todos li:visible').count()) === 1, 'todo: done filter shows 1')
await page.click('.filters button[data-filter=all]')
await page.locator('.todos li').nth(0).locator('.delete').click()
ok((await page.locator('.todos li').count()) === 2, 'todo: delete removes item')
ok((await page.textContent('.count')) === '1', 'todo: count after delete (or ordering)')
await page.locator('.todos li .title').nth(0).dblclick()
ok(
  await page
    .locator('.todos li')
    .nth(0)
    .locator('.edit')
    .evaluate(el => el === document.activeElement),
  'todo: dblclick focuses edit input',
)
await page.fill('.todos li.editing .edit', 'write the spike')
await page.press('.todos li.editing .edit', 'Enter')
ok(
  (await page.textContent('.todos li .title')) === 'write the spike',
  'todo: edit commits on Enter',
)
await page.screenshot({ path: 'screenshots/todo.png' })

// --- browser checks ---
await page.goto(url('browser-checks'))
await page.click('#i1')
await page.click('#p')
await page.evaluate(() => document.activeElement.blur())
await page.evaluate(() => window.focusFromTap())
await page.waitForTimeout(50)
const log = await page.evaluate(() => window.log)
console.log('browser log:', JSON.stringify(log))
ok(
  log.indexOf('focusin:input type=focusin') !== -1 &&
    log.indexOf('focusin:input type=focusin') < log.indexOf('focus:field'),
  'R19: focus mapped to focusin, inner first, e.type is focusin',
)
ok(
  log.some(l => l.startsWith('tap currentTarget is root: true')),
  'R28: real click, currentTarget in tap is still root',
)
const s = log.indexOf('run start'),
  e = log.indexOf('run end')
ok(
  log.slice(s, e).some(l => l.startsWith('focusin')),
  'R31: focus() inside run calls the handler synchronously',
)

// --- weather (built later) ---
if (process.argv.includes('--weather')) {
  await page.goto(url('weather'))
  await page.fill('form input', 'Taipei')
  await page.press('form input', 'Enter')
  await page.waitForSelector('#forecast li', { timeout: 15000 }).catch(() => {})
  ok((await page.locator('#forecast li').count()) > 0, 'weather: forecast rendered')
  ok(
    !(await page.locator('#forecast').evaluate(el => el.classList.contains('loading'))),
    'weather: loading cleared',
  )
  ok((await page.textContent('#forecast .place'))?.includes('Taiwan'), 'weather: place shown')
  await page.screenshot({ path: 'screenshots/weather.png' })

  // race: the first request (Taipei) is held back; the second (Tokyo) answers first.
  let release
  const held = new Promise(r => (release = r))
  // a predicate, not a glob: in Playwright globs `?` matches one character
  await page.route(
    u => u.href.includes('/v1/search') && u.href.includes('name=Taipei'),
    async route => {
      await held
      await route.continue()
    },
  )
  await page.fill('form input', 'Taipei')
  await page.press('form input', 'Enter')
  await page.fill('form input', 'Tokyo')
  await page.press('form input', 'Enter')
  await page
    .waitForFunction(
      () => document.querySelector('#forecast .place')?.textContent?.includes('Japan'),
      null,
      { timeout: 15000 },
    )
    .catch(() => {})
  release()
  await page.waitForTimeout(3000)
  ok(
    (await page.textContent('#forecast .place'))?.includes('Japan'),
    'weather race: stale Taipei response ignored',
  )

  // error path: an unknown place
  await page.fill('form input', 'zzzzqqqqxxxx')
  await page.press('form input', 'Enter')
  await page
    .waitForFunction(() => document.querySelector('#forecast')?.classList.contains('error'), null, {
      timeout: 15000,
    })
    .catch(() => {})
  ok(
    await page
      .locator('#forecast')
      .evaluate(el => el.classList.contains('error') && !el.classList.contains('loading')),
    'weather: error state',
  )
  ok(
    !(await page.locator('#forecast .days').isVisible()),
    'weather: stale forecast hidden on error',
  )
  await page.screenshot({ path: 'screenshots/weather-error.png' })
}

ok(errors.length === 0, `no page errors ${errors.join(' | ')}`)
await browser.close()
if (failed) {
  console.log(`${failed} check(s) failed`)
  process.exitCode = 1
}
