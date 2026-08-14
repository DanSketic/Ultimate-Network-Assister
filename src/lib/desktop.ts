/**
 * Thin wrapper over the Tauri APIs.
 *
 * The same bundle runs in a plain browser (`npm run dev`) and inside the
 * desktop shell (`npm run tauri:dev`), so every call degrades gracefully when
 * the Tauri bridge is absent.
 */

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function appWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

export async function minimizeWindow(): Promise<void> {
  if (!isDesktop()) return;
  (await appWindow()).minimize();
}

export async function toggleMaximizeWindow(): Promise<void> {
  if (!isDesktop()) return;
  (await appWindow()).toggleMaximize();
}

export async function closeWindow(): Promise<void> {
  if (!isDesktop()) return;
  (await appWindow()).close();
}

/**
 * Copies to the clipboard, preferring the Tauri plugin because the webview is
 * not always treated as a secure context on Windows, which disables
 * navigator.clipboard.
 */
export async function copyText(text: string): Promise<void> {
  if (isDesktop()) {
    try {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
      await writeText(text);
      return;
    } catch {
      // Plugin unavailable — fall through to the web API.
    }
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    legacyCopy(text);
  }
}

function legacyCopy(text: string): void {
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  try {
    document.execCommand('copy');
  } catch {
    // Nothing else to try; the command panel still shows the text to copy by hand.
  }
  document.body.removeChild(el);
}
