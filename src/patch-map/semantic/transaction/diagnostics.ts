import type { PatchMapDatasetError } from '../dataset';
import type {
  PatchMapMutationDiagnosticCategory,
  PatchMapMutationDiagnosticCode,
  PatchMapMutationTarget,
  PatchMapMutationTransactionDiagnostic,
} from './contracts';

/**
 * Owns the closed diagnostic construction path for mutation parsing and
 * staging. Keeping this error boundary shared ensures every planner converts
 * validation failures into the same frozen public diagnostic shape.
 */
export class TransactionValidationFailure extends Error {
  public readonly diagnostic: PatchMapMutationTransactionDiagnostic;

  public constructor(mutationDiagnostic: PatchMapMutationTransactionDiagnostic) {
    super(mutationDiagnostic.message);
    this.name = 'TransactionValidationFailure';
    this.diagnostic = mutationDiagnostic;
  }
}

export function datasetDiagnosticCode(
  error: PatchMapDatasetError,
): PatchMapMutationDiagnosticCode {
  if (/duplicate/iu.test(error.message)) return 'DUPLICATE_ID';
  return error.code;
}

export function diagnostic(
  code: PatchMapMutationDiagnosticCode,
  category: PatchMapMutationDiagnosticCategory,
  path: string,
  message: string,
  operationIndex?: number,
  target?: PatchMapMutationTarget,
  datasetCode?: PatchMapDatasetError['code'],
): PatchMapMutationTransactionDiagnostic {
  return Object.freeze({
    code,
    category,
    path,
    message,
    ...(operationIndex === undefined ? {} : { operationIndex }),
    ...(target === undefined ? {} : { target }),
    ...(datasetCode === undefined ? {} : { datasetCode }),
  });
}

export function transactionFail(
  code: PatchMapMutationDiagnosticCode,
  category: PatchMapMutationDiagnosticCategory,
  path: string,
  message: string,
  operationIndex?: number,
  target?: PatchMapMutationTarget,
): never {
  throw new TransactionValidationFailure(
    diagnostic(code, category, path, message, operationIndex, target),
  );
}

export function nonSerializable(path: string, message: string): never {
  transactionFail('NON_SERIALIZABLE_VALUE', 'INVALID_INPUT', path, message);
}
