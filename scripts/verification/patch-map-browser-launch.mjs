import path from 'node:path';

const SUPPORTED_CHANNELS = new Set(['chrome', 'msedge']);

export function parsePatchMapBrowserLaunch(
  argv,
  {
    defaultHeaded = false,
    extraArgs = [],
  } = {},
) {
  const headed = argv.includes('--headed')
    ? true
    : argv.includes('--headless')
      ? false
      : defaultHeaded;
  const channel = argumentValue(argv, '--channel');
  const executablePathValue = argumentValue(argv, '--executable-path');
  if (channel && executablePathValue) {
    throw new Error('--channel and --executable-path are mutually exclusive');
  }
  if (channel && !SUPPORTED_CHANNELS.has(channel)) {
    throw new Error(
      `--channel must be "chrome" or "msedge", received ${JSON.stringify(channel)}`,
    );
  }
  const executablePath = executablePathValue
    ? path.resolve(executablePathValue)
    : null;
  const launchOptions = {
    headless: !headed,
    ...(channel ? { channel } : {}),
    ...(executablePath ? { executablePath } : {}),
    ...(extraArgs.length > 0 ? { args: [...extraArgs] } : {}),
  };
  return Object.freeze({
    headed,
    channel: channel ?? null,
    executablePath,
    target:
      channel
      ?? (executablePath ? `executable:${path.basename(executablePath)}` : 'playwright-chromium'),
    launchOptions: Object.freeze(launchOptions),
  });
}

export function argumentValue(argv, name) {
  const prefix = `${name}=`;
  const inline = argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function parsePatchMapNativeWindowsCell(
  argv,
  browserLaunch,
  platform = process.platform,
) {
  const requested = argv.includes('--native-windows');
  const cellId = argumentValue(argv, '--cell-id') ?? null;
  if (!requested) {
    return Object.freeze({
      requested: false,
      cellId,
      evidenceStatus: 'pending',
    });
  }
  if (platform !== 'win32') {
    throw new Error('--native-windows requires an actual Windows host');
  }
  if (!browserLaunch.headed) {
    throw new Error('--native-windows requires --headed');
  }
  if (browserLaunch.channel === null && browserLaunch.executablePath === null) {
    throw new Error('--native-windows requires --channel or --executable-path');
  }
  if (cellId === null || !/^[a-z0-9-]+$/u.test(cellId)) {
    throw new Error('--native-windows requires a stable --cell-id');
  }
  return Object.freeze({
    requested: true,
    cellId,
    evidenceStatus: 'measured-candidate-unreviewed',
  });
}
