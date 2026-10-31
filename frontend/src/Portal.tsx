import { setSessionActive, sessionGeneration, reportExpired } from "./session";
import { useEffect, useState } from "react";
import Workspace from "./App";
import LaunchForm from "./components/LaunchForm";
import "./portal.css";
type User = { id: string; email: string };
export type Project = {
  id: string;
  founder_id: string;
  name: string;
  journey: "known" | "exploring" | "";
  onboarded: boolean;
  legacy?: boolean;
  last_path?: string;
};
async function call<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const sessionAtStart = sessionGeneration();
  const r = await fetch("/api" + path, {
    method,
    signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.status === 401 && !path.startsWith("/auth/"))
    reportExpired(sessionAtStart);
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw Error(
      typeof data.detail === "string"
        ? data.detail
        : "Please check your details and try again.",
    );
  }
  return r.json();
}
const services = [
  [
    "✦",
    "AI Business Discovery",
    "Turn a spark of an idea into a business concept with questions tailored to your industry.",
  ],
  [
    "◎",
    "Business Model and Location Exploration",
    "Compare ways to operate, understand location considerations, and surface assumptions.",
  ],
  [
    "✧",
    "Personalized Business Recommendations",
    "Explore options that reflect your goals, resources, customers, and priorities.",
  ],
  [
    "◇",
    "Business Structure and Company Formation",
    "Understand the trade-offs between structures. Choose the path that fits your business.",
  ],
  [
    "⚖",
    "Legal and Regulatory Compliance",
    "Explore potentially relevant requirements with evidence from official government sources.",
  ],
  [
    "↗",
    "Personalized Launch Roadmaps",
    "Bring your next steps into focus, with a roadmap that evolves as your decisions change.",
  ],
  [
    "▤",
    "Guided Task Completion",
    "Prepare with official resources, application links where verified, and video tutorial searches.",
  ],
  [
    "◌",
    "AI Business Advisor",
    "Ask questions with your saved business details and current task as context.",
  ],
];
function Brand() {
  return (
    <a href="#landing" className="portal-brand">
      <span>✦</span> LaunchPilot <em>AI</em>
    </a>
  );
}
function Landing() {
  return (
    <div className="public-site">
      <nav className="public-nav">
        <Brand />
        <div>
          <a href="#signin">Sign In</a>
          <a className="btn" href="#signup">
            Sign Up ↗
          </a>
        </div>
      </nav>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">YOUR IDEA. YOUR NEXT CHAPTER.</span>
            <h1>
              From Business Idea
              <br />
              to <span>Business Launch.</span>
            </h1>
            <p>
              A clearer path to building something of your own. Explore your
              idea, understand your options, and move forward with an AI advisor
              by your side.
            </p>
            <div className="hero-actions">
              <a href="#signup" className="btn">
                Get Started <span>↗</span>
              </a>
              <a href="#services" className="text-link">
                Explore what’s possible ↓
              </a>
            </div>
            <div className="hero-note">
              <span>✦</span> Built around your business. Guided by your
              decisions.
            </div>
          </div>
          <div
            className="launch-visual"
            aria-label="Preview of an organized business launch"
          >
            <div className="visual-glow" />
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="preview-board">
              <div className="preview-top">
                <span>✦ YOUR LAUNCH, IN FOCUS</span>
                <i>Workspace preview</i>
              </div>
              <h2>
                Big ambition.
                <br />
                Clear next steps.
              </h2>
              <div className="preview-track">
                <span />
                <span />
                <span />
                <span />
              </div>
              {[
                "Explore your business concept",
                "Compare your launch paths",
                "Understand the requirements",
                "Build your personalized roadmap",
              ].map((s, i) => (
                <div className="preview-step" key={s}>
                  <b>{i === 0 ? "✦" : `0${i + 1}`}</b>
                  <span>{s}</span>
                  <small>{i === 0 ? "Start here" : "↗"}</small>
                </div>
              ))}
              <div className="preview-advisor">
                <span>✧</span>
                <div>
                  <b>A little clarity goes a long way.</b>
                  <p>Your AI advisor helps you find the next step.</p>
                </div>
              </div>
            </div>
            <div className="float-note">
              ◎ &nbsp; From possibility to a plan.
            </div>
          </div>
        </section>
        <section className="services" id="services">
          <span className="eyebrow">ONE PLACE TO MOVE FORWARD</span>
          <h2>
            Less guesswork.
            <br />
            More momentum.
          </h2>
          <p>
            From your first question to your next milestone, connect the pieces
            of your business launch.
          </p>
          <div className="service-grid">
            {services.map(([icon, title, description]) => (
              <a href="#signup" className="service-card" key={title}>
                <span className="service-icon">{icon}</span>
                <h3>{title}</h3>
                <p>{description}</p>
                <span className="service-arrow" aria-hidden="true">
                  ↗
                </span>
              </a>
            ))}
          </div>
        </section>
        <section className="public-cta">
          <span className="eyebrow">START WHERE YOU ARE</span>
          <h2>
            An idea to explore.
            <br />
            Or a business ready for its next step.
          </h2>
          <p>Two starting points. One workspace built around you.</p>
          <a href="#signup" className="btn">
            Get Started ↗
          </a>
        </section>
      </main>
      <footer className="public-footer">
        <Brand />
        <span>Clarity for your next chapter.</span>
        <small>
          Guidance supports your decisions; it does not replace professional
          legal advice.
        </small>
      </footer>
    </div>
  );
}
function Auth({
  signup,
  onUser,
}: {
  signup: boolean;
  onUser: (u: User) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="portal-page">
      <nav className="public-nav">
        <Brand />
        <a href={signup ? "#signin" : "#signup"}>
          {signup ? "Already have an account? Sign In" : "New here? Sign Up"}
        </a>
      </nav>
      <main className="auth-layout">
        <div className="auth-intro">
          <span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
          <h1>
            {signup
              ? "Make room for your big idea."
              : "Welcome back to your next big thing."}
          </h1>
          <p>Your business, your decisions. A clearer path forward.</p>
        </div>
        <form
          className="auth-card"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              onUser(
                await call<User>(
                  "/auth/" + (signup ? "signup" : "signin"),
                  "POST",
                  { email: f.get("email"), password: f.get("password") },
                ),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <span className="eyebrow">LAUNCHPILOT AI</span>
          <h2>{signup ? "Create your account" : "Sign in"}</h2>
          <label>
            Email address
            <input
              name="email"
              type="email"
              required
              maxLength={320}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete={signup ? "new-password" : "current-password"}
            />
          </label>
          <p className="mini muted">Use 12–128 characters.</p>
          {error && (
            <p role="alert" className="warn">
              {error}
            </p>
          )}
          <button className="btn" disabled={busy}>
            {busy ? "Please wait…" : signup ? "Sign Up →" : "Sign In →"}
          </button>
          <a href="#landing" className="text-link">
            ← Back to LaunchPilot
          </a>
        </form>
      </main>
    </div>
  );
}
function JourneyChoice({
  busy,
  choose,
}: {
  busy: boolean;
  choose: (j: "known" | "exploring") => void;
}) {
  return (
    <section className="journey-choice">
      <span className="eyebrow">A STARTING POINT THAT FITS YOU</span>
      <h1>Where are you in your business journey?</h1>
      <p>
        You don’t need all the answers. Choose where to begin; you can explore
        every tool later.
      </p>
      <div className="journey-options">
        <button
          disabled={busy}
          className="journey-option known"
          onClick={() => choose("known")}
        >
          <span className="journey-symbol">↗</span>
          <small>LET’S MOVE IT FORWARD</small>
          <h2>I'm Ready to Launch My Business</h2>
          <p>
            I already know what I want to build or have developed my product.
            Help me understand the steps needed to launch and operate legally.
          </p>
          <blockquote>
            “I've already developed a mobile application and want to launch it,
            but I don't know how to register my company or handle legal
            requirements.”
          </blockquote>
          <strong>Build my next steps →</strong>
        </button>
        <button
          disabled={busy}
          className="journey-option exploring"
          onClick={() => choose("exploring")}
        >
          <span className="journey-symbol">✦</span>
          <small>LET’S FIND THE POSSIBILITIES</small>
          <h2>I'm Still Exploring My Business Idea</h2>
          <p>
            I have a business idea, but I'm unsure how or where to start. Help
            me explore my options before making decisions.
          </p>
          <blockquote>
            “I want to open a shop, but I don't know where to set it up or which
            business model would work best.”
          </blockquote>
          <strong>Explore my idea →</strong>
        </button>
      </div>
    </section>
  );
}
export default function Portal() {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [loaded, setLoaded] = useState(false),
    [hash, setHash] = useState(location.hash),
    [selected, setSelected] = useState<Project | null>(null),
    [mode, setMode] = useState<"workspace" | "choose" | "known">("choose"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const change = () => setHash(location.hash);
    window.addEventListener("hashchange", change);
    void call<User>("/auth/me")
      .then((u) => {
        if (active) {
          setSessionActive(true);
          setUser(u);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
      window.removeEventListener("hashchange", change);
    };
  }, []);
  function adopt(p: Project | null) {
    setSelected(p);
    if (!p || (!p.journey && !p.onboarded)) {
      setMode("choose");
      return;
    }
    if (p.journey === "known" && !p.onboarded) {
      setMode("known");
      return;
    }
    setMode("workspace");
    const current = location.hash;
    const explicit = /^#(discover|roadmap|task\/|documents)/.test(current);
    history.replaceState(
      null,
      "",
      explicit
        ? current
        : p.last_path || (p.onboarded ? "#roadmap" : "#discover"),
    );
  }
  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoaded(false);
    setError("");
    void call<Project[]>("/projects")
      .then((all) => {
        if (active) adopt(all[0] || null);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [user]);
  async function choose(j: "known" | "exploring") {
    setBusy(true);
    setError("");
    try {
      let p = selected || (await call<Project>("/projects", "POST"));
      if (!p.id) {
        const business = await call<{ id: string }>(
          "/founders/" + p.founder_id + "/business",
          "POST",
          {},
        );
        p = { ...p, id: business.id };
      }
      setSelected(p);
      const saved = await call<Project>("/projects/" + p.founder_id, "PATCH", {
        journey: j,
        onboarded: p.onboarded,
      });
      history.replaceState(
        null,
        "",
        j === "exploring" ? "#discover" : "#roadmap",
      );
      adopt(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setSessionActive(false);
    try {
      await call("/auth/logout", "POST");
      setUser(null);
      setSelected(null);
      setError("");
      location.hash = "landing";
    } catch (e) {
      setSessionActive(true);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const expired = () => {
      setSessionActive(false);
      setUser(null);
      setLoaded(false);
      setSelected(null);
      location.hash = "signin";
    };
    window.addEventListener("launchpilot-session-expired", expired);
    return () =>
      window.removeEventListener("launchpilot-session-expired", expired);
  }, []);
  if (!ready || (user && !loaded))
    return (
      <div className="portal-loading" role="status">
        Loading LaunchPilot…
      </div>
    );
  if (!user)
    return hash === "#signin" || hash === "#signup" ? (
      <Auth
        key={hash}
        signup={hash === "#signup"}
        onUser={(u) => {
          setSessionActive(true);
          history.replaceState(null, "", "#resume");
          setLoaded(false);
          setUser(u);
        }}
      />
    ) : (
      <Landing />
    );
  return (
    <>
      <header className="account-bar">
        <span>{user.email}</span>
        <button
          className="text-link"
          disabled={busy}
          onClick={() => void logout()}
        >
          Log Out
        </button>
      </header>
      {error && (
        <p role="alert" className="warn">
          {error}{" "}
          <button
            onClick={() => {
              setLoaded(false);
              void call<Project[]>("/projects")
                .then((all) => adopt(all[0] || null))
                .catch((e) => setError(e.message))
                .finally(() => setLoaded(true));
            }}
          >
            Retry
          </button>
        </p>
      )}
      {mode === "workspace" && selected ? (
        <Workspace
          key={selected.id}
          projectId={selected.id}
          legacy={selected.legacy}
          onBack={() => setMode("choose")}
        />
      ) : (
        <main className="portal-page">
          <nav className="public-nav">
            <span className="portal-brand">✦ LaunchPilot AI</span>
          </nav>
          {mode === "known" && selected ? (
            <LaunchForm
              businessId={selected.id}
              onBack={() => setMode("choose")}
              onDone={async () => {
                const all = await call<Project[]>("/projects");
                history.replaceState(null, "", "#roadmap");
                adopt(all[0]);
              }}
            />
          ) : (
            <JourneyChoice busy={busy} choose={(j) => void choose(j)} />
          )}
        </main>
      )}
    </>
  );
}
