import { z } from "zod";
import type { LinkPreferences } from "../shared/preferences";
import {
  BrowserOpenError,
  createHost,
  resolveModuleIds,
  type BrowserHost,
  type ChatLink,
} from "./host";

// DOM types stay local so native compilation never needs lib.dom.
declare class URL {
  constructor(url: string, base?: string | URL);
  href: string;
  hostname: string;
  host: string;
  pathname: string;
  protocol: string;
}
declare class Node {
  parentElement: Element | null;
}
declare class Element extends Node {
  isConnected: boolean;
  textContent: string | null;
  closest(selector: string): Element | null;
  contains(node: Node): boolean;
  getClientRects(): ArrayLike<unknown>;
  querySelector(selector: string): Element | null;
  querySelectorAll(selector: string): ArrayLike<Element>;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
}
declare class HTMLAnchorElement extends Element {}
interface AlertElement {
  textContent: string | null;
  style: Record<string, string>;
  setAttribute(name: string, value: string): void;
  addEventListener(type: string, listener: () => void, options?: { once?: boolean }): void;
  append(child: AlertElement): void;
  remove(): void;
}
interface MouseEvent {
  button: number;
  clientX: number;
  clientY: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
  target: unknown;
  preventDefault(): void;
  stopImmediatePropagation(): void;
}
declare const document: {
  scripts: ArrayLike<{ src: string }>;
  body: { append(child: AlertElement): void };
  createElement(tag: "div" | "button"): AlertElement;
  addEventListener(
    type: "click" | "contextmenu",
    listener: (event: MouseEvent) => void,
    capture: boolean,
  ): void;
  removeEventListener(
    type: "click" | "contextmenu",
    listener: (event: MouseEvent) => void,
    capture: boolean,
  ): void;
};
declare const location: { href: string; pathname: string };
const callable = z.custom<(...args: unknown[]) => unknown>((value) => typeof value === "function");

const PANE = '[data-testid^="workspace-pane-"]';
const CHAT = '[data-testid="agent-chat-scroll"]';
const ASSISTANT = '[data-testid="assistant-message"]';
const OWNER = Symbol.for("paseo.plugin.in-app-links.owner");
const LOCAL_FILE_PATH =
  /^\/(?:Users|Volumes|private|tmp|var|Applications|Library|System|opt|usr|home|mnt|srv)\//i;
function visible(element: Element): boolean {
  return (
    element.isConnected &&
    !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
    element.getClientRects().length > 0
  );
}
function clickedLink(event: MouseEvent, allowDownloads = false): ChatLink | null {
  const target =
    event.target instanceof Element
      ? event.target
      : event.target instanceof Node
        ? event.target.parentElement
        : null;
  const anchor = target?.closest("a[href]");
  if (
    !(anchor instanceof HTMLAnchorElement) ||
    (!allowDownloads && anchor.hasAttribute("download"))
  )
    return null;
  const assistant = anchor.closest(ASSISTANT);
  const chat = anchor.closest(CHAT);
  const pane = anchor.closest(PANE);
  if (
    !assistant ||
    !chat ||
    !pane ||
    !chat.contains(assistant) ||
    !pane.contains(chat) ||
    !visible(assistant) ||
    !visible(chat) ||
    !visible(pane)
  )
    return null;
  const raw = anchor.getAttribute("href") ?? "";
  try {
    const url = LOCAL_FILE_PATH.test(raw) ? new URL("file:///") : new URL(raw);
    if (LOCAL_FILE_PATH.test(raw)) url.pathname = raw;
    if (url.protocol !== "file:" && (!url.hostname || !["http:", "https:"].includes(url.protocol)))
      return null;
    const tabs = Array.from(
      pane.querySelectorAll('[data-testid^="workspace-tab-agent_"][aria-selected="true"]'),
    ).filter(visible);
    if (tabs.length !== 1) return null;
    const paneId = pane.getAttribute("data-testid")?.slice("workspace-pane-".length);
    const agentId = tabs[0].getAttribute("data-testid")?.slice("workspace-tab-agent_".length);
    if (!paneId || !agentId) return null;
    return {
      url: url.href,
      text: anchor.textContent ?? "",
      unwrap:
        anchor.getAttribute("data-paseo-markdown-unwrap") === "true" ||
        anchor.querySelector("code") !== null,
      paneId,
      agentId,
    };
  } catch {
    return null;
  }
}

interface LinkControllerOptions {
  isWeb: boolean;
  readPreferences(): Promise<LinkPreferences>;
  openExternal(url: string): Promise<void>;
  copyFile(url: string): Promise<void>;
  copyFileAddress(url: string): Promise<void>;
  errorText(): {
    failure: string;
    dismiss: string;
    openFile: string;
    copyFile: string;
    copyAddress: string;
  };
  discover?: (signal: AbortSignal) => Promise<BrowserHost>;
}

export function install(options: LinkControllerOptions) {
  if (!options.isWeb || typeof document === "undefined") return () => {};
  const previous: unknown = Reflect.get(document, OWNER);
  if (typeof previous === "function") previous();
  const lifetime = new AbortController();
  let host: BrowserHost | null = null;
  let alert: AlertElement | null = null;
  let fileMenu: AlertElement | null = null;
  function clearAlert() {
    alert?.remove();
    alert = null;
  }
  function clearFileMenu() {
    fileMenu?.remove();
    fileMenu = null;
  }
  function showError(error: unknown) {
    if (lifetime.signal.aborted) return;
    console.error("[link-pilot] Link opening failed", {
      browserId: error instanceof BrowserOpenError ? error.browserId : null,
      error,
    });
    clearAlert();
    const copy = options.errorText();
    alert = document.createElement("div");
    alert.setAttribute("role", "alert");
    alert.textContent = copy.failure + " ";
    Object.assign(alert.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      maxWidth: "360px",
      zIndex: "2147483647",
      background: "Canvas",
      color: "CanvasText",
      border: "1px solid ButtonBorder",
      padding: "12px",
      borderRadius: "8px",
    });
    const dismiss = document.createElement("button");
    dismiss.textContent = copy.dismiss;
    dismiss.addEventListener("click", clearAlert, { once: true });
    alert.append(dismiss);
    document.body.append(alert);
  }
  function showFileMenu(event: MouseEvent, url: string) {
    clearFileMenu();
    const copy = options.errorText();
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    Object.assign(menu.style, {
      position: "fixed",
      left: `${event.clientX}px`,
      top: `${event.clientY}px`,
      zIndex: "2147483647",
      minWidth: "220px",
      padding: "5px",
      background: "Menu",
      color: "MenuText",
      border: "1px solid ButtonBorder",
      borderRadius: "8px",
      boxShadow: "0 8px 24px rgb(0 0 0 / 22%)",
      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: "13px",
    });
    const addItem = (label: string, action: () => Promise<void>) => {
      const button = document.createElement("button");
      button.setAttribute("role", "menuitem");
      button.textContent = label;
      Object.assign(button.style, {
        display: "block",
        width: "100%",
        minHeight: "28px",
        padding: "5px 10px",
        border: "0",
        borderRadius: "5px",
        background: "transparent",
        color: "MenuText",
        fontFamily: "inherit",
        fontSize: "13px",
        lineHeight: "18px",
        textAlign: "left",
        cursor: "default",
      });
      const setSelected = (selected: boolean) => {
        button.style.background = selected ? "Highlight" : "transparent";
        button.style.color = selected ? "HighlightText" : "MenuText";
      };
      button.addEventListener("mouseenter", () => setSelected(true));
      button.addEventListener("mouseleave", () => setSelected(false));
      button.addEventListener("focus", () => setSelected(true));
      button.addEventListener("blur", () => setSelected(false));
      button.addEventListener(
        "click",
        () => {
          clearFileMenu();
          void action().catch(showError);
        },
        { once: true },
      );
      menu.append(button);
    };
    addItem(copy.copyFile, () => options.copyFile(url));
    addItem(copy.copyAddress, () => options.copyFileAddress(url));
    addItem(copy.openFile, () => options.openExternal(url));
    document.body.append(menu);
    fileMenu = menu;
  }
  function onDocumentClick() {
    clearFileMenu();
  }
  function onClick(event: MouseEvent) {
    if (!host || event.defaultPrevented || event.button !== 0 || event.shiftKey || event.altKey)
      return;
    // macOS Ctrl-click opens a context menu; only the platform's primary modifier is ours.
    if (host.modifierKey === "meta" ? event.ctrlKey : event.metaKey) return;
    const modified = host.modifierKey === "meta" ? event.metaKey : event.ctrlKey;
    const link = clickedLink(event);
    if (!link) return;
    const localFile = link.url.startsWith("file:");
    // Paseo's native handler owns ordinary local-file clicks and its file preview.
    if (localFile && !modified) return;
    const pathname = location.pathname;
    const intent = host.prepare(link, pathname);
    if (!intent) return;
    const openingHost = host;
    event.preventDefault();
    event.stopImmediatePropagation();
    void options
      .readPreferences()
      .then(async (values) => {
        if (lifetime.signal.aborted) return;
        const current = openingHost.prepare(link, location.pathname);
        if (
          pathname !== location.pathname ||
          !current ||
          current.serverId !== intent.serverId ||
          current.workspaceKey !== intent.workspaceKey
        )
          throw new Error("Source chat changed while reading settings");
        // A local file cannot render in Paseo's workspace browser. Command/Ctrl-click
        // therefore always uses the system opener, including when the setting is stale.
        if (localFile || values[modified ? "modifiedClick" : "click"] === "external")
          await options.openExternal(link.url);
        else openingHost.open(current);
        if (!lifetime.signal.aborted) clearAlert();
      })
      .catch(showError);
  }
  function onContextMenu(event: MouseEvent) {
    if (!host || event.defaultPrevented || event.button !== 2) return;
    const link = clickedLink(event, true);
    if (!link?.url.startsWith("file:")) return;
    const pathname = location.pathname;
    const intent = host.prepare(link, pathname);
    if (!intent) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showFileMenu(event, link.url);
  }
  function dispose() {
    lifetime.abort();
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("click", onDocumentClick, true);
    document.removeEventListener("contextmenu", onContextMenu, true);
    host = null;
    clearAlert();
    clearFileMenu();
    if (Reflect.get(document, OWNER) === dispose) Reflect.deleteProperty(document, OWNER);
  }
  Reflect.set(document, OWNER, dispose);
  void (options.discover ?? discoverHost)(lifetime.signal)
    .then((ready) => {
      if (lifetime.signal.aborted) return;
      host = ready;
      document.addEventListener("click", onDocumentClick, true);
      document.addEventListener("click", onClick, true);
      document.addEventListener("contextmenu", onContextMenu, true);
    })
    .catch((error: unknown) => {
      if (!lifetime.signal.aborted)
        console.warn("[link-pilot] Native link handling retained", error);
    });
  return dispose;
}

async function discoverHost(signal: AbortSignal): Promise<BrowserHost> {
  const runtime = z.object({ __r: callable }).parse(globalThis);
  const base = new URL(location.href);
  const urls = new Set(
    Array.from(document.scripts).flatMap((script) => {
      if (!script.src) return [];
      const url = new URL(script.src, base);
      return url.protocol === base.protocol && url.host === base.host ? [url.href] : [];
    }),
  );
  for (const url of urls) {
    const response = await fetch(url, { signal });
    if (!response.ok) continue;
    const source = await response.text();
    if (signal.aborted) throw new Error("Plugin stopped");
    if (!source.includes("createWorkspaceBrowser")) continue;
    return createHost((id) => runtime.__r(id), resolveModuleIds(source));
  }
  throw new Error("Paseo browser exports unavailable");
}
