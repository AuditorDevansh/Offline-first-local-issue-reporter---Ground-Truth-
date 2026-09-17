// src/App.jsx
import { useState, useEffect } from "react";
import CaptureForm from "./components/CaptureForm";
import IssueList from "./components/IssueList";
import { registerNetworkGate } from "./lib/sync";
import "./App.css";

export default function App() {
  const [tab, setTab] = useState("capture");
  const [refreshKey, setRefreshKey] = useState(0);

  // Attempt a sync whenever we come back online, or every 30s as backstop.
  useEffect(() => {
    const unregister = registerNetworkGate(() =>
      setRefreshKey((k) => k + 1)
    );
    return unregister;
  }, []);

  return (
    <div className="app-shell">
      <header>
        <span className="brand">GroundTruth</span>
      </header>

      <nav className="tabs">
        <button
          className={tab === "capture" ? "active" : ""}
          onClick={() => setTab("capture")}
        >
          Capture
        </button>
        <button
          className={tab === "queue" ? "active" : ""}
          onClick={() => setTab("queue")}
        >
          Queue
        </button>
      </nav>

      <main>
        {tab === "capture" ? (
          <CaptureForm onSaved={() => setRefreshKey((k) => k + 1)} />
        ) : (
          <IssueList refreshKey={refreshKey} />
        )}
      </main>
    </div>
  );
}
