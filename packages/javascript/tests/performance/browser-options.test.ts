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
}

const runtime: BrowserLaunchRuntime = await import(
  /* @vite-ignore */ new URL(
    '../../performance/browser-options.mjs',
    import.meta.url,
  ).href
) as BrowserLaunchRuntime;

const { parsePatchMapBrowserLaunch } = runtime;

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

  it('rejects ambiguous or unsupported browser targets', () => {
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
});
