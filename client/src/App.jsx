// src/App.jsx
import { lazy, Suspense, useState, useEffect } from "react";
import CaptureForm from "./components/CaptureForm";
import IssueList from "./components/IssueList";
import IntroPage from "./components/IntroPage";
import { registerNetworkGate } from "./lib/sync";
import "./App.css";

// Admin panel is lazy-loaded so it doesn't bloat the public bundle.
const AdminPanel = lazy(() => import("./admin/AdminPanel"));

const GITHUB_URL = "https://github.com/AuditorDevansh/Offline-first-local-issue-reporter---Ground-Truth-";

const ROUTES = {
  home:    "#app",
  capture: "#app/capture",
  queue:   "#app/queue",
  admin:   "#app/admin",
};

function tabFromHash(hash) {
  const route = Object.entries(ROUTES).find(([, path]) => path === hash);
  return route?.[0] || "home";
}

export default function App() {
  const [showIntro, setShowIntro] = useState(() => !window.location.hash.startsWith("#app"));
  const [tab, setTab]             = useState(() => tabFromHash(window.location.hash));
  const [refreshKey, setRefreshKey] = useState(0);
  const [online, setOnline]       = useState(navigator.onLine);
  const [theme, setTheme]         = useState(() => localStorage.getItem("groundtruth-theme") || "light");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("groundtruth-theme", theme);
  }, [theme]);

  useEffect(() => {
    const handleHashChange = () => {
      const isAppRoute = window.location.hash.startsWith("#app");
      setShowIntro(!isAppRoute);
      if (isAppRoute) setTab(tabFromHash(window.location.hash));
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Sync on reconnect, on a 30-second backstop, and when the SW triggers it.
  useEffect(() => {
    const unregister = registerNetworkGate(() => setRefreshKey((k) => k + 1));
    const onlineHandler  = () => setOnline(true);
    const offlineHandler = () => setOnline(false);
    const swSyncHandler  = () => setRefreshKey((k) => k + 1);

    window.addEventListener("online",              onlineHandler);
    window.addEventListener("offline",             offlineHandler);
    window.addEventListener("groundtruth:sw-sync", swSyncHandler);

    return () => {
      unregister();
      window.removeEventListener("online",              onlineHandler);
      window.removeEventListener("offline",             offlineHandler);
      window.removeEventListener("groundtruth:sw-sync", swSyncHandler);
    };
  }, []);

  function launchApp() {
    window.location.hash = ROUTES.home;
    setShowIntro(false);
    setTab("home");
  }

  function returnToIntro() {
    window.history.pushState(null, "", window.location.pathname);
    setShowIntro(true);
    setTab("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function navigate(nextTab) {
    const nextRoute = ROUTES[nextTab];
    if (!nextRoute || nextRoute === window.location.hash) return;
    window.location.hash = nextRoute;
    setShowIntro(false);
    setTab(nextTab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── Admin panel (full-screen, no nav/topbar) ──────────────────────────────
  if (tab === "admin" && !showIntro) {
    return (
      <Suspense fallback={<div className="adm-loading">Loading admin panel…</div>}>
        <AdminPanel onExit={() => navigate("home")} />
      </Suspense>
    );
  }

  if (showIntro) {
    return (
      <IntroPage
        onLaunch={launchApp}
        githubUrl={GITHUB_URL}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-mark" onClick={returnToIntro} aria-label="Go to GroundTruth introduction">
          <span>G</span> GroundTruth
        </button>
        <div className="topbar-actions">
          <a className="app-github-link" href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub <span>↗</span>
          </a>
          <button className="back-to-intro" onClick={returnToIntro}>About GroundTruth <span>↗</span></button>
          <span className={`connection-pill ${online ? "is-online" : ""}`}>
            <i /> {online ? "Online" : "Offline"}
          </span>
          <button
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            <span aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span>
            {theme === "light" ? "Dark" : "Light"}
          </button>
        </div>
      </header>

      <nav className="tabs" style={{ "--active-tab": { home: 0, capture: 1, queue: 2 }[tab] ?? 0 }}>
        <button className={tab === "home"    ? "active" : ""} onClick={() => navigate("home")}>
          <span>⌂</span> Overview
        </button>
        <button className={tab === "capture" ? "active" : ""} onClick={() => navigate("capture")}>
          <span>✦</span> Capture
        </button>
        <button className={tab === "queue"   ? "active" : ""} onClick={() => navigate("queue")}>
          <span>◴</span> Queue
        </button>
      </nav>

      <main className={tab === "home" ? "landing-main" : ""}>
        {tab === "home" ? (
          <section className="landing">
            <div className="landing-copy">
              <p className="eyebrow">CIVIC SIGNALS <span>•</span> 01</p>
              <p className="kicker">OFFLINE-FIRST ISSUE REPORTER</p>
              <h1>Make your<br /><em>mark locally.</em></h1>
              <p className="intro">
                Spot something that needs fixing? Capture it now, even without a signal.
                GroundTruth keeps your report safe on this device and sends it when
                you're back online.
              </p>
              <div className="landing-actions">
                <button className="primary-action" onClick={() => navigate("capture")}>
                  Report an issue <span>→</span>
                </button>
                <button className="text-action" onClick={() => navigate("queue")}>
                  View your activity <span>↗</span>
                </button>
              </div>
            </div>
            <div className="landing-card">
              <div className="signal-art" aria-hidden="true">
                <span className="signal-ring ring-one" />
                <span className="signal-ring ring-two" />
                <span className="signal-dot" />
              </div>
              <p className="card-label">THE PROMISE</p>
              <h2>Your report<br />doesn't need<br />a connection.</h2>
              <div className="landing-stat">
                <strong>100%</strong>
                <span>saved locally<br />before sync</span>
              </div>
            </div>
          </section>
        ) : (
          <>
            <div className="eyebrow">CIVIC SIGNALS <span>•</span> 01</div>
            {tab === "capture" ? (
              <CaptureForm onSaved={() => setRefreshKey((k) => k + 1)} />
            ) : (
              <IssueList refreshKey={refreshKey} />
            )}
          </>
        )}
      </main>

      <footer className="app-footer">
        <span>GroundTruth</span> · Built for the moments that matter.{" "}
        <span>© 2026 Devansh Mishra</span>
        {/* Hidden staff access — navigate to #app/admin to reach the panel */}
        <button
          className="admin-access-btn"
          onClick={() => navigate("admin")}
          aria-label="Staff admin panel"
          title="Staff admin panel"
        >
          ⚙
        </button>
      </footer>
    </div>
  );
}
