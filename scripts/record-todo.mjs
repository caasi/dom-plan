import { chromium } from 'playwright'
import { homedir } from 'node:os'
import { readdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const cache = `${homedir()}/.cache/ms-playwright`
const newest = readdirSync(cache)
  .filter(d => /^chromium-\d+$/.test(d))
  .sort((a, b) => +b.slice(9) - +a.slice(9))[0]
const browser = await chromium.launch({
  executablePath: `${cache}/${newest}/chrome-linux64/chrome`,
  slowMo: 250,
})
const context = await browser.newContext({
  viewport: { width: 800, height: 450 },
  recordVideo: { dir: 'screenshots/video', size: { width: 800, height: 450 } },
})
const page = await context.newPage()
await page.goto(pathToFileURL(resolve('examples/todo/index.html')).href)
const pause = ms => page.waitForTimeout(ms)
await pause(800)
for (const t of ['買牛奶', '寫 dom-plan spike', '讀 Fable review']) {
  await page.locator('form.new input').pressSequentially(t, { delay: 60 })
  await page.press('form.new input', 'Enter')
}
await pause(600)
await page.locator('.todos li').nth(1).locator('.toggle').check()
await pause(600)
await page.click('.filters button[data-filter=active]')
await pause(900)
await page.click('.filters button[data-filter=done]')
await pause(900)
await page.click('.filters button[data-filter=all]')
await pause(600)
await page.locator('.todos li').nth(0).locator('.delete').click()
await pause(700)
await page.locator('.todos li .title').nth(1).dblclick()
await page.locator('.todos li.editing .edit').fill('')
await page
  .locator('.todos li.editing .edit')
  .pressSequentially('讀完 Fable 第四輪 review', { delay: 60 })
await page.press('.todos li.editing .edit', 'Enter')
await pause(1200)
const video = page.video()
await context.close()
console.log(await video.path())
await browser.close()
