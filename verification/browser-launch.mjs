import path from 'node:path';

const SUPPORTED_CHANNELS = new Set(['chrome', 'msedge']);

export function parsePatchMapBrowserLaunch(
  argv,
  {
    defaultHeaded = false,
    extraArgs = [],
  } = {},
) {
  if (argv.includes('--headed') && argv.includes('--headless')) {
    throw new Error('--headed and --headless are mutually exclusive');
  }
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
  const inlineValues = argv
    .filter((argument) => argument.startsWith(prefix))
    .map((argument) => argument.slice(prefix.length));
  const positionalIndices = argv.flatMap((argument, index) =>
    argument === name ? [index] : []);
  if (inlineValues.length + positionalIndices.length > 1) {
    throw new Error(`${name} must be provided at most once`);
  }
  if (inlineValues.length === 1) {
    const [value] = inlineValues;
    if (value === undefined || value.length === 0) {
      throw new Error(`${name} requires a non-empty value`);
    }
    return value;
  }
  if (positionalIndices.length === 0) return undefined;
  const value = argv[(positionalIndices[0] ?? -1) + 1];
  if (value === undefined || value.length === 0 || value.startsWith('--')) {
    throw new Error(`${name} requires a non-empty value`);
  }
  return value;
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
