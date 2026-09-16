const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  const logs = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
    else logs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => errors.push(err.message));
  
  await page.goto('http://localhost:8080');
  await page.waitForTimeout(1000);
  
  const input = await page.$('input[type="file"]');
  await input.setInputFiles(path.resolve('test.pdf'));
  await page.waitForTimeout(2000);
  
  await page.click('#editModeBtn');
  await page.waitForTimeout(500);
  
  const textBlocks = await page.$$('.text-block');
  console.log('textBlocks:', textBlocks.length);
  if (textBlocks.length > 0) {
    await textBlocks[0].click();
    await page.keyboard.type(' TEST');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
  }
  
  await page.click('#saveBtn');
  await page.waitForTimeout(3000);
  
  const status = await page.textContent('#status');
  console.log('status:', status);
  console.log('errors:', errors);
  console.log('logs:', logs.slice(0, 20));
  
  await browser.close();
})();