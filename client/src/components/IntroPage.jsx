const problemCards = [
  {
    label: "residents",
    title: "See it, log it, move on",
    copy: "A pothole on the walk to the bus stop should not need a signal bar to get reported.",
  },
  {
    label: "field crews",
    title: "Work where coverage does not",
    copy: "Utility and parks crews can log issues underground, in basements, and out of range.",
  },
  {
    label: "municipal staff",
    title: "A queue that arrives intact",
    copy: "Every report reaches triage exactly once, however long it sat offline.",
  },
];

const steps = [
  ["01", "Capture offline", "Photo, category, description, and GPS pin are saved to the device instantly."],
  ["02", "Queue locally", "Each report sits in an on-device outbox with a client-generated ID."],
  ["03", "Sync automatically", "When a connection returns, the queue pushes to the backend without a manual retry."],
];

const stack = [
  ["Frontend", "React + Vite"],
  ["Offline storage", "IndexedDB via Dexie"],
  ["API", "API Gateway + AWS Lambda"],
  ["Database", "PostgreSQL + PostGIS"],
];

function MiniPhone({ children, title }) {
  return (
    <div className="intro-phone">
      <div className="intro-phone-title">{title}</div>
      {children}
    </div>
  );
}

export default function IntroPage({ onLaunch, githubUrl, theme, onToggleTheme }) {
  return (
    <div className="intro-page">
      <header className="intro-header">
        <a className="intro-brand" href="#intro-top">
          <span className="intro-brand-mark">G</span>
          <span>GroundTruth</span>
        </a>
        <nav className="intro-nav" aria-label="Introduction">
          <a href="#intro-how">How it works</a>
          <a href="#intro-preview">Preview</a>
          <a href="#intro-stack">Built on</a>
          <a href={githubUrl} target="_blank" rel="noreferrer">GitHub ↗</a>
        </nav>
        <div className="intro-header-actions">
          <button
            className="intro-theme-toggle"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            <span aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span>
            {theme === "light" ? "Dark" : "Light"}
          </button>
          <button className="intro-header-cta" onClick={onLaunch}>Open reporter <span>↗</span></button>
        </div>
      </header>

      <main id="intro-top">
        <section className="intro-hero">
          <div className="intro-hero-copy">
            <p className="intro-kicker"><span /> CIVIC SIGNALS / 01</p>
            <p className="intro-overline">OFFLINE-FIRST ISSUE REPORTER</p>
            <h1>Report it<br /><em>before you lose signal.</em></h1>
            <p className="intro-lede">
              GroundTruth captures potholes, broken lights, and everything else that breaks —
              the instant you see it, with or without a connection.
            </p>
            <div className="intro-actions">
              <button className="intro-primary" onClick={onLaunch}>Try the reporter <span>→</span></button>
              <a className="intro-secondary" href="#intro-how">See how it works <span>↓</span></a>
            </div>
            <div className="intro-badges" aria-label="Features">
              <span>Offline-first</span>
              <span>Private by default</span>
              <span>Syncs when ready</span>
            </div>
          </div>
          <div className="intro-hero-visual" aria-label="A report syncing when a connection returns">
            <div className="intro-map-grid" />
            <div className="intro-orbit orbit-large" />
            <div className="intro-orbit orbit-small" />
            <div className="intro-location-pin"><span>●</span></div>
            <div className="intro-visual-note"><span className="intro-live-dot" /> report saved locally <strong>→</strong></div>
            <div className="intro-visual-card">
              <span className="intro-card-label">SIGNAL STATUS</span>
              <strong>Saved first.</strong>
              <span>Synced when ready.</span>
            </div>
          </div>
        </section>

        <section className="intro-section intro-problem" id="intro-problem">
          <p className="intro-section-index">01 / THE PROBLEM</p>
          <div className="intro-section-heading">
            <h2>The moment to report<br /><em>rarely has signal.</em></h2>
            <p>Parking garages, rural roads, subway platforms, disaster zones — the places where things go wrong are often the places where a network request quietly fails.</p>
          </div>
          <div className="intro-card-grid">
            {problemCards.map((card) => (
              <article className="intro-info-card" key={card.label}>
                <span className="intro-card-label">{card.label}</span>
                <h3>{card.title}</h3>
                <p>{card.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="intro-section" id="intro-how">
          <p className="intro-section-index">02 / THE FLOW</p>
          <div className="intro-section-heading">
            <h2>Three rules for<br /><em>trustworthy reporting.</em></h2>
            <p>Local-first writes, idempotent syncs, and clear status make the experience dependable from the first tap to the final handoff.</p>
          </div>
          <div className="intro-steps">
            {steps.map(([number, title, copy]) => (
              <article className="intro-step" key={number}>
                <span className="intro-step-number">{number}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="intro-section" id="intro-preview">
          <p className="intro-section-index">03 / THE EXPERIENCE</p>
          <div className="intro-section-heading">
            <h2>Simple enough<br /><em>for the moment.</em></h2>
            <p>Every screen answers one question: what happened to my report?</p>
          </div>
          <div className="intro-phones">
            <MiniPhone title="New report">
              <div className="intro-phone-photo">+</div>
              <div className="intro-phone-field">Title</div>
              <div className="intro-phone-field">Category: pothole</div>
              <div className="intro-phone-field intro-phone-tall">Description</div>
              <div className="intro-phone-field">⌖ location attached</div>
              <div className="intro-phone-save">Save offline</div>
            </MiniPhone>
            <MiniPhone title="My reports">
              <div className="intro-phone-row"><span>Pothole — Elm &amp; 4th</span><b className="is-queued">queued</b></div>
              <div className="intro-phone-row"><span>Streetlight — Rt 9</span><b className="is-synced">synced</b></div>
              <div className="intro-phone-row"><span>Broken hydrant</span><b className="is-draft">draft</b></div>
              <div className="intro-phone-sync">↻ 2 pending reports</div>
            </MiniPhone>
            <MiniPhone title="Signal map">
              <div className="intro-phone-map"><i /><i /><i /><i /></div>
              <div className="intro-map-legend"><span>● queued</span><span>● synced</span></div>
            </MiniPhone>
          </div>
        </section>

        <section className="intro-section intro-stack" id="intro-stack">
          <p className="intro-section-index">04 / THE FOUNDATION</p>
          <div className="intro-section-heading">
            <h2>Built for bursts,<br /><em>not busywork.</em></h2>
            <p>A lightweight stack that stays quiet between reconnects and scales when a whole neighborhood starts reporting.</p>
          </div>
          <div className="intro-stack-table">
            {stack.map(([layer, service]) => <div className="intro-stack-row" key={layer}><span>{layer}</span><strong>{service}</strong></div>)}
          </div>
        </section>
      </main>

      <footer className="intro-footer">
        <div><span className="intro-brand-mark">G</span><strong>GroundTruth</strong></div>
        <p>Built for the moments that matter.</p>
        <div className="intro-footer-actions">
          <a className="intro-footer-link" href={githubUrl} target="_blank" rel="noreferrer">View on GitHub <span>↗</span></a>
          <button className="intro-footer-link" onClick={onLaunch}>Open the reporter <span>↗</span></button>
        </div>
      </footer>
    </div>
  );
}
