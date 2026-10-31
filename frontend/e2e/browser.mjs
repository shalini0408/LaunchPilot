// Minimal Chrome DevTools Protocol driver: Node built-ins only, no app/test framework added.
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function waitFor(check, label = "condition", timeout = 15000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const value = await check();
      if (value) return value;
    } catch (e) {
      last = e;
    }
    await sleep(75);
  }
  throw Error(
    `Timed out waiting for ${label}${last ? ": " + last.message : ""}`,
  );
}
export class Browser {
  constructor(socket, child) {
    this.socket = socket;
    this.child = child;
    this.counter = 0;
    this.pending = new Map();
    this.listeners = [];
    socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (data.id) {
        const item = this.pending.get(data.id);
        if (!item) return;
        this.pending.delete(data.id);
        clearTimeout(item.timer);
        data.error
          ? item.reject(Error(data.error.message))
          : item.resolve(data.result);
      } else for (const listener of this.listeners) listener(data);
    });
  }
  send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++this.counter;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error(`CDP timeout: ${method}`));
      }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        }),
      );
    });
  }
  static async launch(binary, tempRoot) {
    const profile = await mkdtemp(join(tempRoot, "chrome-"));
    const child = spawn(
      binary,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-sync",
        "--disable-extensions",
        "--metrics-recording-only",
        "--remote-debugging-address=127.0.0.1",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let errors = "";
    child.stderr.on("data", (d) => {
      errors = (errors + d).slice(-2000);
    });
    const info = await waitFor(
      async () => {
        try {
          return await readFile(join(profile, "DevToolsActivePort"), "utf8");
        } catch {
          return null;
        }
      },
      "Chrome startup",
      20000,
    ).catch((error) => {
      child.kill();
      throw Error(error.message + " " + errors);
    });
    const [port, path] = info.trim().split("\n");
    const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new Browser(socket, child);
  }
  async page(url) {
    const { browserContextId } = await this.send("Target.createBrowserContext");
    const { targetId } = await this.send("Target.createTarget", {
      url: "about:blank",
      browserContextId,
    });
    const { sessionId } = await this.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    const page = new Page(this, sessionId, browserContextId);
    await page.command("Runtime.enable");
    await page.command("Page.enable");
    await page.command("Network.enable");
    await page.command("Network.setBlockedURLs", { urls: ["https://*"] });
    await page.command("Emulation.setDeviceMetricsOverride", {
      width: 1365,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.command("Page.navigate", { url });
    await page.wait(
      `document.querySelector('button,a')&&document.querySelector('h1')`,
      "application ready",
    );
    return page;
  }
  async close() {
    try {
      await this.send("Browser.close");
    } catch {}
    this.socket.close();
    this.child.kill();
  }
}
export class Page {
  constructor(browser, sessionId, contextId) {
    this.browser = browser;
    this.sessionId = sessionId;
    this.contextId = contextId;
    this.errors = [];
    browser.listeners.push((data) => {
      if (
        data.sessionId === sessionId &&
        data.method === "Runtime.exceptionThrown"
      )
        this.errors.push(
          data.params.exceptionDetails.exception?.description ||
            data.params.exceptionDetails.text,
        );
    });
  }
  command(method, params = {}) {
    return this.browser.send(method, params, this.sessionId);
  }
  async eval(expression) {
    const result = await this.command("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails)
      throw Error(
        result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text,
      );
    return result.result.value;
  }
  wait(expression, label, timeout) {
    return waitFor(() => this.eval(`Boolean(${expression})`), label, timeout);
  }
  async click(text, selector = "button") {
    const expression = `(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>(()=>{const copy=e.cloneNode(true);copy.querySelectorAll('[aria-hidden="true"]').forEach(n=>n.remove());return copy.textContent.trim()===${JSON.stringify(text)}||e.querySelector('h3')?.textContent.trim()===${JSON.stringify(text)}||e.getAttribute('aria-label')===${JSON.stringify(text)};})()&&!e.matches(':disabled')&&e.getClientRects().length);if(!e)return false;e.scrollIntoView({block:'center'});e.click();return true;})()`;
    await this.wait(expression, `click ${text}`);
    await sleep(80);
  }
  async clickSelector(selector) {
    await this.wait(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.matches(':disabled'))return false;e.scrollIntoView({block:'center'});e.click();return true;})()`,
      `click ${selector}`,
    );
    await sleep(80);
  }
  async fill(selector, value) {
    await this.wait(
      `!!document.querySelector(${JSON.stringify(selector)})`,
      `input ${selector}`,
    );
    await this.eval(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});e.focus();const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await sleep(40);
  }
  async select(selector, value) {
    await this.eval(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing select');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await sleep(75);
  }
  text(text, timeout = 15000) {
    return this.wait(
      `document.body.innerText.includes(${JSON.stringify(text)})`,
      `text ${text}`,
      timeout,
    );
  }
  async nav(name) {
    await this.wait(
      `(()=>{const e=[...document.querySelectorAll('nav[aria-label="Workspace"] button')].find(e=>e.textContent.includes(${JSON.stringify(name)})&&!e.disabled);if(!e)return false;e.click();return true;})()`,
      `navigation ${name}`,
    );
    await sleep(100);
  }
  async reload() {
    await this.command("Page.reload", { ignoreCache: true });
    await this.wait(
      `document.querySelector('fieldset')&&!document.querySelector('fieldset').disabled`,
      "refresh profile ready",
    );
    await sleep(150);
  }
  async screenshot(path) {
    await mkdir(join(path, ".."), { recursive: true });
    const { data } = await this.command("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    await writeFile(path, Buffer.from(data, "base64"));
  }
  async viewport(width, height) {
    await this.command("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 700,
    });
    await sleep(100);
  }
  async noOverflow() {
    const sizes = await this.eval(
      `({width:innerWidth,scroll:document.documentElement.scrollWidth})`,
    );
    if (sizes.scroll > sizes.width + 1)
      throw Error(`Horizontal overflow: ${JSON.stringify(sizes)}`);
  }
  async upload(path) {
    const { root } = await this.command("DOM.getDocument");
    const { nodeId } = await this.command("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: "input[type=file]",
    });
    await this.command("DOM.setFileInputFiles", { nodeId, files: [path] });
  }
  async close() {
    await this.browser.send("Target.disposeBrowserContext", {
      browserContextId: this.contextId,
    });
    if (this.errors.length)
      throw Error("Browser exceptions: " + this.errors.join("\n"));
  }
}
