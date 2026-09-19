// src/admin/AdminLogin.jsx
import { useState } from "react";
import { setAdminKey, testKey } from "./lib/adminApi";
import "./admin.css";

export default function AdminLogin({ onAuthenticated }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");

    try {
      const ok = await testKey(trimmed);
      if (ok) {
        setAdminKey(trimmed);
        onAuthenticated();
      } else {
        setError("Invalid API key — check the AWS Console and try again.");
      }
    } catch {
      setError("Could not reach the API. Check your network and API URL.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="adm-login-wrap">
      <div className="adm-login-card">
        <div className="adm-login-brand">
          <span className="adm-brand-mark">G</span>
          <span>GroundTruth</span>
          <span className="adm-login-badge">Admin</span>
        </div>
        <h1 className="adm-login-title">Staff dashboard</h1>
        <p className="adm-login-sub">
          Enter your API key to access the municipal issue queue.
        </p>
        <form onSubmit={handleSubmit} className="adm-login-form">
          <label className="adm-field-label" htmlFor="api-key">
            API KEY
          </label>
          <input
            id="api-key"
            type="password"
            className="adm-input"
            placeholder="••••••••••••••••••••"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error && <p className="adm-login-error" role="alert">{error}</p>}
          <button
            className="adm-btn adm-btn-primary adm-btn-full"
            type="submit"
            disabled={loading || !key.trim()}
          >
            {loading ? "Verifying…" : "Sign in →"}
          </button>
        </form>
        <p className="adm-login-hint">
          The API key is created in the AWS Console under
          API Gateway → API Keys and associated with the GroundTruth usage plan.
        </p>
      </div>
    </div>
  );
}
