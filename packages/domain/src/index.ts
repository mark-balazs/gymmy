/**
 * @athletic/domain — the training logic, with no dependencies at all.
 *
 * Deliberately free of React, Next and the DOM. That is enforced structurally:
 * this package has no runtime dependencies, so importing any of them would
 * fail. It keeps the rules testable in isolation and runnable on either side
 * of the wire.
 */

export * from './types';
export * from './model';
export * from './coach';
export * from './details';
export * from './exercise-names';
export * from './prefs';
export * from './seed';
export * from './splits';
