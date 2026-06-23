import { mkdir, access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import { createServer } from 'node:https';

const root = new URL('..', import.meta.url).pathname;
const certDir = join(root, '.cert');
const keyPath = join(certDir, 'lan-key.pem');
const certPath = join(certDir, 'lan-cert.pem');
const distDir = join(root, 'dist');
const port = process.env.PORT || '5173';
const lanAddresses = getLanAddresses();

await ensureCertificate();
await run('npx', ['vite', 'build']);
printLanUrls();

const server = createServer({
  cert: await readFile(certPath),
  key: await readFile(keyPath),
}, serveStaticFile);
server.listen(Number(port), '0.0.0.0', () => {
  console.log(`HTTPS static server listening on ${port}`);
});

async function ensureCertificate() {
  await mkdir(certDir, { recursive: true });
  try {
    await access(keyPath, constants.R_OK);
    await access(certPath, constants.R_OK);
    return;
  } catch {
    // Generate below.
  }

  const subjectAltName = [
    'DNS:localhost',
    'IP:127.0.0.1',
    ...lanAddresses.map((address) => `IP:${address}`),
  ].join(',');

  await run('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-sha256',
    '-days',
    '365',
    '-subj',
    '/CN=localhost',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-addext',
    `subjectAltName=${subjectAltName}`,
  ]);
}

function printLanUrls() {
  console.log('LAN HTTPS URLs:');
  if (!lanAddresses.length) {
    console.log(`  https://127.0.0.1:${port}/`);
    return;
  }
  for (const address of lanAddresses) {
    console.log(`  https://${address}:${port}/`);
  }
}

async function serveStaticFile(request, response) {
  try {
    const url = new URL(request.url ?? '/', `https://${request.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);
    const safePath = pathname === '/' ? '/index.html' : pathname;
    const filePath = normalize(join(distDir, safePath));
    if (!filePath.startsWith(distDir)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    const info = await stat(filePath);
    if (!info.isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'content-type': mimeType(filePath),
      'cache-control': filePath.includes('/web/generated/') ? 'public, max-age=3600' : 'no-cache',
    });
    response.end(await readFile(filePath));
  } catch (error) {
    response.writeHead(error?.code === 'ENOENT' ? 404 : 500);
    response.end(error?.code === 'ENOENT' ? 'Not found' : 'Server error');
  }
}

function mimeType(path) {
  switch (extname(path).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs': return 'text/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json':
    case '.gltf': return 'application/json; charset=utf-8';
    case '.bin': return 'application/octet-stream';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.svg': return 'image/svg+xml';
    case '.ico': return 'image/x-icon';
    default: return 'application/octet-stream';
  }
}

function getLanAddresses() {
  const addresses = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }
  return addresses;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    import('node:child_process').then(({ spawn }) => {
      const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with ${code}`));
      }
    });
    }).catch(reject);
  });
}
