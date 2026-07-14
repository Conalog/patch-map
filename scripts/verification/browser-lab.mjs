import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifactRoot = path.join(projectRoot, 'lab', 'artifacts');
const externalBaseUrl = process.env.LAB_BASE_URL;
const headed = process.env.LAB_HEADED === '1';
const smokeStartedAt = Date.now();

const assertion = (condition, message, detail = undefined) => {
  if (condition) return;
  const error = new Error(message);
  if (detail !== undefined) error.cause = detail;
  throw error;
};

const waitForNotBusy = async (page) => {
  await page.waitForFunction(() => !document.body.classList.contains('is-busy'));
};

const waitForStep = async (page, expected) => {
  try {
    await page.waitForFunction(
      (step) =>
        new URL(window.location.href).searchParams.get('step') === String(step) &&
        !document.body.classList.contains('is-busy'),
      expected,
      { timeout: 5_000 },
    );
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: window.location.href,
      busy: document.body.classList.contains('is-busy'),
      drawDisabled: document.querySelector('[data-testid="draw-case"]')?.disabled,
      drawDataset: { ...document.querySelector('[data-testid="draw-case"]')?.dataset },
      step: document.querySelector('#step-title')?.textContent,
      result: document.querySelector('[data-testid="result-summary"]')?.textContent,
      error: document.querySelector('#stage-error-message')?.textContent,
    }));
    throw new Error(`Step ${expected} did not settle: ${JSON.stringify(state)}`, { cause: error });
  }
};

const numericText = async (locator) => Number((await locator.textContent())?.trim() ?? 'NaN');

let vite = null;
let browser = null;

try {
  await mkdir(artifactRoot, { recursive: true });

  let baseUrl = externalBaseUrl;
  if (!baseUrl) {
    vite = await createServer({
      root: projectRoot,
      configFile: path.join(projectRoot, 'vite.config.ts'),
      logLevel: 'error',
      server: {
        host: '127.0.0.1',
        port: 0,
        strictPort: false,
      },
    });
    await vite.listen();
    const address = vite.httpServer?.address();
    assertion(address && typeof address === 'object', 'Vite did not expose a listening address.');
    baseUrl = `http://127.0.0.1:${address.port}`;
  }
  baseUrl = baseUrl.replace(/\/$/u, '');

  browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(15_000);
  const pageErrors = [];
  const consoleErrors = [];
  const networkErrors = [];

  const observePage = (targetPage) => {
    targetPage.setDefaultTimeout(15_000);
    targetPage.setDefaultNavigationTimeout(15_000);
    targetPage.on('pageerror', (error) => pageErrors.push(error.message));
    targetPage.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    targetPage.on('requestfailed', (request) => {
      if (request.url().startsWith(baseUrl)) {
        networkErrors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`);
      }
    });
    targetPage.on('response', (response) => {
      if (response.url().startsWith(baseUrl) && response.status() >= 400) {
        networkErrors.push(`${response.status()} ${response.url()}`);
      }
    });
  };
  observePage(page);

  const freshCaseResults = [];
  const runFreshCase = async (caseId, finalStep, expectedStatus = 'PASS') => {
    const targetPage = await context.newPage();
    observePage(targetPage);
    await targetPage.goto(`${baseUrl}/lab/?case=${caseId}`, { waitUntil: 'networkidle' });
    await targetPage.getByTestId('app-shell').waitFor({ state: 'visible' });
    await waitForNotBusy(targetPage);
    await targetPage.getByTestId('run-case').click();
    try {
      await targetPage.waitForFunction(
        ({ expectedCase, expectedStep }) => {
          const url = new URL(window.location.href);
          return url.searchParams.get('case') === expectedCase &&
            url.searchParams.get('step') === String(expectedStep) &&
            !document.body.classList.contains('is-busy');
        },
        { expectedCase: caseId, expectedStep: finalStep },
      );
      await targetPage.getByTestId('result-summary').getByText(expectedStatus, { exact: true }).waitFor();
    } catch (error) {
      const state = await targetPage.evaluate(() => ({
        url: window.location.href,
        busy: document.body.classList.contains('is-busy'),
        step: document.querySelector('#step-title')?.textContent,
        result: document.querySelector('[data-testid="result-summary"]')?.textContent,
        failed: [...document.querySelectorAll('.assertion-row.fail')].map((entry) => entry.textContent),
        error: document.querySelector('#stage-error-message')?.textContent,
      }));
      throw new Error(`Fresh case ${caseId} did not settle: ${JSON.stringify(state)}`, { cause: error });
    }
    freshCaseResults.push({ caseId, finalStep, status: expectedStatus.toLocaleLowerCase() });
    await targetPage.close();
  };

  await page.goto(`${baseUrl}/lab/`, { waitUntil: 'networkidle' });
  await page.getByTestId('app-shell').waitFor({ state: 'visible' });
  await page.locator('#patchmap-host canvas').waitFor({ state: 'visible' });
  await waitForNotBusy(page);

  const caseRows = page.getByTestId('case-row');
  assertion(await caseRows.count() === 51, 'Expected 51 browser-lab cases.', await caseRows.count());
  const initialCanvas = await page.locator('#patchmap-host canvas').screenshot();

  await page.getByTestId('run-case').click();
  await page.waitForURL(/case=draw-all-element-kinds&step=2/u);
  await waitForNotBusy(page);
  await page.getByTestId('result-summary').getByText('PASS', { exact: true }).waitFor();
  const defaultObjectCount = await numericText(page.locator('#object-count'));
  assertion(defaultObjectCount >= 7, 'Default all-kinds case did not expose expected public handles.', defaultObjectCount);
  const drawnCanvas = await page.locator('#patchmap-host canvas').screenshot();
  assertion(!drawnCanvas.equals(initialCanvas), 'Composited canvas pixels did not change after Draw.');

  await page.getByTestId('reset-case').click();
  await page.waitForFunction(() =>
    !document.body.classList.contains('is-busy') &&
    !new URL(window.location.href).searchParams.has('step') &&
    document.querySelector('[data-testid="result-summary"]')?.textContent?.includes('NOT RUN'),
  );
  assertion(!(new URL(page.url())).searchParams.has('step'), 'Reset must clear the reproducible step query.', page.url());
  await page.getByTestId('draw-case').click();
  await waitForStep(page, 1);
  await page.getByTestId('next-step').click();
  await waitForStep(page, 2);
  await page.reload({ waitUntil: 'networkidle' });
  await waitForNotBusy(page);
  await page.getByTestId('result-summary').getByText('PASS', { exact: true }).waitFor();
  assertion(new URL(page.url()).searchParams.get('step') === '2', 'URL step restore did not replay the selected step.', page.url());

  const search = page.getByTestId('case-search');
  await search.fill('production-like');
  assertion(await caseRows.count() === 1, 'Case catalog search did not narrow to one production fixture case.', await caseRows.count());
  const productionPage = await context.newPage();
  observePage(productionPage);
  await productionPage.goto(`${baseUrl}/lab/?case=draw-production-like-458`, { waitUntil: 'networkidle' });
  await productionPage.getByTestId('app-shell').waitFor({ state: 'visible' });
  await waitForNotBusy(productionPage);
  await productionPage.getByTestId('run-case').click();
  await productionPage.waitForURL(/case=draw-production-like-458&step=4/u);
  await waitForNotBusy(productionPage);
  await productionPage.getByTestId('result-summary').getByText('PASS', { exact: true }).waitFor();
  const productionObjectCount = await numericText(productionPage.locator('#object-count'));
  assertion(productionObjectCount >= 458, 'Production fixture did not draw the expected public scene.', productionObjectCount);
  await productionPage.screenshot({
    path: path.join(artifactRoot, 'verification-console-desktop.png'),
    fullPage: false,
  });

  const sandboxPage = await context.newPage();
  observePage(sandboxPage);
  await sandboxPage.goto(`${baseUrl}/lab/?case=sandbox-editable-update`, { waitUntil: 'networkidle' });
  await sandboxPage.getByTestId('app-shell').waitFor({ state: 'visible' });
  await waitForNotBusy(sandboxPage);
  const sandboxData = [
    {
      id: 'smoke-rect',
      type: 'rect',
      size: { width: 120, height: 80 },
      fill: '#ffad57',
      attrs: { x: 10, y: 12 },
    },
  ];
  await sandboxPage.getByTestId('sandbox-json').fill(JSON.stringify(sandboxData));
  await sandboxPage.getByTestId('sandbox-draw').click();
  await sandboxPage.waitForFunction(() => document.querySelector('#object-count')?.textContent?.trim() === '1');
  assertion(await sandboxPage.locator('#handle-id').textContent() === 'smoke-rect', 'Sandbox Draw did not select the authored handle.');

  await sandboxPage.locator('#sandbox-path').fill('$..children[?(@.id==="smoke-rect")]');
  await sandboxPage.locator('#sandbox-strategy').selectOption('merge');
  await sandboxPage.locator('#sandbox-changes').fill('{"attrs":{"x":24}}');
  await sandboxPage.getByTestId('sandbox-update').click();
  await sandboxPage.waitForFunction(() => document.querySelector('#selected-handle')?.textContent?.includes('"x": 24'));
  assertion(
    (await sandboxPage.getByTestId('structural-diff').textContent())?.includes('CHANGED'),
    'Sandbox Update did not publish a before/after structural diff.',
  );
  await sandboxPage.getByTestId('sandbox-json').fill('{');
  await sandboxPage.getByTestId('sandbox-draw').click();
  await sandboxPage.locator('#stage-error-message').getByText(/SyntaxError: Draw JSON/u).waitFor();
  const sandboxErrorStack = await sandboxPage.locator('#stage-error-stack').textContent() ?? '';
  assertion(
    !/node_modules|\/dist\/|\.map(?::|$)|\.umd\.|\.bundle\./iu.test(sandboxErrorStack),
    'Sandbox error exposed a dependency bundle or source-map stack frame.',
    sandboxErrorStack,
  );

  await runFreshCase('update-merge-replace-refresh', 4);
  await runFreshCase('interaction-pan-zoom', 3);
  await runFreshCase('lifecycle-init-destroy-reinit', 5);
  await runFreshCase('package-esm-browser-import', 1);
  await runFreshCase('draw-assets-source-forms', 3);
  await runFreshCase('draw-identity-replacement', 3);
  await runFreshCase('update-relation-refresh', 6);
  await runFreshCase('update-event-silence-coalescing', 3);
  await runFreshCase('interaction-rotation-flip', 6);
  await runFreshCase('interaction-click-double-right-touch-hover', 7, 'PARTIAL');
  await runFreshCase('interaction-filter-default-deep-drill', 5, 'PARTIAL');
  await runFreshCase('interaction-canvas-event-registry', 14);

  const manualPage = await context.newPage();
  observePage(manualPage);
  await manualPage.goto(`${baseUrl}/lab/?case=interaction-transformer-eight-direction-resize`, { waitUntil: 'networkidle' });
  await manualPage.getByTestId('run-case').click();
  await waitForStep(manualPage, 3);
  await manualPage.locator('#manual-prompt').waitFor({ state: 'visible' });
  await manualPage.locator('#manual-observed').click();
  await manualPage.locator('#manual-prompt').waitFor({ state: 'hidden' });
  await manualPage.getByTestId('next-step').click();
  await waitForStep(manualPage, 4);
  await manualPage.locator('#manual-prompt').waitFor({ state: 'visible' });
  await manualPage.locator('#manual-skip').click();
  await manualPage.locator('#manual-prompt').waitFor({ state: 'hidden' });
  await manualPage.close();

  await productionPage.setViewportSize({ width: 1024, height: 768 });
  await productionPage.waitForTimeout(150);
  const layout = await productionPage.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    stageWidth: document.querySelector('#canvas-stage')?.getBoundingClientRect().width ?? 0,
    inspectorWidth: document.querySelector('.inspector-pane')?.getBoundingClientRect().width ?? 0,
  }));
  assertion(layout.scrollWidth <= layout.viewportWidth, 'Compact lab layout overflows horizontally.', layout);
  assertion(layout.stageWidth > 300 && layout.inspectorWidth >= 300, 'Compact lab panels collapsed below usable width.', layout);
  await productionPage.screenshot({
    path: path.join(artifactRoot, 'verification-console-compact.png'),
    fullPage: false,
  });

  assertion(pageErrors.length === 0, 'Browser lab emitted page errors.', pageErrors);
  assertion(consoleErrors.length === 0, 'Browser lab emitted console errors.', consoleErrors);
  assertion(networkErrors.length === 0, 'Browser lab emitted failed same-origin requests.', networkErrors);

  process.stdout.write(`${JSON.stringify({
    status: 'pass',
    durationMs: Date.now() - smokeStartedAt,
    baseUrl,
    headed,
    cases: 51,
    defaultObjectCount,
    productionObjectCount,
    freshPages: freshCaseResults,
    checks: {
      catalogFilter: 'pass',
      resetDrawStepReplay: 'pass',
      urlRestore: 'pass',
      productionFixture: 'pass',
      sandboxDraw: 'pass',
      sandboxUpdate: 'pass',
      sandboxErrorSanitization: 'pass',
      updateFreshPage: 'pass',
      interactionFreshPage: 'pass',
      lifecycleFreshPage: 'pass',
      packageFreshPage: 'pass',
      assetResetFreshPage: 'pass',
      identitySnapshotFreshPage: 'pass',
      relationFrameFreshPage: 'pass',
      eventPayloadFreshPage: 'pass',
      rotationFlipFreshPage: 'pass',
      resolvedInteractionFreshPage: 'partial-as-declared',
      canvasRebindFreshPage: 'pass',
      manualTransformerFlow: 'partial-as-declared',
      responsive1440x900: 'pass',
      responsive1024x768: 'pass',
      consoleErrors: 0,
      networkErrors: 0,
    },
    screenshots: [
      path.join(artifactRoot, 'verification-console-desktop.png'),
      path.join(artifactRoot, 'verification-console-compact.png'),
    ],
  }, null, 2)}\n`);
} finally {
  await browser?.close();
  await vite?.close();
}
