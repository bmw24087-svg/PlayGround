import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, relative, resolve, sep, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const project = resolve(process.env.PROJECT_DIR || process.cwd())
const url = process.env.CAPTURE_URL
const output = process.env.CAPTURE_DIR
if (!url || !output) throw new Error('Set CAPTURE_URL and CAPTURE_DIR.')
let parsedUrl
try {
  parsedUrl = new URL(url)
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('URL must use HTTP or HTTPS.')
} catch (error) {
  console.error(`Invalid CAPTURE_URL: ${error.message}`)
  process.exit(1)
}
if (!isAbsolute(output)) {
  console.error('CAPTURE_DIR must be an absolute path outside the project.')
  process.exit(1)
}
const absoluteOutput = resolve(output)
const fromProject = relative(project, absoluteOutput)
if (fromProject === '' || (!fromProject.startsWith(`..${sep}`) && fromProject !== '..' && !isAbsolute(fromProject))) {
  console.error('CAPTURE_DIR must be outside the project directory.')
  process.exit(1)
}

const runtime = join(process.env.HOME || '', '.local/share/omgithub-playwright')
const require = createRequire(join(runtime, 'package.json'))
let chromium, config
try {
  ;({ chromium } = require('playwright'))
  config = JSON.parse(readFileSync(join(runtime, process.platform === 'darwin' ? 'metal.json' : 'linux.json'), 'utf8'))
} catch (error) {
  console.error(`Browser setup is unavailable: ${error.message}`)
  process.exit(75)
}
if (process.platform === 'linux') {
  try {
    process.env.DISPLAY ||= `:${readFileSync(join(runtime, 'display'), 'utf8').trim()}`
  } catch (error) {
    console.error(`Browser display is unavailable: ${error.message}`)
    process.exit(75)
  }
}

const transientStatuses = new Set([408, 429, 500, 502, 503, 504])
let browser
let exitCode = 0
try {
  mkdirSync(absoluteOutput, { recursive: true })
  browser = await chromium.launch({ ...config.browser.launchOptions, timeout: 30000 })
  for (const [name, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    page.setDefaultTimeout(30000)
    const defects = []
    page.on('pageerror', error => defects.push(`Uncaught page error: ${error.message}`))
    page.on('response', response => {
      if (response.status() >= 400 && new URL(response.url()).origin === parsedUrl.origin) {
        defects.push(`HTTP ${response.status()}: ${response.url()}`)
      }
    })
    let response
    try {
      response = await page.goto(url, { waitUntil: 'load', timeout: 45000 })
    } catch (error) {
      const navigationFailure = error.name === 'TimeoutError' || /net::ERR_|Navigation failed|browser has been closed/i.test(error.message)
      if (navigationFailure) throw Object.assign(error, { exitCode: 75 })
      throw error
    }
    if (!response?.ok()) {
      const status = response?.status()
      throw Object.assign(new Error(`Preview navigation failed with HTTP ${status ?? 'no response'}.`), {
        exitCode: !response || transientStatuses.has(status) ? 75 : 1,
      })
    }
    await page.locator(process.env.CAPTURE_READY_SELECTOR || 'body').waitFor({ state: 'visible' })
    await page.waitForFunction(() => document.fonts.status === 'loaded', undefined, { timeout: 15000 }).catch(error => {
      if (error.name === 'TimeoutError') throw Object.assign(error, { exitCode: 75 })
      throw error
    })
    const rendered = await page.evaluate(() => {
      const body = document.body
      if (!body) return false
      const text = (body.innerText || '').trim()
      const visual = [...body.querySelectorAll('canvas, img, svg, video, iframe')].some(element => {
        const box = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      })
      return Boolean(text || visual)
    })
    if (!rendered) throw new Error(`The ${name} page loaded but rendered no visible text or visual content.`)
    await page.waitForTimeout(500)
    try {
      await page.screenshot({ path: join(absoluteOutput, `final-${name}.png`), timeout: 30000 })
    } catch (error) {
      if (error.name === 'TimeoutError' || !browser.isConnected()) throw Object.assign(error, { exitCode: 75 })
      throw error
    }
    await page.close()
    if (defects.length) throw new Error(`${name} rendering defects: ${defects.join('; ')}`)
    console.log(`Captured ${name} (${width}x${height}) from ${url}`)
  }
} catch (error) {
  console.error(error)
  exitCode = error.exitCode || (browser?.isConnected() ? 1 : 75)
} finally {
  try {
    await browser?.close()
  } catch (error) {
    console.error(`Could not close the capture browser: ${error.message}`)
    exitCode ||= 75
  }
}
process.exitCode = exitCode
