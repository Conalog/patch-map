/**
 * Compatibility facade for the public PatchMap type surface.
 *
 * Contract ownership lives in the downward `engine/contracts/*` modules. This
 * facade intentionally contains no runtime declarations or upward imports.
 */
export type * from './contracts/editor';
export type * from './contracts/extraction';
export type * from './contracts/history-transformer';
export type * from './contracts/lifecycle';
export type * from './contracts/mutation';
export type * from './contracts/product';
export type * from './contracts/query-selection';
export type * from './contracts/rendering';
export type * from './contracts/viewport';
