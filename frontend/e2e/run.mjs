import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile, unlink, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import { Browser, sleep, waitFor } from "./browser.mjs";
const scenarioFilter = process.env.E2E_SCENARIOS || process.argv[2];
const root = fileURLToPath(new URL("../../", import.meta.url)),
  artifacts = join(root, "frontend/e2e/artifacts");
const scratch = await mkdtemp(join(tmpdir(), "launchpilot-e2e-"));
const chrome =
  process.env.CHROME_BIN ||
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find(existsSync);
if (!chrome)
  throw Error(
    "Chrome/Chromium is required. Set CHROME_BIN to its executable. No browser is downloaded automatically.",
  );
async function port() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const p = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return p;
}
const apiPort = await port(),
  uiPort = await port(),
  apiBase = `http://127.0.0.1:${apiPort}`,
  base = `http://127.0.0.1:${uiPort}`;
const children = [];
let browser;
let activeCookie = "";
const logs = [];
const results = [];
function start(command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  child.stdout.on("data", (d) => logs.push(d.toString()));
  child.stderr.on("data", (d) => logs.push(d.toString()));
  return child;
}
async function api(path, method = "GET", body) {
  const response = await fetch(apiBase + path, {
    method,
    headers: { "Content-Type": "application/json", Cookie: activeCookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok)
    throw Error(
      `${method} ${path}: ${response.status} ${await response.text()}`,
    );
  return response.json();
}
async function profile() {
  const projects = await api("/api/projects");
  return api(`/api/businesses/${projects[0].id}`);
}
async function captureCookie(page) {
  const data = await page.command("Network.getCookies");
  activeCookie = data.cookies
    .filter((c) => c.name === "launchpilot_session")
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}
async function signup(page, email) {
  await page.click("Sign Up ↗", "a");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Flow-test-password-6349!");
  await page.click("Sign Up →");
  await page.text("Where are you in your business journey?");
  await captureCookie(page);
}
async function signin(page, email) {
  await page.click("Sign In", "a");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Flow-test-password-6349!");
  await page.click("Sign In →");
  await page.text("Log Out");
  await captureCookie(page);
}
async function confirmDiscovery(page) {
  await page.click("Review business details");
  assert(
    !(await page.eval(
      "document.querySelector('[aria-label=\"Review proposed changes\"]').innerText.includes('[object Object]')",
    )),
  );
  await page.click("Confirm changes");
  await page.wait(
    `!document.querySelector('[aria-label="Review proposed changes"]')`,
    "confirmed facts",
  );
  await page.wait(
    `!document.querySelector('fieldset')?.disabled`,
    "saved facts",
  );
}
async function coffee(page) {
  await page.clickSelector(".journey-option.exploring");
  await page.fill(
    '[aria-label="Describe your business idea"]',
    "I want to open a coffee shop, but I am not sure which model or location to choose.",
  );
  await page.click("Send →");
  await confirmDiscovery(page);
  await page.fill(
    '[aria-label="Describe your business idea"]',
    "My budget is USD 20000. I am considering Richmond, Virginia, USA and serving commuters.",
  );
  await page.click("Send →");
  await confirmDiscovery(page);
  await page.click("Compare business models with AI");
  await page.text("AI comparison based on your saved details.");
  for (const name of [
    "Traditional storefront",
    "Coffee kiosk",
    "Mobile coffee cart",
  ])
    await page.text(name);
  await page.click("Choose Mobile coffee cart");
  await page.click("Confirm changes");
  await page.wait(
    `!document.querySelector('[aria-label="Review proposed changes"]')`,
    "model confirmed",
  );
}
async function openTask(page, title) {
  await page.wait(
    `(()=>{const step=[...document.querySelectorAll('.step')].find(s=>s.querySelector('strong')?.textContent===${JSON.stringify(title)});if(!step)return false;step.querySelector('button').click();return true;})()`,
    `guide ${title}`,
  );
  await sleep(150);
}
async function mobile(page, name) {
  await sleep(400);
  for (const width of [390, 768]) {
    await page.viewport(width, 844);
    await page.noOverflow();
    await page.eval("window.scrollTo(0,0)");
    await page.screenshot(join(artifacts, `${name}-${width}.png`));
  }
  await page.viewport(1365, 1000);
}
await mkdir(artifacts, { recursive: true });
try {
  start(
    process.env.PYTHON_BIN || join(root, ".venv/bin/python"),
    [
      "-m",
      "uvicorn",
      "server:app",
      "--app-dir",
      "tests/e2e",
      "--host",
      "127.0.0.1",
      "--port",
      String(apiPort),
      "--no-access-log",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        PYTHONPATH: root,
        LAUNCHPILOT_E2E: "1",
        LAUNCHPILOT_E2E_ROOT: scratch,
        DATABASE_URL: "sqlite:///" + join(scratch, "test.db"),
        CORS_ORIGINS: base,
      },
    },
  );
  start(
    process.execPath,
    [
      join(root, "frontend/node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      String(uiPort),
      "--strictPort",
    ],
    {
      cwd: join(root, "frontend"),
      env: { ...process.env, VITE_API_PROXY: apiBase },
    },
  );
  await waitFor(
    async () => {
      try {
        return (
          (await fetch(apiBase + "/api/health")).ok && (await fetch(base)).ok
        );
      } catch {
        return false;
      }
    },
    "isolated frontend/backend startup",
    20000,
  );
  browser = await Browser.launch(chrome, scratch);
  const scenarios = [
    [
      "A-ready-software-virginia-task-advisor",
      async (page) => {
        await signup(page, "ready@example.com");
        assert.equal(
          await page.eval(
            "document.querySelectorAll('.journey-options>button').length",
          ),
          2,
        );
        await page.clickSelector(".journey-option.known");
        await page.text("Your business details");
        await page.fill("input[name=name]", "Pocket App");
        await page.fill(
          "textarea[name=idea]",
          "A software application for appointment bookings",
        );
        await page.fill("input[name=industry]", "Software company");
        await page.fill("input[name=city]", "Richmond");
        await page.fill("input[name=state]", "Virginia");
        await page.fill("input[name=founders]", "2");
        await page.fill(
          "textarea[name=owners]",
          "Two cofounders, ownership details still under discussion",
        );
        await page.select("select[name=registered]", "not_formed");
        await page.click("Save and open my roadmap →");
        await page.text("Your launch roadmap");
        const b = await profile();
        assert(b.launch_ready);
        assert.equal(b.legal_structure, "");
        assert(b.roadmap.some((t) => t.title.includes("privacy")));
        assert(!b.roadmap.some((t) => t.title.includes("food")));
        assert(b.roadmap.every((t) => t.guide.goal.includes("Virginia")));
        await openTask(page, "Review entity registration, if appropriate");
        await page.fill(
          '[aria-label="Ask a question"]',
          "Can you explain this in simpler terms?",
        );
        await page.click("Send ↗");
        await page.text("For Pocket App in Virginia");
        assert.equal(
          await page.eval(
            "document.querySelectorAll('.task-guide-main>section').length",
          ),
          4,
        );
        await page.click("Find official resources");
        await page.text("Open verified official application page", 20000);
        await page.click("See a preparation worksheet example", "summary");
        await page.text("PREPARATION WORKSHEET");
        assert.equal(await page.eval("document.querySelectorAll('.example-paper').length"), 1);
        await mobile(page, "single-task");
        await page.screenshot(join(artifacts, "single-task-desktop.png"));
        assert.equal(
          (
            await api("/api/projects", "POST").catch((e) => ({
              rejected: true,
            }))
          ).rejected,
          true,
        );
      },
    ],
    [
      "B-coffee-discovery-keep-exploring",
      async (page) => {
        await signup(page, "explore@example.com");
        await page.click("Log Out");
        await signin(page, "explore@example.com");
        await page.text("Where are you in your business journey?");
        await coffee(page);
        await page.click("Keep Exploring");
        const b = await profile();
        assert(!b.launch_ready);
        assert.equal(b.roadmap.length, 0);
        assert(
          !(await page.eval(
            "[...document.querySelectorAll('nav button')].some(e=>e.textContent==='My roadmap')",
          )),
        );
        const history = await api(`/api/businesses/${b.id}/discovery`);
        assert.equal(history.conversation.messages.length, 4);
        await page.reload();
        await page.text("Costs and customer demand are not verified.");
        await page.text("Continue to Launch");
        assert.equal(await page.eval("document.querySelectorAll('.answer-option').length"), 3);
        await mobile(page, "single-discovery");
        await page.screenshot(join(artifacts, "single-discovery-desktop.png"));
      },
    ],
    [
      "C-coffee-continue-to-personalized-roadmap",
      async (page) => {
        await signup(page, "launch-coffee@example.com");
        await coffee(page);
        await page.click("Keep Exploring");
        await page.click("Continue to Launch");
        await page.text("Your launch roadmap");
        const b = await profile();
        assert(b.launch_ready);
        assert.equal(b.business_model, "mobile_cart");
        assert(b.roadmap.some((t) => t.title.includes("mobile")));
        assert(b.roadmap.some((t) => t.title.includes("food")));
        await page.clickSelector(
          `input[aria-label=${JSON.stringify("Mark " + b.roadmap[0].title + " complete")}]`,
        );
        await page.reload();
        await page.text("Your launch roadmap");
        assert((await profile()).roadmap[0].completed);
        assert.equal((await api("/api/projects")).length, 1);
      },
    ],
    [
      "D-logout-resume-progress-history-and-isolation",
      async (page) => {
        await signup(page, "resume@example.com");
        await coffee(page);
        await page.click("Continue to Launch");
        await page.text("Your launch roadmap");
        let b = await profile();
        await page.clickSelector(
          `input[aria-label=${JSON.stringify("Mark " + b.roadmap[0].title + " complete")}]`,
        );
        await openTask(page, "Review entity registration, if appropriate");
        await page.fill(
          '[aria-label="Ask a question"]',
          "Explain this step simply",
        );
        await page.click("Send ↗");
        await page.text("For Coffee Corner in Virginia");
        const task = b.roadmap.find((t) => t.stable_key === "common:formation");
        await waitFor(
          async () =>
            (await api("/api/projects"))[0].last_path === "#task/" + task.id,
          "persisted task route",
        );
        await page.click("Log Out");
        await page.text("From Business Idea");
        await signin(page, "resume@example.com");
        await page.text("For Coffee Corner in Virginia");
        assert.equal(await page.eval("location.hash"), "#task/" + task.id);
        b = await profile();
        assert(b.roadmap[0].completed);
        const originalCookie = activeCookie;
        const other = await browser.page(base);
        await signup(other, "other@example.com");
        for (const suffix of [
          "",
          "/roadmap",
          "/discovery",
          "/advisor/conversation",
          "/documents",
          "/research/status",
        ])
          assert.equal(
            await other.eval(
              `fetch('/api/businesses/${b.id}${suffix}').then(r=>r.status)`,
            ),
            404,
          );
        await other.close();
        activeCookie = originalCookie;
        assert(
          !(await page.eval(
            "document.body.innerText.includes('Business projects')",
          )),
        );
      },
    ],
    [
      "E-ai-failure-visible-and-retry-persists-once",
      async (page) => {
        await signup(page, "failure@example.com");
        await page.clickSelector(".journey-option.exploring");
        await api("/__test/mode", "POST", { mode: "provider_failure" });
        await page.fill(
          '[aria-label="Describe your business idea"]',
          "I want to open a coffee shop",
        );
        await page.click("Send →");
        await page.text("HTTP 429");
        assert(
          !(await page.eval("document.body.innerText.includes('Guided demo')")),
        );
        assert.equal((await profile()).industry, "");
        await api("/__test/mode", "POST", { mode: "normal" });
        await page.click("Send →");
        await confirmDiscovery(page);
        await page.fill(
          '[aria-label="Describe your business idea"]',
          "My budget is USD 20000 in Richmond, Virginia, USA for commuters",
        );
        await page.click("Send →");
        await confirmDiscovery(page);
        await page.click("Continue to Launch");
        await page.text("Your launch roadmap");
        await openTask(page, "Review entity registration, if appropriate");
        await api("/__test/mode", "POST", { mode: "provider_failure" });
        await page.fill(
          '[aria-label="Ask a question"]',
          "Explain this step simply",
        );
        await page.click("Send ↗");
        await page.text("HTTP 429");
        await api("/__test/mode", "POST", { mode: "normal" });
        await page.click("Retry message");
        await page.text("For Coffee Corner in Virginia");
        const b = await profile(),
          task = b.roadmap.find((t) => t.stable_key === "common:formation");
        const history = await api(
          `/api/businesses/${b.id}/advisor/conversation?scope=task:${task.id}`,
        );
        assert.equal(history.messages.length, 2);
        await page.reload();
        await page.text("For Coffee Corner in Virginia");
      },
    ],
  ];
  const selectedScenarios = scenarioFilter
    ? scenarios.filter(([name]) =>
        scenarioFilter.split(",").some((prefix) => name.startsWith(prefix)),
      )
    : scenarios;
  if (!selectedScenarios.length) throw Error("No matching E2E scenarios");
  for (const [name, scenario] of selectedScenarios) {
    let page;
    try {
      await api("/__test/reset", "POST", { mode: "normal" });
      page = await browser.page(base);
      await scenario(page);
      await page.noOverflow();
      await page.close();
      page = null;
      for (const extension of ["png", "txt"])
        await unlink(join(artifacts, `${name}-failure.${extension}`)).catch(
          () => {},
        );
      results.push({ name, status: "passed" });
      console.log(`PASS ${name}`);
    } catch (error) {
      if (page) {
        try {
          await page.screenshot(join(artifacts, name + "-failure.png"));
          await writeFile(
            join(artifacts, name + "-failure.txt"),
            await page.eval("document.body.innerText"),
          );
          await page.close();
        } catch {}
      }
      results.push({ name, status: "failed", error: error.message });
      console.error(`FAIL ${name}: ${error.message}`);
    }
  }
  await writeFile(
    join(artifacts, scenarioFilter ? "report-targeted.json" : "report.json"),
    JSON.stringify(
      { scenarios: results, mockedExternalAPIs: true, isolatedDatabase: true },
      null,
      2,
    ) + "\n",
  );
  if (results.some((r) => r.status === "failed")) process.exitCode = 1;
  console.log(
    `${results.filter((r) => r.status === "passed").length}/${results.length} real Chrome journeys passed. Artifacts: frontend/e2e/artifacts`,
  );
} finally {
  if (browser) await browser.close();
  for (const child of children) child.kill("SIGTERM");
  await Promise.all(
    children.map((child) =>
      child.exitCode !== null
        ? Promise.resolve()
        : new Promise((resolve) => {
            child.once("exit", resolve);
            setTimeout(() => {
              child.kill("SIGKILL");
              resolve();
            }, 3000).unref();
          }),
    ),
  );
  await rm(scratch, { recursive: true, force: true });
  if (process.exitCode)
    await writeFile(join(artifacts, "server.log"), logs.join("").slice(-30000));
}
