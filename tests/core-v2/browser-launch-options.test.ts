import { describe, expect, it } from 'vitest';

interface BrowserLaunchRuntime {
  parseCoreV2BrowserLaunch(
    argv: readonly string[],
    options?: Readonly<{
      defaultHeaded?: boolean;
      extraArgs?: readonly string[];
    }>,
  ): Readonly<{
    headed: boolean;
    channel: string | null;
    executablePath: string | null;
    target: string;
    launchOptions: Readonly<Record<string, unknown>>;
  }>;
  parseCoreV2NativeWindowsCell(
    argv: readonly string[],
    browserLaunch: ReturnType<BrowserLaunchRuntime['parseCoreV2BrowserLaunch']>,
    platform?: string,
  ): Readonly<{
    requested: boolean;
    cellId: string | null;
    evidenceStatus: string;
  }>;
}

const runtime: BrowserLaunchRuntime = await import(
  /* @vite-ignore */ new URL(
    '../../scripts/verification/core-v2-browser-launch.mjs',
    import.meta.url,
  ).href
) as BrowserLaunchRuntime;

const { parseCoreV2BrowserLaunch } = runtime;
const { parseCoreV2NativeWindowsCell } = runtime;

describe('Core v2 browser launch options', () => {
  it('keeps the existing headless Playwright Chromium default', () => {
    expect(parseCoreV2BrowserLaunch([])).toEqual({
      headed: false,
      channel: null,
      executablePath: null,
      target: 'playwright-chromium',
      launchOptions: {
        headless: true,
      },
    });
  });

  it('selects an exact headed Chrome or Edge channel without changing extra flags', () => {
    expect(
      parseCoreV2BrowserLaunch(
        ['--headed', '--channel=chrome'],
        { extraArgs: ['--enable-precise-memory-info'] },
      ),
    ).toMatchObject({
      headed: true,
      channel: 'chrome',
      target: 'chrome',
      launchOptions: {
        headless: false,
        channel: 'chrome',
        args: ['--enable-precise-memory-info'],
      },
    });
    expect(parseCoreV2BrowserLaunch(['--headed', '--channel', 'msedge'])).toMatchObject({
      headed: true,
      channel: 'msedge',
      target: 'msedge',
      launchOptions: {
        headless: false,
        channel: 'msedge',
      },
    });
  });

  it('accepts a pinned executable path for latest-1 browser cells', () => {
    const launch = parseCoreV2BrowserLaunch([
      '--headed',
      '--executable-path',
      './fixtures/browser/chrome.exe',
    ]);
    expect(launch.headed).toBe(true);
    expect(launch.channel).toBeNull();
    expect(launch.executablePath).toMatch(/fixtures[\\/]browser[\\/]chrome\.exe$/u);
    expect(launch.target).toBe('executable:chrome.exe');
    expect(launch.launchOptions).toMatchObject({
      headless: false,
      executablePath: launch.executablePath,
    });
  });

  it('rejects ambiguous or unapproved browser targets', () => {
    expect(() =>
      parseCoreV2BrowserLaunch([
        '--channel=chrome',
        '--executable-path=chrome.exe',
      ])).toThrow(/mutually exclusive/u);
    expect(() => parseCoreV2BrowserLaunch(['--channel=firefox'])).toThrow(
      /chrome.*msedge/u,
    );
  });

  it('accepts native evidence only for an exact headed Windows browser cell', () => {
    const launch = parseCoreV2BrowserLaunch([
      '--headed',
      '--channel=msedge',
    ]);
    expect(
      parseCoreV2NativeWindowsCell(
        [
          '--native-windows',
          '--headed',
          '--channel=msedge',
          '--cell-id=windows-11-edge-latest',
        ],
        launch,
        'win32',
      ),
    ).toEqual({
      requested: true,
      cellId: 'windows-11-edge-latest',
      evidenceStatus: 'measured-candidate-unreviewed',
    });
    expect(() =>
      parseCoreV2NativeWindowsCell(
        ['--native-windows', '--headed', '--channel=msedge'],
        launch,
        'darwin',
      )).toThrow(/actual Windows host/u);
  });
});
