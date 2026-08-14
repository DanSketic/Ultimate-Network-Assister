import { isDesktop } from '@/lib/desktop';
import type { Dict } from '@/i18n';
import type { Blueprint } from './model';

/*
 * Blueprint persistence.
 *
 * Desktop: a SQLite table behind Tauri commands, so blueprints survive
 * restarts and can be queried later. Browser: localStorage, so `npm run dev`
 * is a complete environment without the shell.
 *
 * Either way a blueprint is portable JSON — the file export is the sharing and
 * version-control path, not a second source of truth.
 */

const STORAGE_KEY = 'network-assister.blueprints';

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: call } = await import('@tauri-apps/api/core');
  return call<T>(command, args);
}

export async function loadBlueprints(): Promise<Blueprint[]> {
  if (isDesktop()) {
    try {
      const rows = await invoke<string[]>('list_blueprints');
      return rows.map((r) => JSON.parse(r) as Blueprint);
    } catch (err) {
      console.error('[blueprint] SQLite read failed, starting from memory', err);
      return [];
    }
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Blueprint[]) : [];
  } catch {
    return [];
  }
}

export async function persistBlueprint(blueprint: Blueprint, all: Blueprint[]): Promise<void> {
  if (isDesktop()) {
    await invoke('save_blueprint', { id: blueprint.id, payload: JSON.stringify(blueprint) });
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export async function removeBlueprint(id: string, all: Blueprint[]): Promise<void> {
  if (isDesktop()) {
    await invoke('delete_blueprint', { id });
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

/* ------------------------------------------------------------- file export */

/** Writes text to a user-chosen path. Returns the path, or null if cancelled. */
export async function saveTextFile(
  suggestedName: string,
  contents: string,
  filters: { name: string; extensions: string[] }[],
): Promise<string | null> {
  if (isDesktop()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({ defaultPath: suggestedName, filters });
    if (!path) return null;
    // Written by our own command rather than the filesystem plugin: the path
    // came from the native dialog, so no broad path scope has to be granted.
    await invoke('write_text_file', { path, contents });
    return path;
  }

  // Browser fallback: hand the file to the download manager.
  const mime = suggestedName.endsWith('.html') ? 'text/html' : 'application/json';
  const url = URL.createObjectURL(new Blob([contents], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
  return suggestedName;
}

/** Reads a user-chosen text file. Returns null if cancelled. */
export async function openTextFile(
  filters: { name: string; extensions: string[] }[],
): Promise<string | null> {
  if (isDesktop()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ multiple: false, filters });
    if (typeof path !== 'string') return null;
    return invoke<string>('read_text_file', { path });
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = filters.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(',');
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      file.text().then(resolve, () => resolve(null));
    };
    input.click();
  });
}

/**
 * Accepts a blueprint from JSON, rejecting anything that is not one. Imported
 * files come from outside the application, so shape is checked rather than
 * assumed.
 */
export function parseBlueprint(json: string, x: Dict['blueprint']['importError']): Blueprint {
  const raw: unknown = JSON.parse(json);
  if (typeof raw !== 'object' || raw === null) throw new Error(x.notObject);

  const bp = raw as Partial<Blueprint>;
  const missing = (['id', 'name', 'presetId'] as const).filter((k) => typeof bp[k] !== 'string');
  if (missing.length > 0) {
    throw new Error(x.missingFields(missing.join(', ')));
  }
  if (!Array.isArray(bp.enabledModules) || !Array.isArray(bp.households)) {
    throw new Error(x.missingLists);
  }
  if (typeof bp.params !== 'object' || bp.params === null) {
    throw new Error(x.missingParams);
  }

  const stamp = new Date().toISOString();
  return {
    ...(bp as Blueprint),
    source: 'user',
    updatedAt: stamp,
  };
}
