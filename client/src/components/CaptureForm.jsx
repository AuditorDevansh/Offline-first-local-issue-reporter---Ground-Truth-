// src/components/CaptureForm.jsx
import { useState, useRef, useEffect } from "react";
import { saveIssueOffline } from "../lib/db";

const CATEGORIES = ["pothole", "lighting", "sanitation", "signage", "other"];

export default function CaptureForm({ onSaved }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [photoRef, setPhotoRef] = useState(null);
  const [location, setLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef(null);

  // Grab GPS as soon as the form mounts — don't make the user wait on it
  // to submit; if it's not ready yet we just save without coordinates.
  useEffect(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 8000 }
    );
  }, []);

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Store as a local object URL reference for now — swap this for an
    // IndexedDB blob store (or Dexie's own blob support) before Phase 3,
    // since object URLs don't survive a page reload.
    setPhotoRef(URL.createObjectURL(file));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;

    await saveIssueOffline({
      title: title.trim(),
      category,
      description: description.trim(),
      lat: location?.lat,
      lng: location?.lng,
      photoRef,
    });

    setSaved(true);
    setTitle("");
    setDescription("");
    setPhotoRef(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onSaved?.();

    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <form onSubmit={handleSubmit} className="capture-form">
      <div className="section-heading">
        <div>
          <p className="kicker">MAKE YOUR MARK</p>
          <h1>Spot something?<br /><em>Say something.</em></h1>
        </div>
        <span className="step-count">01<span>/03</span></span>
      </div>
      <p className="intro">Your report is saved safely on this device first. It will reach the right people when you’re back online.</p>

      <label className="photo-field">
        {photoRef ? (
          <img src={photoRef} alt="Captured issue" />
        ) : (
          <span><strong>+</strong> Add a photo <small>Optional, but helpful</small></span>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoChange}
          hidden
        />
      </label>

      <input
        type="text"
        placeholder="Give it a clear title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />

      <label className="field-label">WHAT'S GOING ON?
      <select value={category} onChange={(e) => setCategory(e.target.value)}>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      </label>

      <textarea
        placeholder="Add a few details — what, where, and when?"
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <p className="location-status">
        {locating
          ? "Locating…"
          : location
          ? `📍 ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
          : "📍 Location unavailable — saving without it"}
      </p>

      <div className="form-footer">
        <p className="location-status">
          <span className={location ? "location-dot active" : "location-dot"}>⌖</span>
          {locating ? "Finding your location…" : location ? "Location attached" : "Location unavailable"}
        </p>
        <button type="submit">{saved ? "Saved ✓" : "Save report"} <span>→</span></button>
      </div>
    </form>
  );
}
