import { App, openTab, openMobileFileById, showMessage } from "siyuan";
import { request, sql } from "./api";

/*
 * Keyboard "jump" navigator for the document tree.
 *
 * Idea borrowed from vim-style browser plugins: every visible entry gets a short
 * label, typing the label activates it. Labels are prefix-free (no label is a
 * prefix of another) so a match fires the instant it's complete, no timeouts.
 *
 * Data comes straight from the kernel API instead of scraping the doctree DOM,
 * so it works no matter whether the doctree is expanded, collapsed, or hidden.
 */

type ItemKind = "notebook" | "doc";

interface NavItem {
  kind: ItemKind;
  id: string;
  box: string;
  path: string; // doc: "/id1/id2.sy", notebook: "/"
  name: string;
  icon: string;
  childCount: number; // -1 = unknown
  hpath?: string; // search results only
}

interface RecentDoc {
  id: string;
  name: string;
  icon: string;
}

type Mode = "tree" | "search" | "searchHint";
export type JumpStartLocation = "root" | "last" | "current";
export type JumpPanelSize = "compact" | "large" | "fullscreen";

export interface JumpNavOptions {
  app: App;
  isMobile: boolean;
  i18n: Record<string, string>;
  hintChars: () => string;
  startLocation: () => JumpStartLocation;
  showRecent: () => boolean;
  panelSize: () => JumpPanelSize;
}

const DEFAULT_HINT_CHARS = "asdfghjklqwertyuiopzxcvbnm";

/**
 * Prefix-free labels, as many single-char ones as possible at the top so the
 * first entries of a level (usually the ones you want) are one keystroke away.
 */
export function makeHints(n: number, chars: string): string[] {
  const m = chars.length;
  if (n <= 0) return [];
  if (n <= m) return chars.slice(0, n).split("");
  for (let k = m - 1; k >= 0; k--) {
    const prefixes = m - k;
    const per = Math.ceil((n - k) / prefixes);
    if (per > m && k > 0) continue;
    const res = chars.slice(0, k).split("");
    const sub = makeHints(per, chars);
    let left = n - k;
    for (let p = 0; p < prefixes && left > 0; p++) {
      for (const s of sub) {
        if (left <= 0) break;
        res.push(chars[k + p] + s);
        left--;
      }
    }
    return res;
  }
  return [];
}

function normalizeHintChars(raw: string): string {
  const seen = new Set<string>();
  for (const ch of (raw || "").toLowerCase()) {
    if (/[a-z]/.test(ch)) seen.add(ch);
  }
  return seen.size >= 2 ? Array.from(seen).join("") : DEFAULT_HINT_CHARS;
}

// layout independent-ish: prefer the produced char, fall back to physical key
function letterOf(e: KeyboardEvent): string | null {
  if (e.key.length === 1 && /[a-z]/i.test(e.key)) return e.key.toLowerCase();
  const m = /^Key([A-Z])$/.exec(e.code);
  return m ? m[1].toLowerCase() : null;
}

function sqlStr(s: string): string {
  return s.replace(/'/g, "''");
}

function likeTerm(s: string): string {
  return sqlStr(s.replace(/[\\%_]/g, "\\$&"));
}

function iconFromIal(ial: string): string {
  const m = /icon="([^"]*)"/.exec(ial || "");
  return m ? m[1] : "";
}

// mirrors siyuan's unicode2Emoji, but builds DOM instead of html strings
function renderIcon(icon: string, fallback: string): HTMLElement {
  const span = document.createElement("span");
  span.className = "sf-jump__icon";
  const code = icon || fallback;
  if (code.startsWith("api/icon/getDynamicIcon") || code.includes(".")) {
    const img = document.createElement("img");
    img.src = code.startsWith("api/") ? code : `/emojis/${code}`;
    span.appendChild(img);
    return span;
  }
  try {
    span.textContent = code
      .split("-")
      .map((part) => String.fromCodePoint(parseInt(part, 16)))
      .join("");
  } catch {
    span.textContent = "📄";
  }
  return span;
}

function fallbackIcon(item: { kind: ItemKind; childCount: number }): string {
  if (item.kind === "notebook") return "1f5c3";
  return item.childCount > 0 ? "1f4d1" : "1f4c4";
}

export class JumpNav {
  private opts: JumpNavOptions;

  private root: HTMLElement | null = null;
  private panel: HTMLElement;
  private crumbsEl: HTMLElement;
  private inputEl: HTMLInputElement;
  private bodyEl: HTMLElement;
  private listEl: HTMLElement;
  private recentEl: HTMLElement;
  private footerEl: HTMLElement;
  private prevFocus: Element | null = null;

  private mode: Mode = "tree";
  private location: NavItem[] = [];
  private lastLocation: NavItem[] = [];
  private items: NavItem[] = [];
  private hints: string[] = [];
  private typed = "";
  private typedWithShift = false;
  private cursor = -1;
  private recent: RecentDoc[] = [];
  private loading = false;

  private token = 0;
  private searchTimer: number | null = null;
  private childCache = new Map<string, NavItem[]>();
  private notebooks: NavItem[] | null = null;

  constructor(opts: JumpNavOptions) {
    this.opts = opts;
  }

  private t(key: string, fallback: string): string {
    return this.opts.i18n?.[key] || fallback;
  }

  isOpen() {
    return !!this.root;
  }

  toggle() {
    if (this.isOpen()) this.close();
    else this.open();
  }

  async open() {
    if (this.root) return;
    this.childCache.clear();
    this.notebooks = null;
    this.mode = "tree";
    this.typed = "";
    this.cursor = -1;
    this.prevFocus = document.activeElement;
    this.buildDom();
    window.addEventListener("keydown", this.onKeydown, true);

    const start = this.opts.startLocation();
    if (start === "current" && this.getActiveDocId()) {
      await this.revealActive();
    } else {
      const loc = start === "last" ? this.lastLocation : [];
      await this.loadLevel(loc);
    }

    if (this.opts.showRecent()) this.loadRecent();
  }

  close(restoreFocus = true) {
    if (!this.root) return;
    this.token++;
    if (this.searchTimer) window.clearTimeout(this.searchTimer);
    window.removeEventListener("keydown", this.onKeydown, true);
    this.lastLocation = this.location.slice();
    this.root.remove();
    this.root = null;
    if (restoreFocus && this.prevFocus instanceof HTMLElement && this.prevFocus.isConnected) {
      this.prevFocus.focus();
    }
  }

  destroy() {
    this.close(false);
  }

  // ---------------------------------------------------------------- dom

  private buildDom() {
    const root = document.createElement("div");
    const size = this.opts.panelSize() || "large";
    root.className = `sf-jump sf-jump--${size}` + (this.opts.isMobile ? " sf-jump--mobile" : "");
    const siyuan = (window as any).siyuan;
    root.style.zIndex = String(siyuan?.zIndex ? ++siyuan.zIndex : 10000);
    root.addEventListener("mousedown", (e) => {
      if (e.target === root) this.close();
    });

    this.panel = document.createElement("div");
    this.panel.className = "sf-jump__panel";
    this.panel.tabIndex = -1;

    const head = document.createElement("div");
    head.className = "sf-jump__head";
    this.crumbsEl = document.createElement("div");
    this.crumbsEl.className = "sf-jump__crumbs";
    this.inputEl = document.createElement("input");
    this.inputEl.className = "b3-text-field sf-jump__input";
    this.inputEl.spellcheck = false;
    this.inputEl.addEventListener("focus", () => {
      if (this.mode === "tree") this.enterSearch();
      else if (this.mode === "searchHint") {
        this.mode = "search";
        this.render();
      }
    });
    this.inputEl.addEventListener("input", () => this.scheduleSearch());
    head.append(this.crumbsEl, this.inputEl);

    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "sf-jump__body";
    this.listEl = document.createElement("div");
    this.listEl.className = "sf-jump__list";
    this.recentEl = document.createElement("div");
    this.recentEl.className = "sf-jump__recent";
    this.bodyEl.append(this.listEl, this.recentEl);

    this.footerEl = document.createElement("div");
    this.footerEl.className = "sf-jump__footer";

    this.panel.append(head, this.bodyEl, this.footerEl);
    root.appendChild(this.panel);
    document.body.appendChild(root);
    this.root = root;
    this.panel.focus();
  }

  private render() {
    if (!this.root) return;
    this.renderCrumbs();
    this.renderList();
    this.renderRecent();
    this.renderFooter();
    this.inputEl.placeholder = `/  ${this.t("jumpSearchIn", "Search in")} ${this.scopeName()}`;
  }

  private scopeName(): string {
    const last = this.location[this.location.length - 1];
    return last ? `“${last.name}”` : this.t("jumpEverywhere", "all notebooks");
  }

  private renderCrumbs() {
    this.crumbsEl.textContent = "";
    const add = (label: string, depth: number, iconItem?: NavItem) => {
      const c = document.createElement("span");
      c.className = "sf-jump__crumb";
      if (iconItem) c.appendChild(renderIcon(iconItem.icon, fallbackIcon(iconItem)));
      const text = document.createElement("span");
      text.textContent = label;
      c.appendChild(text);
      c.addEventListener("click", () => {
        this.exitSearch(false);
        this.loadLevel(this.location.slice(0, depth), this.location[depth]?.id);
      });
      this.crumbsEl.appendChild(c);
    };
    add("⌂", 0);
    this.location.forEach((item, i) => {
      const sep = document.createElement("span");
      sep.className = "sf-jump__sep";
      sep.textContent = "›";
      this.crumbsEl.appendChild(sep);
      add(item.name, i + 1, item);
    });
    this.crumbsEl.scrollLeft = this.crumbsEl.scrollWidth;
  }

  private renderList() {
    const list = this.listEl;
    list.textContent = "";
    const showHints = this.mode !== "search";

    // "open the folder note itself" row
    const parent = this.location[this.location.length - 1];
    if (this.mode === "tree" && parent?.kind === "doc") {
      const row = document.createElement("div");
      row.className = "sf-jump__self";
      const key = document.createElement("span");
      key.className = "sf-jump__hint sf-jump__hint--key";
      key.textContent = "⏎";
      const label = document.createElement("span");
      label.className = "sf-jump__name";
      label.textContent = `${this.t("jumpOpenThis", "Open")} “${parent.name}”`;
      row.append(key, renderIcon(parent.icon, fallbackIcon(parent)), label);
      row.addEventListener("click", () => this.openDoc(parent.id));
      list.appendChild(row);
    }

    if (this.loading && this.items.length === 0) {
      list.appendChild(this.emptyNote(this.t("jumpLoading", "Loading…")));
      return;
    }
    if (this.items.length === 0) {
      const msg =
        this.mode === "tree"
          ? this.t("jumpEmpty", "Nothing here")
          : this.inputEl.value.trim()
            ? this.t("jumpNoResult", "No matching document")
            : this.t("jumpTypeToSearch", "Type to search document titles and paths");
      list.appendChild(this.emptyNote(msg));
      return;
    }

    const grid = document.createElement("div");
    grid.className = "sf-jump__grid";
    const n = this.items.length;
    // fill the available height first, then spill into more columns
    const maxCols = this.opts.isMobile ? 1 : Math.max(1, Math.floor(this.listEl.clientWidth / 240));
    const fitRows = Math.max(12, Math.floor((this.listEl.clientHeight - 16) / 31));
    const cols = this.mode === "tree" ? Math.min(maxCols, Math.ceil(n / fitRows)) : 1;
    const rows = Math.ceil(n / cols);
    grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    grid.style.gridTemplateRows = `repeat(${rows}, auto)`;

    this.items.forEach((item, i) => {
      const row = document.createElement("div");
      row.className = "sf-jump__item";
      if (i === this.cursor) row.classList.add("sf-jump__item--cursor");

      const hint = this.hints[i] ?? "";
      if (showHints) {
        const badge = document.createElement("span");
        badge.className = "sf-jump__hint";
        if (this.typed && hint.startsWith(this.typed)) {
          const done = document.createElement("span");
          done.className = "sf-jump__hint-done";
          done.textContent = hint.slice(0, this.typed.length);
          badge.append(done, hint.slice(this.typed.length));
        } else {
          badge.textContent = hint;
        }
        if (this.typed && !hint.startsWith(this.typed)) row.classList.add("sf-jump__item--dim");
        row.appendChild(badge);
      }

      row.appendChild(renderIcon(item.icon, fallbackIcon(item)));

      const textWrap = document.createElement("span");
      textWrap.className = "sf-jump__text";
      const name = document.createElement("span");
      name.className = "sf-jump__name";
      name.textContent = item.name;
      textWrap.appendChild(name);
      if (item.hpath !== undefined) {
        const p = document.createElement("span");
        p.className = "sf-jump__path";
        p.textContent = item.hpath.slice(0, item.hpath.lastIndexOf("/")) || "/";
        textWrap.appendChild(p);
      }
      row.appendChild(textWrap);

      if (item.kind === "notebook" || item.childCount > 0) {
        const more = document.createElement("span");
        more.className = "sf-jump__more";
        more.textContent = item.childCount > 0 ? `${item.childCount} ›` : "›";
        row.appendChild(more);
      }

      row.title = item.hpath ?? item.name;
      row.addEventListener("click", (e) => this.activate(item, e.shiftKey));
      grid.appendChild(row);
    });
    list.appendChild(grid);

    const cur = grid.children[this.cursor] as HTMLElement | undefined;
    cur?.scrollIntoView({ block: "nearest" });
  }

  private emptyNote(text: string) {
    const d = document.createElement("div");
    d.className = "sf-jump__empty";
    d.textContent = text;
    return d;
  }

  private recentVisible() {
    return this.mode === "tree" && this.location.length === 0 && this.opts.showRecent() && this.recent.length > 0;
  }

  private renderRecent() {
    const el = this.recentEl;
    el.textContent = "";
    el.style.display = this.recentVisible() ? "" : "none";
    if (!this.recentVisible()) return;
    const title = document.createElement("div");
    title.className = "sf-jump__recent-title";
    title.textContent = this.t("jumpRecent", "Recent");
    el.appendChild(title);
    this.recent.forEach((doc, i) => {
      const row = document.createElement("div");
      row.className = "sf-jump__item";
      const badge = document.createElement("span");
      badge.className = "sf-jump__hint sf-jump__hint--key";
      badge.textContent = String(i + 1);
      const name = document.createElement("span");
      name.className = "sf-jump__name";
      name.textContent = doc.name;
      row.append(badge, renderIcon(doc.icon, "1f4c4"), name);
      row.title = doc.name;
      row.addEventListener("click", () => this.openDoc(doc.id));
      el.appendChild(row);
    });
  }

  private renderFooter() {
    const keys: [string, string][] =
      this.mode === "search"
        ? [
          ["↑↓", this.t("jumpKeySelect", "select")],
          ["⏎", this.t("jumpKeyOpen", "open")],
          ["⇧⏎", this.t("jumpKeyLocate", "locate in tree")],
          ["Tab", this.t("jumpKeyHintResults", "label results")],
          ["Esc", this.t("jumpKeyBack", "back")],
        ]
        : this.mode === "searchHint"
          ? [
            ["a-z", this.t("jumpKeyOpen", "open")],
            ["⇧+a-z", this.t("jumpKeyLocate", "locate in tree")],
            ["⌫", this.t("jumpKeyEditQuery", "edit query")],
            ["Esc", this.t("jumpKeyBack", "back")],
          ]
          : [
            ["a-z", this.t("jumpKeyEnter", "enter / open")],
            ["⇧+a-z", this.t("jumpKeyForceOpen", "open even if it has children")],
            ["⌫", this.t("jumpKeyUp", "up")],
            ["/", this.t("jumpKeySearch", "search here")],
            [".", this.t("jumpKeyCurrent", "current doc")],
            ...(this.recentVisible() ? [["1-9", this.t("jumpRecent", "Recent")] as [string, string]] : []),
            ["Esc", this.t("jumpKeyClose", "close")],
          ];
    this.footerEl.textContent = "";
    for (const [k, desc] of keys) {
      const item = document.createElement("span");
      const kbd = document.createElement("kbd");
      kbd.textContent = k;
      item.append(kbd, " " + desc);
      this.footerEl.appendChild(item);
    }
  }

  private setItems(items: NavItem[], cursor = -1) {
    this.items = items;
    this.hints = makeHints(items.length, normalizeHintChars(this.opts.hintChars()));
    this.typed = "";
    this.typedWithShift = false;
    this.cursor = cursor;
    this.render();
  }

  // ---------------------------------------------------------------- data

  private async fetchNotebooks(): Promise<NavItem[]> {
    if (this.notebooks) return this.notebooks;
    const res = await request("/api/notebook/lsNotebooks", {});
    this.notebooks = (res?.notebooks ?? [])
      .filter((nb: any) => !nb.closed)
      .map((nb: any) => ({
        kind: "notebook",
        id: nb.id,
        box: nb.id,
        path: "/",
        name: nb.name,
        icon: nb.icon || "",
        childCount: -1,
      }));
    return this.notebooks;
  }

  private async fetchChildren(loc: NavItem[]): Promise<NavItem[]> {
    const parent = loc[loc.length - 1];
    if (!parent) return this.fetchNotebooks();
    const key = `${parent.box}:${parent.path}`;
    const cached = this.childCache.get(key);
    if (cached) return cached;
    const res = await request("/api/filetree/listDocsByPath", {
      notebook: parent.box,
      path: parent.path,
      maxListCount: 0,
      ignoreMaxListHint: true,
      app: (this.opts.app as any)?.appId,
    });
    const children: NavItem[] = (res?.files ?? []).map((f: any) => ({
      kind: "doc",
      id: f.id,
      box: parent.box,
      path: f.path,
      name: f.name?.replace(/\.sy$/, "") ?? f.id,
      icon: f.icon || "",
      childCount: f.subFileCount ?? 0,
    }));
    this.childCache.set(key, children);
    return children;
  }

  private async loadLevel(loc: NavItem[], selectId?: string) {
    const token = ++this.token;
    this.location = loc.slice();
    this.loading = true;
    this.items = [];
    this.render();
    let children: NavItem[] = [];
    try {
      children = await this.fetchChildren(loc);
    } catch (err) {
      console.error("jump nav: failed to list documents", err);
    }
    if (token !== this.token || !this.root) return;
    this.loading = false;
    const cursor = selectId ? children.findIndex((c) => c.id === selectId) : -1;
    this.setItems(children, cursor);
  }

  private async loadRecent() {
    try {
      const res = await request("/api/storage/getRecentDocs", {});
      const activeId = this.getActiveDocId();
      this.recent = (Array.isArray(res) ? res : [])
        .filter((d: any) => d.rootID && d.rootID !== activeId)
        .slice(0, 9)
        .map((d: any) => ({ id: d.rootID, name: d.title || d.rootID, icon: d.icon || "" }));
    } catch (err) {
      console.error("jump nav: failed to load recent docs", err);
      this.recent = [];
    }
    if (this.root) {
      this.renderRecent();
      this.renderFooter();
    }
  }

  /** notebook + all ancestor docs of `path` (inclusive of the doc itself) */
  private async buildChain(box: string, path: string): Promise<NavItem[]> {
    const notebooks = await this.fetchNotebooks();
    const nb = notebooks.find((n) => n.box === box);
    if (!nb) return [];
    const ids = path.replace(/\.sy$/, "").split("/").filter(Boolean);
    if (ids.length === 0) return [nb];
    const rows = await sql(
      `SELECT id, content, path, ial FROM blocks WHERE type='d' AND id IN (${ids
        .map((id) => `'${sqlStr(id)}'`)
        .join(",")}) LIMIT ${ids.length}`
    );
    const byId = new Map<string, any>((rows ?? []).map((r: any) => [r.id, r]));
    const chain: NavItem[] = [nb];
    for (const id of ids) {
      const r = byId.get(id);
      if (!r) break;
      chain.push({
        kind: "doc",
        id,
        box,
        path: r.path,
        name: r.content,
        icon: iconFromIal(r.ial),
        childCount: -1,
      });
    }
    return chain;
  }

  private getActiveDocId(): string | null {
    const selectors = this.opts.isMobile
      ? ["#editor .protyle-title[data-node-id]", "#editor .protyle-background[data-node-id]"]
      : [
        ".layout__wnd--active .protyle:not(.fn__none) .protyle-title[data-node-id]",
        ".layout__wnd--active .protyle:not(.fn__none) .protyle-background[data-node-id]",
        ".protyle:not(.fn__none) .protyle-title[data-node-id]",
        ".protyle:not(.fn__none) .protyle-background[data-node-id]",
      ];
    for (const s of selectors) {
      const id = document.querySelector(s)?.getAttribute("data-node-id");
      if (id) return id;
    }
    return null;
  }

  /**
   * Show the level that contains `id`, with it selected.
   * When `inside` is set and the doc has children, show its children instead.
   */
  private async locate(id: string, inside: boolean) {
    const token = ++this.token;
    const res = await request("/api/filetree/getPathByID", { id });
    if (token !== this.token || !this.root) return;
    if (!res?.notebook) {
      showMessage(this.t("jumpNotFound", "Can't locate this document"), 3000, "error");
      return;
    }
    const chain = await this.buildChain(res.notebook, res.path);
    if (token !== this.token || !this.root || chain.length === 0) return;
    if (inside) {
      const kids = await this.fetchChildren(chain);
      if (token !== this.token || !this.root) return;
      if (kids.length > 0) {
        await this.loadLevel(chain);
        return;
      }
    }
    await this.loadLevel(chain.slice(0, -1), id);
  }

  private async revealActive() {
    const id = this.getActiveDocId();
    if (!id) {
      showMessage(this.t("jumpNoActiveDoc", "No document is open"), 2000);
      return;
    }
    this.exitSearch(false);
    await this.locate(id, false);
  }

  // ---------------------------------------------------------------- search

  private enterSearch() {
    if (this.mode === "search") return;
    this.mode = "search";
    this.inputEl.value = "";
    this.setItems([], -1);
    this.inputEl.focus();
  }

  /** leave search, back to the tree level we were on */
  private exitSearch(reload = true) {
    if (this.mode === "tree") return;
    if (this.searchTimer) window.clearTimeout(this.searchTimer);
    this.mode = "tree";
    this.inputEl.value = "";
    this.inputEl.blur();
    this.panel.focus();
    if (reload) this.loadLevel(this.location);
  }

  private scheduleSearch() {
    if (this.searchTimer) window.clearTimeout(this.searchTimer);
    this.searchTimer = window.setTimeout(() => this.runSearch(), 120);
  }

  private async runSearch() {
    const query = this.inputEl.value.trim();
    const terms = query.split(/\s+/).filter(Boolean);
    const token = ++this.token;
    if (terms.length === 0) {
      this.setItems([], -1);
      return;
    }

    const where = ["type='d'"];
    const parent = this.location[this.location.length - 1];
    if (parent) {
      where.push(`box='${sqlStr(parent.box)}'`);
      if (parent.kind === "doc") {
        where.push(`path LIKE '${likeTerm(parent.path.replace(/\.sy$/, "/"))}%' ESCAPE '\\'`);
      }
    }
    for (const t of terms) {
      const l = likeTerm(t);
      where.push(`(content LIKE '%${l}%' ESCAPE '\\' OR hpath LIKE '%${l}%' ESCAPE '\\')`);
    }

    let rows: any[] = [];
    try {
      rows = (await sql(
        `SELECT id, box, path, hpath, content, ial FROM blocks WHERE ${where.join(" AND ")} LIMIT 300`
      )) ?? [];
    } catch (err) {
      console.error("jump nav: search failed", err);
    }
    if (token !== this.token || !this.root || this.mode === "tree") return;

    const openBoxes = new Set((await this.fetchNotebooks()).map((n) => n.box));
    const lowered = terms.map((t) => t.toLowerCase());
    const scored = rows
      .filter((r) => openBoxes.has(r.box))
      .map((r) => {
        const title = String(r.content ?? "").toLowerCase();
        const hpath = String(r.hpath ?? "").toLowerCase();
        let score = 0;
        for (const t of lowered) {
          if (title === t) score += 30;
          else if (title.startsWith(t)) score += 20;
          else if (title.includes(t)) score += 12;
          else if (hpath.includes(t)) score += 3;
        }
        score -= hpath.split("/").length * 0.5;
        return { r, score };
      })
      .sort((a, b) => b.score - a.score || a.r.hpath.length - b.r.hpath.length)
      .slice(0, 60);

    const items: NavItem[] = scored.map(({ r }) => ({
      kind: "doc",
      id: r.id,
      box: r.box,
      path: r.path,
      name: r.content,
      icon: iconFromIal(r.ial),
      childCount: -1,
      hpath: r.hpath,
    }));
    this.setItems(items, items.length ? 0 : -1);
  }

  // ---------------------------------------------------------------- actions

  private activate(item: NavItem, shift: boolean) {
    if (this.mode !== "tree") {
      // search results: open by default, shift = show where it lives
      if (shift) {
        this.exitSearch(false);
        this.locate(item.id, true);
      } else {
        this.openDoc(item.id);
      }
      return;
    }
    if (item.kind === "notebook") {
      this.loadLevel([...this.location, item]);
    } else if (shift || item.childCount <= 0) {
      this.openDoc(item.id);
    } else {
      this.loadLevel([...this.location, item]);
    }
  }

  private goUp() {
    if (this.location.length === 0) return;
    const leaving = this.location[this.location.length - 1];
    this.loadLevel(this.location.slice(0, -1), leaving.id);
  }

  private openDoc(id: string, right = false) {
    this.close(false);
    if (this.opts.isMobile) {
      openMobileFileById(this.opts.app, id);
    } else {
      openTab({ app: this.opts.app, doc: { id }, ...(right ? { position: "right" as const } : {}) });
    }
  }

  private moveCursor(delta: number) {
    if (this.items.length === 0) return;
    if (this.cursor < 0) this.cursor = delta > 0 ? 0 : this.items.length - 1;
    else this.cursor = (this.cursor + delta + this.items.length) % this.items.length;
    this.renderList();
  }

  // ---------------------------------------------------------------- keys

  private consume(e: KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  private onKeydown = (e: KeyboardEvent) => {
    if (!this.root) return;
    if (e.isComposing || e.keyCode === 229) {
      e.stopPropagation();
      return;
    }
    // leave real shortcuts (incl. our own toggle hotkey) to siyuan
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if (this.mode === "search" && e.ctrlKey && (e.key === "n" || e.key === "p")) {
        this.consume(e);
        this.moveCursor(e.key === "n" ? 1 : -1);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        const item = this.items[this.cursor];
        if (item && item.kind === "doc") {
          this.consume(e);
          this.openDoc(item.id, true);
        }
      }
      return;
    }

    if (this.mode === "search") this.onSearchKey(e);
    else this.onHintKey(e);
  };

  private onSearchKey(e: KeyboardEvent) {
    switch (e.key) {
      case "Escape":
        this.consume(e);
        this.exitSearch();
        return;
      case "ArrowDown":
        this.consume(e);
        this.moveCursor(1);
        return;
      case "ArrowUp":
        this.consume(e);
        this.moveCursor(-1);
        return;
      case "Enter": {
        this.consume(e);
        const item = this.items[this.cursor] ?? this.items[0];
        if (item) this.activate(item, e.shiftKey);
        return;
      }
      case "Tab":
        this.consume(e);
        if (this.items.length) {
          this.mode = "searchHint";
          this.inputEl.blur();
          this.panel.focus();
          this.typed = "";
          this.render();
        }
        return;
    }
    // plain typing goes to the input; just keep it away from siyuan's handlers
    e.stopPropagation();
  }

  private onHintKey(e: KeyboardEvent) {
    const key = e.key;

    if (key === "Escape") {
      this.consume(e);
      if (this.typed) {
        this.typed = "";
        this.renderList();
      } else if (this.mode === "searchHint") {
        this.exitSearch();
      } else {
        this.close();
      }
      return;
    }

    if (key === "Backspace") {
      this.consume(e);
      if (this.typed) {
        this.typed = this.typed.slice(0, -1);
        this.renderList();
      } else if (this.mode === "searchHint") {
        this.mode = "search";
        this.inputEl.focus();
        this.render();
      } else {
        this.goUp();
      }
      return;
    }

    if (key === "Enter") {
      this.consume(e);
      const item = this.items[this.cursor];
      const parent = this.location[this.location.length - 1];
      if (item) this.activate(item, item.kind === "doc");
      else if (this.mode === "tree" && parent?.kind === "doc") this.openDoc(parent.id);
      return;
    }

    if (key === "ArrowDown" || key === "ArrowUp") {
      this.consume(e);
      this.moveCursor(key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (key === "ArrowRight" && this.mode === "tree") {
      this.consume(e);
      const item = this.items[this.cursor];
      if (item && (item.kind === "notebook" || item.childCount > 0)) this.activate(item, false);
      return;
    }
    if (key === "ArrowLeft" && this.mode === "tree") {
      this.consume(e);
      this.goUp();
      return;
    }

    if (key === "/" && this.mode === "tree") {
      this.consume(e);
      this.enterSearch();
      return;
    }

    if (key === "." && this.mode === "tree") {
      this.consume(e);
      this.revealActive();
      return;
    }

    if (/^[1-9]$/.test(key) && this.recentVisible()) {
      this.consume(e);
      const doc = this.recent[Number(key) - 1];
      if (doc) this.openDoc(doc.id);
      return;
    }

    const letter = letterOf(e);
    if (letter) {
      this.consume(e);
      if (this.loading) return;
      const next = this.typed + letter;
      const idx = this.hints.indexOf(next);
      if (idx >= 0) {
        const shift = e.shiftKey || this.typedWithShift;
        this.typed = "";
        this.typedWithShift = false;
        this.activate(this.items[idx], shift);
        return;
      }
      if (this.hints.some((h) => h.startsWith(next))) {
        this.typed = next;
        this.typedWithShift = this.typedWithShift || e.shiftKey;
      } else {
        // dead end: start over instead of getting stuck
        this.typed = "";
        this.typedWithShift = false;
        this.panel.classList.remove("sf-jump__panel--miss");
        void this.panel.offsetWidth;
        this.panel.classList.add("sf-jump__panel--miss");
      }
      this.renderList();
      return;
    }

    // keep every other plain key away from the editor / siyuan hotkeys
    if (key !== "Shift") this.consume(e);
  }
}
