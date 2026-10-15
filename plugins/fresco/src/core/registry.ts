/**
 * The element registry, shared by Fresco and its extensions (Fresco Pro):
 * one per runtime (server process or admin page), kept on `globalThis` so
 * that another plugin's bundle finds the same one.
 */
import type { ElementDefinition } from './model.js';

const KEY = Symbol.for('cleitext.fresco.elements');

type Registry = Map<string, ElementDefinition>;

function registry(): Registry {
  const holder = globalThis as unknown as Record<symbol, Registry | undefined>;
  return (holder[KEY] ??= new Map());
}

export function registerElement(definition: ElementDefinition): void {
  registry().set(definition.type, definition);
}

export function unregisterElement(type: string): void {
  registry().delete(type);
}

export function getElement(type: string): ElementDefinition | undefined {
  return registry().get(type);
}

export function listElements(): ElementDefinition[] {
  return [...registry().values()];
}
