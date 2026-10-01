export function examplesRunnerSource() {
  return `
import { runMinimalExample } from './examples/minimal';
import { runDashboardExample } from './examples/dashboard';
import { runEditorExample } from './examples/editor';
import { runReportExample } from './examples/report';

const examples = [
  ['minimal', runMinimalExample],
  ['dashboard', runDashboardExample],
  ['editor', runEditorExample],
  ['report', runReportExample],
];
const results = [];
for (const [name, run] of examples) {
  const host = document.createElement('div');
  host.dataset.example = name;
  host.style.width = '480px';
  host.style.height = '280px';
  document.body.appendChild(host);
  try {
    const result = await run(host);
    results.push({ name, status: 'pass', result });
  } catch (error) {
    results.push({
      name,
      status: 'fail',
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  } finally {
    host.remove();
  }
}
window.__PATCH_MAP_PACKAGE_EXAMPLES__ = {
  compiledExamples: examples.map(([name]) => name),
  executedExamples: results.filter(({ status }) => status === 'pass').map(({ name }) => name),
  results,
  remainingCanvasCount: document.querySelectorAll('canvas').length,
};
`;
}

export function html(entry) {
  return `<!doctype html>
<html><body><script type="module" src="${entry}"></script></body></html>\n`;
}
