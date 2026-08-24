import { describe, expect, it } from 'vitest';

interface BrowserLaunchRuntime {
  parsePatchMapBrowserLaunch(
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
  parsePatchMapNativeWindowsCell(
    argv: readonly string[],
    browserLaunch: ReturnType<BrowserLaunchRuntime['parsePatchMapBrowserLaunch']>,
    platform?: string,
  ): Readonly<{
    requested: boolean;
    cellId: string | null;
    evidenceStatus: string;
  }>;
}

const runtime: BrowserLaunchRuntime = await import(
  /* @vite-ignore */ new URL(
    '../../scripts/verification/patch-map-browser-launch.mjs',
    import.meta.url,
  ).href
) as BrowserLaunchRuntime;

const { parsePatchMapBrowserLaunch } = runtime;
const { parsePatchMapNativeWindowsCell } = runtime;

describe('PatchMap browser launch options', () => {
  it('keeps the existing headless Playwright Chromium default', () => {
    expect(parsePatchMapBrowserLaunch([])).toEqual({
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
      parsePatchMapBrowserLaunch(
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
    expect(parsePatchMapBrowserLaunch(['--headed', '--channel', 'msedge'])).toMatchObject({
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
    const launch = parsePatchMapBrowserLaunch([
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
      parsePatchMapBrowserLaunch([
        '--channel=chrome',
        '--executable-path=chrome.exe',
      ])).toThrow(/mutually exclusive/u);
    expect(() => parsePatchMapBrowserLaunch(['--channel=firefox'])).toThrow(
      /chrome.*msedge/u,
    );
    expect(() => parsePatchMapBrowserLaunch(['--headed', '--headless'])).toThrow(
      /mutually exclusive/u,
    );
    expect(() => parsePatchMapBrowserLaunch(['--executable-path', '--headed'])).toThrow(
      /requires a non-empty value/u,
    );
    expect(() => parsePatchMapBrowserLaunch(['--channel='])).toThrow(
      /requires a non-empty value/u,
    );
    expect(() => parsePatchMapBrowserLaunch([
      '--channel=chrome',
      '--channel=msedge',
    ])).toThrow(/at most once/u);
  });

  it('accepts native evidence only for an exact headed Windows browser cell', () => {
    const launch = parsePatchMapBrowserLaunch([
      '--headed',
      '--channel=msedge',
    ]);
    expect(
      parsePatchMapNativeWindowsCell(
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
      parsePatchMapNativeWindowsCell(
        ['--native-windows', '--headed', '--channel=msedge'],
        launch,
        'darwin',
      )).toThrow(/actual Windows host/u);
  });
});
