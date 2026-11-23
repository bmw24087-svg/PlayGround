import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'

const root = resolve(process.env.BUILD_DIR || 'dist')
const port = Number(process.env.PORT || 3000)
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
}

const server = createServer((request, response) => {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  } catch {
    response.writeHead(400).end('Bad request')
    return
  }
  let file = resolve(root, `.${pathname}`)
  if (file !== root && !file.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end('Forbidden')
    return
  }
  try {
    if (statSync(file).isDirectory()) file = resolve(file, 'index.html')
  } catch {
    file = resolve(root, 'index.html')
  }
  try {
    const details = statSync(file)
    if (!details.isFile()) throw new Error('Not a file')
    response.writeHead(200, {
      'Content-Type': mime[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': details.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    })
    createReadStream(file).pipe(response)
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found')
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Serving ${root} on http://0.0.0.0:${port}`)
})
