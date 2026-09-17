// src/App.jsx
import { useState, useEffect } from "react";
import CaptureForm from "./components/CaptureForm";
import IssueList from "./components/IssueList";
import IntroPage from "./components/IntroPage";
import { registerNetworkGate } from "./lib/sync";
import "./App.css";

const GITHUB_URL = "https://github.com/AuditorDevansh/Offline-first-local-issue-reporter---Ground-Truth-";

export default function App() {
  const [showIntro, setShowIntro] = useState(() => window.location.hash !== "#app");
  const [tab, setTab] = useState("home");
  const [refreshKey, setRefreshKey] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem("groundtruth-theme");
    return savedTheme || "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("groundtruth-theme", theme);
  }, [theme]);

  // Attempt a sync whenever we come back online, or every 30s as backstop.
  useEffect(() => {
    const unregister = registerNetworkGate(() => setRefreshKey((k) => k + 1));
    const onlineHandler = () => setOnline(true);
    const offlineHandler = () => setOnline(false);
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    return () => {
      unregister();
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
    };
  }, []);

  function launchApp() {
    window.history.replaceState(null, "", "#app");
    setShowIntro(false);
  }

  function returnToIntro() {
    window.history.replaceState(null, "", window.location.pathname);
    setShowIntro(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (showIntro) {
    return (
      <IntroPage
        onLaunch={launchApp}
        githubUrl={GITHUB_URL}
        theme={theme}
        onToggleTheme={() => setTheme((current) => current === "light" ? "dark" : "light")}
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
            onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            <span aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span>
            {theme === "light" ? "Dark" : "Light"}
          </button>
        </div>
      </header>

      <nav className="tabs" style={{ "--active-tab": { home: 0, capture: 1, queue: 2 }[tab] }}>
        <button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}>
          <span>⌂</span> Overview
        </button>
        <button
          className={tab === "capture" ? "active" : ""}
          onClick={() => setTab("capture")}
        >
          <span>✦</span> Capture
        </button>
        <button
          className={tab === "queue" ? "active" : ""}
          onClick={() => setTab("queue")}
        >
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
              <p className="intro">Spot something that needs fixing? Capture it now, even without a signal. GroundTruth keeps your report safe on this device and sends it when you’re back online.</p>
              <div className="landing-actions">
                <button className="primary-action" onClick={() => setTab("capture")}>Report an issue <span>→</span></button>
                <button className="text-action" onClick={() => setTab("queue")}>View your activity <span>↗</span></button>
              </div>
            </div>
            <div className="landing-card">
              <div className="signal-art" aria-hidden="true"><span className="signal-ring ring-one" /><span className="signal-ring ring-two" /><span className="signal-dot" /></div>
              <p className="card-label">THE PROMISE</p>
              <h2>Your report<br />doesn't need<br />a connection.</h2>
              <div className="landing-stat"><strong>100%</strong><span>saved locally<br />before sync</span></div>
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
      <footer className="app-footer"><span>GroundTruth</span> · Built for the moments that matter.</footer>
    </div>
  );
}
