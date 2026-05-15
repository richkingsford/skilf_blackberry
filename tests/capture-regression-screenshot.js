#!/usr/bin/env node
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
  const [, , pagePathArg, outputPathArg] = process.argv;

  if (!pagePathArg || !outputPathArg) {
    throw new Error('Usage: node tests/capture-regression-screenshot.js <pagePath> <outputPath>');
  }

  const pagePath = path.resolve(pagePathArg);
  const outputPath = path.resolve(outputPathArg);

  if (!fs.existsSync(pagePath)) {
    throw new Error(`Page not found: ${pagePath}`);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu', '--hide-scrollbars']
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
    await page.goto(pathToFileURL(pagePath).href, { waitUntil: 'load' });
    await page.screenshot({ path: outputPath, fullPage: true });
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
