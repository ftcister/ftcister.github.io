#!/usr/bin/env node
/**
 * Generates Felipe_Resume.pdf from the built Jekyll site.
 *
 * Usage:
 *   node scripts/generate-cv.js [url]
 *
 *   url: defaults to https://ftcister.github.io/ for local dev,
 *        pass file:// or http://localhost URL for CI/preview.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { spawn } = require('child_process');

const SITE_DIR = path.resolve(__dirname, '..', '_site');
const PDF_OUTPUT = process.env.PDF_OUTPUT
  || path.resolve(__dirname, '..', 'projects', 'Felipe_Resume.pdf');

// Resolve puppeteer from npx cache or node_modules
function findPuppeteer() {
  const candidates = [
    path.join(process.env.HOME, '.npm', '_npx'),
    path.resolve(__dirname, '..', 'node_modules'),
  ];
  for (const base of candidates) {
    if (!fs.existsSync(base)) continue;
    // Walk one level to find puppeteer
    const entries = fs.readdirSync(base);
    for (const entry of entries) {
      const testPath = path.join(base, entry, 'node_modules', 'puppeteer');
      if (fs.existsSync(testPath)) return testPath;
    }
    const directPath = path.join(base, 'puppeteer');
    if (fs.existsSync(directPath)) return directPath;
  }
  return 'puppeteer'; // fallback: rely on NODE_PATH or global install
}

async function main() {
  const puppeteerPath = findPuppeteer();
  const puppeteer = require(puppeteerPath);

  // Determine the URL to load
  let pageUrl = process.argv[2];

  if (!pageUrl) {
    // Default: use live site for local dev
    pageUrl = 'https://ftcister.github.io/';
  } else if (pageUrl === 'local') {
    // CI mode: serve _site/ locally and load from there
    const port = 9876;
    const server = http.createServer((req, res) => {
      const parsed = url.parse(req.url);
      let filePath = path.join(SITE_DIR, parsed.pathname);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      const extMap = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.pdf': 'application/pdf',
        '.json': 'application/json',
        '.ico': 'image/x-icon',
      };
      const ext = path.extname(filePath).toLowerCase();
      const contentType = extMap[ext] || 'application/octet-stream';

      if (fs.existsSync(filePath)) {
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(path.join(SITE_DIR, 'index.html')).pipe(res);
      }
    });

    await new Promise(resolve => server.listen(port, resolve));
    pageUrl = `http://localhost:${port}/`;
    console.log(`Serving _site/ on ${pageUrl}`);

    process.on('exit', () => server.close());
  }

  console.log(`Loading page: ${pageUrl}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto(pageUrl, { waitUntil: 'networkidle0', timeout: 30000 });

  // Inject header div with JS
  await page.evaluate(() => {
    const header = document.createElement('div');
    header.id = 'cv-header';
    header.innerHTML = `
      <div style="text-align:center; border-bottom: 1.5pt solid #333; padding-bottom: 6pt; margin-bottom: 4pt;">
        <div style="font-size: 19pt; font-weight: 700; color: #111; margin-bottom: 2pt;">FELIPE CISTERNAS ÁLVAREZ</div>
        <div style="font-size: 8pt; color: #555;">fcistemas.dev@gmail.com &nbsp;|&nbsp; linkedin.com/in/felipecisternasalvarez &nbsp;|&nbsp; github.com/ftcister &nbsp;|&nbsp; Santiago, Chile</div>
      </div>
    `;
    const section = document.querySelector('section');
    section.parentNode.insertBefore(header, section);
  });

  // Inject print CSS
  await page.addStyleTag({
    content: `
      @media print {
        body {
          padding: 0 !important;
          font-size: 9pt !important;
          color: #333 !important;
          line-height: 1.35 !important;
        }
        .wrapper { width: 100% !important; margin: 0 !important; }
        header, footer, .social-icons { display: none !important; }
        section {
          float: none !important;
          width: 100% !important;
          padding: 0 !important;
          margin: 0 !important;
          border: none !important;
        }
        h1 { font-size: 16pt !important; margin: 0 0 4pt !important; }
        h2 {
          font-size: 10.5pt !important;
          color: #222 !important;
          margin: 12pt 0 2pt !important;
          border-bottom: 0.5pt solid #999 !important;
          padding-bottom: 1pt !important;
        }
        h3 { font-size: 9pt !important; margin: 6pt 0 1pt !important; }
        p, ul, ol { margin: 0 0 2pt !important; }
        li { margin-bottom: 0.5pt !important; }
        hr { margin: 5pt 0 !important; height: 0.3pt !important; background: #ccc !important; }
        strong { color: #222 !important; }
        a { color: #333 !important; text-decoration: none !important; }
        a::after { content: "" !important; }
        @page { size: A4; margin: 12mm 14mm 12mm 14mm; }
        p, li { orphans: 2; widows: 2; }
        h2 { page-break-after: avoid; }
      }
    `,
  });

  // Generate PDF
  await page.pdf({
    path: PDF_OUTPUT,
    format: 'A4',
    printBackground: false,
    preferCSSPageSize: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  });

  console.log(`✅ PDF generated: ${PDF_OUTPUT}`);
  await browser.close();
}

main().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
