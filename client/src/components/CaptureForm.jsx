// src/components/CaptureForm.jsx
import { useState, useRef, useEffect } from "react";
import { saveIssueOffline } from "../lib/db";

const CATEGORIES = ["pothole", "lighting", "sanitation", "signage", "other"];

export default function CaptureForm({ onSaved }) {
  const [title, setTitle]           = useState("");
  const [category, setCategory]     = useState(CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [photoBlob, setPhotoBlob]   = useState(null);   // stored in IndexedDB
  const [photoPreview, setPhotoPreview] = useState(null); // ephemeral object URL
  const [location, setLocation]     = useState(null);
  const [locating, setLocating]     = useState(false);
  const [saved, setSaved]           = useState(false);
  const fileInputRef = useRef(null);

  // Grab GPS as soon as the form mounts.
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

  // Clean up object URLs when the component unmounts or photo changes.
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Revoke the previous preview URL to avoid memory leaks.
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoBlob(file);                          // store the actual File/Blob
    setPhotoPreview(URL.createObjectURL(file));  // only for preview display
  }

  function clearPhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoBlob(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;

    await saveIssueOffline({
      title:       title.trim(),
      category,
      description: description.trim(),
      lat:         location?.lat,
      lng:         location?.lng,
      photoBlob,   // saved as a Blob in IndexedDB — survives page reload
    });

    setSaved(true);
    setTitle("");
    setDescription("");
    clearPhoto();
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
      <p className="intro">
        Your report is saved safely on this device first. It will reach the right
        people when you're back online.
      </p>

      <label className="photo-field">
        {photoPreview ? (
          <>
            <img src={photoPreview} alt="Captured issue" />
            <button
              type="button"
              className="photo-clear-btn"
              onClick={(e) => { e.preventDefault(); clearPhoto(); }}
              aria-label="Remove photo"
            >
              ✕
            </button>
          </>
        ) : (
          <span>
            <strong>+</strong> Add a photo{" "}
            <small>Optional, but helpful</small>
          </span>
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
        maxLength={160}
        required
      />

      <label className="field-label">
        WHAT'S GOING ON?
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>

      <textarea
        placeholder="Add a few details — what, where, and when?"
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={2000}
      />

      <div className="form-footer">
        <p className="location-status">
          <span className={location ? "location-dot active" : "location-dot"}>⌖</span>
          {locating
            ? "Finding your location…"
            : location
            ? `📍 ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
            : "Location unavailable — saving without it"}
        </p>
        <button type="submit">
          {saved ? "Saved ✓" : "Save report"} <span>→</span>
        </button>
      </div>
    </form>
  );
}
