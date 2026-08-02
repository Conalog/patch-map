class CoreError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class CoreDestroyedError extends CoreError {}

export class CoreValidationError extends CoreError {
  public readonly path: string;

  public constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.path = path;
  }
}

export class CoreTargetError extends CoreError {
  public readonly target: string;

  public constructor(target: string) {
    super(`Unknown or stale entity target: ${target}`);
    this.target = target;
  }
}
