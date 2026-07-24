import { useCallback, useEffect, useRef, useState } from "react";
import {
  MdBadge, MdCameraAlt, MdClose, MdFilterList, MdHistory,
  MdLogin, MdLogout, MdNote, MdQrCodeScanner, MdRefresh,
  MdVerifiedUser, MdWarning, MdWifiOff, MdImage, MdKeyboard,
  MdStopCircle, MdConfirmationNumber,
} from "react-icons/md";

const API = "/api";
const SCAN_COOLDOWN_MS = 3000;

// ── QR decode helpers ──────────────────────────────────────────────────────

async function decodeQR(source) {
  if ("BarcodeDetector" in window) {
    try {
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const codes = await detector.detect(source);
      if (codes[0]?.rawValue) return codes[0].rawValue;
    } catch { /* fall through */ }
  }
  try {
    const jsQR = (await import("jsqr")).default;
    const canvas = document.createElement("canvas");
    let w, h;
    if (source instanceof HTMLVideoElement) { w = source.videoWidth; h = source.videoHeight; }
    else if (source instanceof HTMLImageElement) { w = source.naturalWidth; h = source.naturalHeight; }
    else return null;
    if (!w || !h) return null;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(source, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const result = jsQR(imageData.data, imageData.width, imageData.height);
    return result?.data ?? null;
  } catch { return null; }
}

async function decodeQRFromFile(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => { const v = await decodeQR(img); URL.revokeObjectURL(url); resolve(v); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// ── Component ────────────────────────────────────────────────────────────────
export default function AccessScanner({ session, onClose }) {
  const [token,      setToken]      = useState("");
  const [direction,  setDirection]  = useState("ENTRY");
  const [gate,       setGate]       = useState("Main Gate");
  const [scanNote,   setScanNote]   = useState("");
  const [result,     setResult]     = useState(null);
  const [events,     setEvents]     = useState([]);
  const [total,      setTotal]      = useState(0);
  const [evtPage,    setEvtPage]    = useState(0);
  const [busy,       setBusy]       = useState(false);
  const [isOnline,   setIsOnline]   = useState(navigator.onLine);

  // Camera state
  const [cameraOpen,     setCameraOpen]     = useState(false);
  const [cameraError,    setCameraError]    = useState("");
  const [cameraStarting, setCameraStarting] = useState(false);

  // Photo-upload state
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError,   setPhotoError]   = useState("");

  // Visitor code state
  const [visitorCode,   setVisitorCode]   = useState("");
  const [visitorResult, setVisitorResult] = useState(null);
  const [visitorBusy,   setVisitorBusy]   = useState(false);

  // Input mode: "camera" | "photo" | "manual" | "visitor"
  const [inputMode, setInputMode] = useState("camera");

  // Filters / pagination
  const [showFilters,    setShowFilters]    = useState(false);
  const [filterGate,     setFilterGate]     = useState("");
  const [filterDecision, setFilterDecision] = useState("");

  // Override mode (admin-only)
  const [overrideMode,   setOverrideMode]   = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const videoRef      = useRef(null);
  const streamRef     = useRef(null);
  const timerRef      = useRef(null);
  const photoInputRef = useRef(null);
  const lastScannedRef = useRef({ token: "", at: 0 });

  const isAdmin = ["Admin", "Super Admin"].includes(session?.user?.role);
  const PAGE_SIZE = 12;
  const headers = { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" };

  // ── Online/offline ──────────────────────────────────────────────────────
  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // ── Event history ──────────────────────────────────────────────────────
  const loadEvents = useCallback(async (page = 0) => {
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (filterGate)     params.set("gate",     filterGate);
      if (filterDecision) params.set("decision", filterDecision);
      const response = await fetch(`${API}/access/events?${params}`, { headers });
      if (!response.ok) return;
      const data = await response.json();
      setEvents(data.events ?? data);
      setTotal(data.total ?? 0);
      setEvtPage(page);
    } catch { /* non-critical */ }
  }, [session.token, filterGate, filterDecision]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadEvents(0); }, [loadEvents]);

  // ── Camera lifecycle ────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }, []);

  useEffect(() => { if (inputMode !== "camera") stopCamera(); }, [inputMode, stopCamera]);
  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = useCallback(async () => {
    setCameraError("");
    setCameraStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      window.setTimeout(() => {
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
      }, 50);
      timerRef.current = window.setInterval(async () => {
        const video = videoRef.current;
        if (!video || video.readyState < 2) return;
        const value = await decodeQR(video);
        if (value) { stopCamera(); setToken(value); verify(value); }
      }, 500);
    } catch (error) {
      const msg = error.name === "NotAllowedError"
        ? "Camera permission denied. Allow camera access in your browser settings and try again."
        : error.name === "NotFoundError"
          ? "No camera found on this device. Use the photo upload option instead."
          : `Unable to start camera: ${error.message || error.name}. Try uploading a photo instead.`;
      setCameraError(msg);
    } finally { setCameraStarting(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-start camera when modal first opens
  useEffect(() => { if (inputMode === "camera") startCamera(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Photo upload ────────────────────────────────────────────────────────
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(""); setPhotoLoading(true);
    try {
      const value = await decodeQRFromFile(file);
      if (value) { setToken(value); verify(value); }
      else setPhotoError("No QR code found in this image. Make sure the QR code is clear and well-lit.");
    } finally {
      setPhotoLoading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  // ── Resident card verify ─────────────────────────────────────────────────
  const verify = async (scannedValue = token) => {
    const value = String(scannedValue || "").trim();
    if (!value || busy) return;
    if (!isOnline) {
      setResult({ decision: "DENIED", reason: "Device is offline — do not allow entry.", offline: true, member: null });
      return;
    }
    const now = Date.now();
    if (lastScannedRef.current.token === value && now - lastScannedRef.current.at < SCAN_COOLDOWN_MS) return;
    lastScannedRef.current = { token: value, at: now };
    if (overrideMode && !overrideReason.trim()) {
      setResult({ decision: "DENIED", reason: "Enter a reason before using override.", member: null });
      return;
    }
    setBusy(true); setResult(null);
    const idempotencyKey = `sigar-${value}-${Date.now()}`;
    try {
      const response = await fetch(`${API}/access/verify`, {
        method: "POST", headers,
        body: JSON.stringify({ token: value, direction, gate, scanNote: scanNote.trim() || undefined,
          idempotencyKey, isOverride: overrideMode || undefined,
          overrideReason: overrideMode ? overrideReason.trim() : undefined }),
      });
      if (!response.ok && response.status >= 500) {
        setResult({ decision: "DENIED", reason: "Verification service error — do not allow entry.", member: null });
        return;
      }
      const data = await response.json();
      setResult({ ...data, decision: data.decision || "ERROR", reason: data.reason || data.message || "Verification failed" });
      setToken(value); setScanNote(""); setOverrideReason(""); setOverrideMode(false);
      await loadEvents(0);
    } catch {
      setResult({ decision: "DENIED", reason: "Network error — do not allow entry.", member: null });
    } finally { setBusy(false); }
  };

  // ── Visitor code verify ──────────────────────────────────────────────────
  const verifyVisitor = async () => {
    const code = String(visitorCode || "").trim().toUpperCase();
    if (!code || visitorBusy) return;
    if (!isOnline) {
      setVisitorResult({ decision: "DENIED", reason: "Device is offline — do not allow entry." });
      return;
    }
    setVisitorBusy(true); setVisitorResult(null);
    try {
      const response = await fetch(`${API}/visitor/verify`, {
        method: "POST", headers,
        body: JSON.stringify({ code, gate }),
      });
      const data = await response.json();
      setVisitorResult({ ...data, decision: data.decision || "DENIED" });
      if (data.decision === "ALLOWED") { setVisitorCode(""); await loadEvents(0); }
    } catch {
      setVisitorResult({ decision: "DENIED", reason: "Network error — do not allow entry." });
    } finally { setVisitorBusy(false); }
  };

  const decisionClass = (d = "") =>
    (d === "ALLOWED" || d === "OVERRIDE_ALLOWED") ? "allowed" : "denied";

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="access-modal-backdrop">
      <section className="access-modal" aria-label="Gate access scanner">

        {!isOnline && (
          <div className="access-offline-banner" role="alert" aria-live="assertive">
            <MdWifiOff /> Device is offline — verification unavailable. Do not allow entry.
          </div>
        )}

        <header className="access-head">
          <div>
            <span className="eyebrow">BODIJA GATE VERIFICATION</span>
            <h2><MdQrCodeScanner /> Scan resident card</h2>
            <p>Point camera at QR code, upload a photo, type the ID, or enter a visitor code.</p>
          </div>
          <button className="access-close" onClick={onClose} aria-label="Close"><MdClose /></button>
        </header>

        <div className="access-body">
          <div className="access-workspace">

            {/* ── Mode tabs ────────────────────────────────────────── */}
            <div className="access-mode-tabs">
              <button className={inputMode === "camera"  ? "active" : ""} onClick={() => { setInputMode("camera");  setCameraError(""); if (!cameraOpen) startCamera(); }}>
                <MdCameraAlt /> Live camera
              </button>
              <button className={inputMode === "photo"   ? "active" : ""} onClick={() => { setInputMode("photo");   setPhotoError(""); }}>
                <MdImage /> Upload photo
              </button>
              <button className={inputMode === "manual"  ? "active" : ""} onClick={() => setInputMode("manual")}>
                <MdKeyboard /> Manual entry
              </button>
              <button className={inputMode === "visitor" ? "visitor-tab active" : "visitor-tab"} onClick={() => { setInputMode("visitor"); setVisitorResult(null); }}>
                <MdConfirmationNumber /> Visitor code
              </button>
            </div>

            {/* ── VISITOR CODE MODE ────────────────────────────── */}
            {inputMode === "visitor" && (
              <div className="access-visitor-zone">
                <p className="access-visitor-hint">
                  Ask the visitor for their 6-character code (e.g. <strong>KQJ847</strong>). Each code is single-use and expires after 24 hours.
                </p>
                <label className="access-field">
                  Visitor code
                  <div className="access-token">
                    <MdConfirmationNumber style={{ color: "#c6974c", fontSize: 20 }} />
                    <input
                      value={visitorCode}
                      onChange={(e) => setVisitorCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                      placeholder="e.g. KQJ847"
                      maxLength={6}
                      autoFocus
                      style={{ fontFamily: "monospace", fontSize: 20, letterSpacing: 3, fontWeight: 800 }}
                      onKeyDown={(e) => { if (e.key === "Enter") verifyVisitor(); }}
                    />
                  </div>
                </label>

                {/* Gate selector for visitor too */}
                <label className="access-field" style={{ marginTop: 12 }}>
                  Gate
                  <select value={gate} onChange={(e) => setGate(e.target.value)}>
                    <option>Main Gate</option>
                    <option>Awolowo Avenue Gate</option>
                    <option>Housing Road Gate</option>
                    <option>Market Gate</option>
                  </select>
                </label>

                <div className="access-actions" style={{ marginTop: 14 }}>
                  <button
                    className="access-primary"
                    onClick={verifyVisitor}
                    disabled={visitorBusy || !isOnline || visitorCode.length < 4}
                    style={{ gridColumn: "1 / -1" }}
                  >
                    <MdVerifiedUser />
                    {visitorBusy ? "Checking…" : "Verify visitor code"}
                  </button>
                </div>

                {/* Visitor result */}
                {visitorResult && (
                  <article
                    className={`access-result ${decisionClass(visitorResult.decision)}`}
                    role="alert" aria-live="polite"
                    style={{ marginTop: 16 }}
                  >
                    <div className="access-result-status">
                      <span>{visitorResult.decision}</span>
                      <strong>{visitorResult.reason}</strong>
                    </div>
                    {visitorResult.decision === "ALLOWED" && (
                      <dl>
                        {visitorResult.visitorLabel && <div><dt>Visitor</dt><dd>{visitorResult.visitorLabel}</dd></div>}
                        <div><dt>Resident host</dt><dd>{visitorResult.residentName}</dd></div>
                        <div><dt>Cluster</dt><dd>{visitorResult.residentNeighbourhood}</dd></div>
                        <div><dt>Code status</dt><dd style={{ color: "#ef4444" }}>Consumed — cannot be reused</dd></div>
                      </dl>
                    )}
                  </article>
                )}
              </div>
            )}

            {/* ── CAMERA MODE ─────────────────────────────────── */}
            {inputMode === "camera" && (
              <div className="access-scan-primary">
                <div className="access-video-wrap">
                  {cameraOpen ? (
                    <>
                      <video ref={videoRef} autoPlay playsInline muted />
                      <div className="access-scan-frame" />
                      <div className="access-scan-hint">Align QR code within the frame</div>
                    </>
                  ) : (
                    <div className="access-camera-placeholder">
                      {cameraStarting ? (
                        <div className="access-camera-loading"><div className="access-spinner" /><span>Starting camera…</span></div>
                      ) : (
                        <div className="access-camera-loading">
                          <MdCameraAlt size={42} style={{ color: "#c6974c", opacity: 0.7 }} />
                          <span>{cameraError ? "Camera unavailable" : "Camera stopped"}</span>
                          <button className="access-restart-cam" onClick={startCamera}>Restart camera</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {cameraError && <div className="access-camera-error">{cameraError}</div>}
                <div className="access-scan-controls">
                  {cameraOpen
                    ? <button className="access-stop-btn" onClick={stopCamera}><MdStopCircle /> Stop camera</button>
                    : (!cameraStarting && <button className="access-primary" onClick={startCamera} disabled={!isOnline}><MdCameraAlt /> Start camera scan</button>)
                  }
                </div>
              </div>
            )}

            {/* ── PHOTO MODE ─────────────────────────────────────── */}
            {inputMode === "photo" && (
              <div className="access-photo-zone">
                <input ref={photoInputRef} type="file" accept="image/*" capture="environment"
                  id="photo-upload" style={{ display: "none" }} onChange={handlePhotoUpload} />
                <label htmlFor="photo-upload" className={`access-photo-drop${photoLoading ? " loading" : ""}`}>
                  {photoLoading ? (
                    <><div className="access-spinner" /><span>Reading QR code…</span></>
                  ) : (
                    <><MdImage size={48} style={{ color: "#c6974c" }} />
                      <strong>Tap to take a photo or choose from gallery</strong>
                      <span>Point your camera at the QR code and take a clear, well-lit photo.</span>
                    </>
                  )}
                </label>
                {photoError && <div className="access-camera-error">{photoError}</div>}
              </div>
            )}

            {/* ── MANUAL MODE ────────────────────────────────────── */}
            {inputMode === "manual" && (
              <label className="access-field" style={{ marginTop: 8 }}>
                Membership ID or QR value
                <div className="access-token">
                  <MdBadge />
                  <input value={token} onChange={(e) => setToken(e.target.value)}
                    placeholder="BVC-26-01842" autoComplete="off" autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") verify(); }} />
                </div>
              </label>
            )}

            {/* Scanned value preview (camera/photo modes) */}
            {token && inputMode !== "manual" && inputMode !== "visitor" && (
              <div className="access-scanned-preview">
                <MdBadge style={{ color: "#c6974c" }} />
                <span>Scanned: <strong>{token}</strong></span>
                <button onClick={() => setToken("")} title="Clear"><MdClose size={14} /></button>
              </div>
            )}

            {/* ── Resident card controls (not shown in visitor mode) ── */}
            {inputMode !== "visitor" && (
              <>
                <div className="access-section-divider" />

                {/* Direction toggle */}
                <div className="access-direction" aria-label="Access direction">
                  <button className={direction === "ENTRY" ? "active" : ""} onClick={() => setDirection("ENTRY")}>
                    <MdLogin /> Entry
                  </button>
                  <button className={direction === "EXIT" ? "active" : ""} onClick={() => setDirection("EXIT")}>
                    <MdLogout /> Exit
                  </button>
                </div>

                {/* Gate selector */}
                <label className="access-field">
                  Gate
                  <select value={gate} onChange={(e) => setGate(e.target.value)}>
                    <option>Main Gate</option>
                    <option>Awolowo Avenue Gate</option>
                    <option>Housing Road Gate</option>
                    <option>Market Gate</option>
                  </select>
                </label>

                {/* Scan note */}
                <label className="access-field">
                  Scan note <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span>
                  <div className="access-token">
                    <MdNote />
                    <input value={scanNote} onChange={(e) => setScanNote(e.target.value)}
                      placeholder="e.g. Resident presented physical ID card" maxLength={300} />
                  </div>
                </label>

                {/* Override (admin only) */}
                {isAdmin && (
                  <label className="access-field access-override-row">
                    <input type="checkbox" checked={overrideMode}
                      onChange={(e) => { setOverrideMode(e.target.checked); if (!e.target.checked) setOverrideReason(""); }} />
                    <span className="access-override-label">
                      <MdWarning /> Override (admin) — every override is audited
                    </span>
                  </label>
                )}
                {overrideMode && (
                  <label className="access-field">
                    Override reason <span style={{ color: "#ef4444" }}>*</span>
                    <div className="access-token">
                      <MdNote />
                      <input required value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="State reason for override decision" maxLength={300} />
                    </div>
                  </label>
                )}

                {/* Verify button */}
                <div className="access-actions" style={{ marginTop: 14 }}>
                  <button
                    className={`access-primary${overrideMode ? " override" : ""}`}
                    onClick={() => verify()}
                    disabled={busy || !isOnline || !token}
                    style={{ gridColumn: "1 / -1" }}
                  >
                    <MdVerifiedUser />
                    {busy ? "Checking…" : overrideMode ? "Override verify" : `Verify ${direction === "ENTRY" ? "entry" : "exit"}`}
                  </button>
                </div>

                {/* Verification result */}
                {result && (
                  <article className={`access-result ${decisionClass(result.decision)}`} role="alert" aria-live="polite">
                    <div className="access-result-status">
                      <span>{result.decision}{result.isOverride ? " (OVERRIDE)" : ""}</span>
                      <strong>{result.reason}</strong>
                      {result.offline && <em>Offline — connection required for live verification.</em>}
                    </div>
                    {result.member && (
                      <dl>
                        <div><dt>Resident</dt><dd>{result.member.fullName}</dd></div>
                        <div><dt>Membership ID</dt><dd>{result.member.membershipId}</dd></div>
                        <div><dt>Cluster</dt><dd>{result.member.neighbourhood}</dd></div>
                        <div><dt>Category</dt><dd>{result.member.memberCategory}</dd></div>
                        <div><dt>Card status</dt><dd>{result.member.cardStatus}</dd></div>
                        <div>
                          <dt>Expires</dt>
                          <dd>{result.member.expiresAt
                            ? new Date(result.member.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                            : "Not set"}</dd>
                        </div>
                      </dl>
                    )}
                  </article>
                )}
              </>
            )}
          </div>

          {/* ── Event history panel ───────────────────────────────── */}
          <aside className="access-history">
            <div className="access-history-title">
              <MdHistory />
              <div>
                <strong>Recent gate activity</strong>
                <span>Shared security audit log</span>
              </div>
              <button className="access-filter-btn" onClick={() => setShowFilters((v) => !v)}
                title="Filter events" aria-label="Toggle filters">
                <MdFilterList />
              </button>
            </div>

            {showFilters && (
              <div className="access-filters">
                <select value={filterGate} onChange={(e) => setFilterGate(e.target.value)}>
                  <option value="">All gates</option>
                  <option>Main Gate</option>
                  <option>Awolowo Avenue Gate</option>
                  <option>Housing Road Gate</option>
                  <option>Market Gate</option>
                </select>
                <select value={filterDecision} onChange={(e) => setFilterDecision(e.target.value)}>
                  <option value="">All decisions</option>
                  <option value="ALLOWED">Allowed</option>
                  <option value="OVERRIDE_ALLOWED">Override allowed</option>
                  <option value="DENIED">Denied</option>
                </select>
                <button onClick={() => { setFilterGate(""); setFilterDecision(""); }}>Clear</button>
              </div>
            )}

            <div className="access-events">
              {events.map((event) => (
                <div className="access-event" key={event.id}>
                  <span className={decisionClass(event.decision)}>
                    {event.direction === "ENTRY" ? <MdLogin /> : <MdLogout />}
                  </span>
                  <div>
                    <strong>{event.residentName || event.membershipId}</strong>
                    <small>
                      {event.gate} · {new Date(event.scannedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </small>
                    {event.scanNote && <small style={{ color: "#9ca3af", display: "block" }}>{event.scanNote}</small>}
                  </div>
                  <b className={decisionClass(event.decision)}>
                    {event.decision === "OVERRIDE_ALLOWED" ? "OVERRIDE" : event.decision}
                  </b>
                </div>
              ))}
              {!events.length && <div className="access-empty">No gate scans recorded yet.</div>}
            </div>

            {total > PAGE_SIZE && (
              <div className="access-pagination">
                <button disabled={evtPage === 0} onClick={() => loadEvents(evtPage - 1)}>← Previous</button>
                <span>{evtPage * PAGE_SIZE + 1}–{Math.min((evtPage + 1) * PAGE_SIZE, total)} of {total}</span>
                <button disabled={(evtPage + 1) * PAGE_SIZE >= total} onClick={() => loadEvents(evtPage + 1)}>Next →</button>
              </div>
            )}

            <button className="access-refresh-btn" onClick={() => loadEvents(0)} title="Refresh events">
              <MdRefresh /> Refresh
            </button>
          </aside>
        </div>
      </section>
    </div>
  );
}
