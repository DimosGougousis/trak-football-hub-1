// Local visual/interaction check. Start Vite first; no account or backend used.
import { chromium, expect } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const base = process.env.KIT_PREVIEW_URL || 'http://127.0.0.1:8086'
const output = process.env.KIT_PREVIEW_OUTPUT || 'test-results/kits'
await mkdir(output, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' })
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
try {
  await page.goto(`${base}/kit-preview.html`)
  await expect(page.getByRole('heading', { name: 'Ready to wear.' })).toBeVisible()
  await page.screenshot({ path: path.join(output, 'kit-room-desktop.png'), fullPage: true })
  const picker = page.locator('.trak-kit-picker')
  await picker.screenshot({ path: path.join(output, 'home-away-alternate.png') })
  await picker.getByRole('radio', { name: /^Home/ }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(picker.getByRole('radio', { name: /^Away/ })).toBeChecked()
  await page.getByRole('button', { name: 'Stripes', exact: true }).click()
  await page.getByRole('button', { name: 'Royal blue', exact: true }).click()
  await expect(picker.getByRole('img', { name: /^Away/ })).toHaveAccessibleName(/Royal blue shirt with burgundy stripes/)
  await expect(picker.getByRole('img', { name: /^Home/ })).toHaveAccessibleName(/Burgundy shirt, gold trim, white shorts/)
  await page.getByRole('button', { name: 'Shorts', exact: true }).click()
  await page.getByRole('button', { name: 'Black', exact: true }).click()
  await expect(picker.getByRole('img', { name: /^Away/ })).toHaveAccessibleName(/black shorts, white socks/)
  await page.getByLabel('Custom shorts color').fill('#123456')
  await expect(picker.getByRole('img', { name: /^Away/ })).toHaveAccessibleName(/#123456 shorts/)

  const jsonDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export all three kits' }).click()
  const downloadedSet = JSON.parse(await readFile(await (await jsonDownload).path(), 'utf8'))
  expect(downloadedSet.away.shorts).toBe('#123456')
  expect(downloadedSet.home.shirt).toBe('#781D32')
  const svgDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download away SVG' }).click()
  const svg = await readFile(await (await svgDownload).path(), 'utf8')
  expect(svg).toContain('prefers-reduced-motion')
  expect(svg).toContain('#123456')
  expect(svg).not.toContain('<script')

  for (const style of ['Plain', 'Stripes', 'Hoops', 'Sash', 'Halves', 'Chest band']) {
    await page.getByRole('button', { name: style, exact: true }).click()
    await expect(page.getByRole('button', { name: style, exact: true })).toHaveAttribute('aria-pressed', 'true')
  }
  const catalog = JSON.parse(await readFile('public/kits/catalog.json', 'utf8'))
  for (const collection of catalog.collections) {
    await page.getByRole('button', { name: collection.name, exact: true }).click()
    await expect(page.getByRole('button', { name: collection.name, exact: true })).toHaveAttribute('aria-pressed', 'true')
    for (const asset of Object.values(collection.assets)) {
      const response = await page.request.get(`${base}${asset}`)
      expect(response.ok()).toBe(true)
      expect(await response.text()).toContain('<svg')
    }
  }
  await page.getByRole('button', { name: 'Burgundy & gold', exact: true }).click()
  await picker.getByRole('radio', { name: /^Home/ }).focus()
  await page.keyboard.press('Space')

  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    if (width !== 320) await page.screenshot({ path: path.join(output, `kit-room-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Preview announcement' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('img')).toHaveAccessibleName(/Home kit: Burgundy shirt, gold trim, white shorts, burgundy socks/)
    for (const role of ['Coach', 'Parent', 'Player']) {
      await dialog.getByRole('button', { name: role, exact: true }).click()
      await expect(dialog.getByRole('img')).toHaveAccessibleName(/Home kit: Burgundy shirt/)
    }
    await dialog.getByRole('button', { name: 'Parent', exact: true }).click()
    expect(await dialog.locator('.trak-kit-shirt').evaluate(element => getComputedStyle(element).animationName)).toBe('none')
    if (width === 390) await page.screenshot({ path: path.join(output, 'announcement-390.png') })
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Preview announcement' })).toBeFocused()
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByRole('button', { name: 'Preview announcement' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.getByRole('dialog').locator('.trak-kit-shirt').evaluate(element => getComputedStyle(element).animationName)).toBe('trak-kit-reveal')
  expect(errors).toEqual([])
  console.log('PASS: independent kit edits, keyboard selection, six styles, 12 collections, 36 asset URLs, JSON/SVG downloads, 320/390/768px overflow, all audience previews, Escape/focus return, and reduced motion. Screenshots:', output)
} finally {
  await browser.close()
}
