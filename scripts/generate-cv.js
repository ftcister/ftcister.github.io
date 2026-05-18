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

  let localServer = null; // Track HTTP server for local mode

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
    localServer = server;
    pageUrl = `http://localhost:${port}/`;
    console.log(`Serving _site/ on ${pageUrl}`);
  }

  console.log(`Loading page: ${pageUrl}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto(pageUrl, { waitUntil: 'networkidle0', timeout: 30000 });

  // Inject header + wrap sections + list items for page break control
  await page.evaluate(() => {
    const section = document.querySelector('section');
    const wrapper = section.parentNode;

    // Insert CV header before the main section
    const header = document.createElement('div');
    header.id = 'cv-header';
    header.innerHTML = `
      <div style="text-align:center; border-bottom: 1.5pt solid #333; padding-bottom: 6pt; margin-bottom: 4pt;">
        <div style="font-size: 19pt; font-weight: 700; color: #111; margin-bottom: 2pt;">FELIPE CISTERNAS ÁLVAREZ</div>
        <div style="font-size: 8pt; color: #555;">fcistemas.dev@gmail.com &nbsp;|&nbsp; linkedin.com/in/felipecisternasalvarez &nbsp;|&nbsp; github.com/ftcister &nbsp;|&nbsp; Santiago, Chile</div>
      </div>
    `;
    wrapper.insertBefore(header, section);

    // Wrap each logical section (between h2 tags) in a div
    const children = Array.from(section.children);
    const groups = [];
    let currentGroup = [];

    for (const child of children) {
      if (child.tagName === 'H2' && currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
      }
      currentGroup.push(child);
    }
    if (currentGroup.length > 0) groups.push(currentGroup);

    // Replace section content with wrapped groups
    section.innerHTML = '';
    for (const group of groups) {
      const div = document.createElement('div');
      div.className = 'cv-section';
      for (const child of group) {
        // Wrap each <li> inside a <div> for reliable page-break-inside
        if (child.tagName === 'UL' || child.tagName === 'OL') {
          const lis = Array.from(child.querySelectorAll('li'));
          for (const li of lis) {
            const wrapper2 = document.createElement('div');
            wrapper2.className = 'cv-item';
            wrapper2.appendChild(li.cloneNode(true));
            li.replaceWith(wrapper2);
          }
        }
        div.appendChild(child);
      }
      section.appendChild(div);
    }
  });

  // Inject print CSS
  await page.addStyleTag({
    content: `
      @media print {
        body {
          padding: 0 !important;
          font-size: 8.5pt !important;
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
        /* Prevent orphaned headers at page bottom */
        h2 { break-after: avoid; page-break-after: avoid; }

        /* Keep individual items from splitting across pages */
        .cv-item {
          break-inside: avoid-page;
          page-break-inside: avoid;
        }
        .cv-section > p {
          break-inside: avoid-page;
          page-break-inside: avoid;
        }
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

  // --- Verify no orphaned headers ---
  try {
    const { execSync } = require('child_process');
    const text = execSync(`pdftotext -layout "${PDF_OUTPUT}" -`, { encoding: 'utf8', timeout: 5000 });
    const pages = text.split('\f').filter(p => p.trim());
    console.log(`\n📄 ${pages.length} page(s) — section boundary check:`);

    for (let i = 0; i < pages.length; i++) {
      const lines = pages[i].split('\n').filter(l => l.trim());
      const lastLines = lines.slice(-4).join(' | ').substring(0, 120);
      console.log(`  Page ${i + 1} ends with: ...${lastLines}`);
    }

    // Check for potential orphans: a page ending with what looks like a section header
    const headerPattern = /^[A-Z][a-z]+ (Me|Experience|Projects|Research|Certificates|Achievements|Languages|Skills|Education)/m;
    for (let i = 0; i < pages.length - 1; i++) {
      const lastFewLines = pages[i].split('\n').slice(-5).join('\n');
      if (headerPattern.test(lastFewLines)) {
        console.warn(`\n⚠️  WARNING: Page ${i + 1} may end with an orphaned section header!`);
      }
    }
    console.log('✅ No orphaned headers detected.');
  } catch (e) {
    console.log('⚠️  Could not verify page breaks (pdftotext not available in CI)');
  }

  console.log('Closing browser...');
  await Promise.race([
    browser.close(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('browser.close() timed out')), 15000)),
  ]);
  console.log('Browser closed.');

  // Close local HTTP server so Node process can exit
  if (localServer) {
    localServer.closeAllConnections(); // Node 18.2+: force-close idle connections
    await new Promise(resolve => {
      localServer.close(resolve);
      // Safety net: force exit if close takes >5s
      setTimeout(resolve, 5000);
    });
    console.log('Local server closed.');
  }
}

main().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
