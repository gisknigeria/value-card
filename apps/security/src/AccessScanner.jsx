import { useCallback, useEffect, useRef, useState } from "react";
import {
  MdBadge,
  MdCameraAlt,
  MdClose,
  MdFilterList,
  MdHistory,
  MdLogin,
  MdLogout,
  MdNote,
  MdQrCodeScanner,
  MdRefresh,
  MdVerifiedUser,
  MdWarning,
  MdWifiOff,
} from "react-icons/md";

const API = "/api";
const SCAN_COOLDOWN_MS = 3000; // 3-second cooldown between scans of the same token

export default function AccessScanner({ session, onClose }) {
  const [token,     setToken]     = useState("");
  const [direction, setDirection] = useState("ENTRY");
  const [gate,      setGate]      = useState("Main Gate");
  const [scanNote,  setScanNote]  = useState("");
  const [result,    setResult]    = useState(null);
  const [events,    setEvents]    = useState([]);
  const [total,     setTotal]     = useState(0);
  const [evtPage,   setEvtPage]   = useState(0);
  const [busy,      setBusy]      = useState(false);
  const [isOnline,  setIsOnline]  = useState(navigator.onLine);
  const [cameraOpen,   setCameraOpen]   = useState(false);
  const [cameraError,  setCameraError]  = useState("");
  const [cameraSupported, setCameraSupported] = useState(true);
  const [showFilters,  setShowFilters]  = useState(false);
  const [filterGate,   setFilterGate]   = useState("");
  const [filterDecision, setFilterDecision] = useState("");

  // Override mode (admin-only)
  const [overrideMode,   setOverrideMode]   = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const lastScannedRef = useRef({ token: "", at: 0 });

  const isAdmin = ["Admin", "Super Admin"].includes(session?.user?.role);
  const PAGE_SIZE = 12;

  const headers = {
    Authorization: `Bearer ${session.token}`,
    "Content-Type": "application/json",
  };

  // Online/offline detection
  useEffect(() => {
    const onOnline  = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // BarcodeDetector capability check
  useEffect(() => {
    if (!("BarcodeDetector" in window)) {
      setCameraSupported(false);
    }
  }, []);

  const loadEvents = useCallback(async (page = 0) => {
    try {
      const params = new URLSearchParams({
        limit:  String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (filterGate)     params.set("gate",     filterGate);
      if (filterDecision) params.set("decision", filterDecision);
      const response = await fetch(`${API}/access/events?${params}`, { headers });
      if (!response.ok) return;
      const data = await response.json();
      setEvents(data.events ?? data);
      setTotal(data.total ?? 0);
      setEvtPage(page);
    } catch {
      // History refresh failure is non-critical
    }
  }, [session.token, filterGate, filterDecision]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadEvents(0); }, [loadEvents]);

  const stopCamera = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const verify = async (scannedValue = token) => {
    const value = String(scannedValue || "").trim();
    if (!value || busy) return;

    // Offline safety: never allow access when offline
    if (!isOnline) {
      setResult({
        decision: "DENIED",
        reason:   "Device is offline. Verification is unavailable — do not allow entry.",
        offline:  true,
        member:   null,
      });
      return;
    }

    // Cooldown: prevent repeated accidental scans of the same token
    const now = Date.now();
    if (
      lastScannedRef.current.token === value &&
      now - lastScannedRef.current.at < SCAN_COOLDOWN_MS
    ) {
      return; // silently skip duplicate within cooldown window
    }
    lastScannedRef.current = { token: value, at: now };

    if (overrideMode && !overrideReason.trim()) {
      setResult({ decision: "DENIED", reason: "Enter a reason before using override.", member: null });
      return;
    }

    setBusy(true);
    setResult(null);

    // Idempotency key: unique per scan attempt to prevent duplicate DB writes
    const idempotencyKey = `sigar-${value}-${Date.now()}`;

    try {
      const response = await fetch(`${API}/access/verify`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          token: value,
          direction,
          gate,
          scanNote:        scanNote.trim() || undefined,
          idempotencyKey,
          isOverride:      overrideMode || undefined,
          overrideReason:  overrideMode ? overrideReason.trim() : undefined,
        }),
      });

      // Offline or server error — never assume allowed
      if (!response.ok && response.status >= 500) {
        setResult({ decision: "DENIED", reason: "Verification service error — do not allow entry.", member: null });
        return;
      }

      const data = await response.json();
      setResult({
        ...data,
        decision: data.decision || "ERROR",
        reason:   data.reason  || data.message || "Verification failed",
      });
      setToken(value);
      setScanNote("");
      setOverrideReason("");
      setOverrideMode(false);
      await loadEvents(0);
    } catch {
      // Network error — fail closed
      setResult({ decision: "DENIED", reason: "Network error — do not allow entry.", member: null });
    } finally {
      setBusy(false);
    }
  };

  const startCamera = async () => {
    setCameraError("");

    if (!cameraSupported) {
      setCameraError(
        "QR camera scanning is not supported on this browser. " +
        "Try Chrome on Android or Safari on iOS, or enter the membership ID manually."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      window.setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 0);

      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      timerRef.current = window.setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        const codes = await detector.detect(videoRef.current).catch(() => []);
        const value = codes[0]?.rawValue;
        if (value) {
          stopCamera();
          setToken(value);
          verify(value);
        }
      }, 650);
    } catch (error) {
      setCameraError(
        error.name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in your browser settings."
          : error.name === "NotFoundError"
            ? "No camera found on this device."
            : "Unable to start the camera. Enter the membership ID manually."
      );
    }
  };

  const decisionClass = (d = "") => {
    if (d === "ALLOWED" || d === "OVERRIDE_ALLOWED") return "allowed";
    if (d === "DENIED" || d === "ERROR") return "denied";
    return "denied";
  };

  return (
    <div className="access-modal-backdrop">
      <section className="access-modal" aria-label="Gate access scanner">
        {/* Offline banner */}
        {!isOnline && (
          <div className="access-offline-banner" role="alert" aria-live="assertive">
            <MdWifiOff /> Device is offline — verification unavailable. Do not allow entry.
          </div>
        )}

        <header className="access-head">
          <div>
            <span className="eyebrow">BODIJA GATE VERIFICATION</span>
            <h2><MdQrCodeScanner /> Scan resident ID</h2>
            <p>Verify a Value Card and record entry or exit.</p>
          </div>
          <button className="access-close" onClick={onClose} aria-label="Close">
            <MdClose />
          </button>
        </header>

        <div className="access-body">
          <div className="access-workspace">
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

            {/* Token input */}
            <label className="access-field">
              QR value or membership ID
              <div className="access-token">
                <MdBadge />
                <input
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="BVC-26-01842"
                  autoComplete="off"
                  onKeyDown={(e) => { if (e.key === "Enter") verify(); }}
                />
              </div>
            </label>

            {/* Optional scan note */}
            <label className="access-field">
              Scan note <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span>
              <div className="access-token">
                <MdNote />
                <input
                  value={scanNote}
                  onChange={(e) => setScanNote(e.target.value)}
                  placeholder="e.g. Resident presented physical ID card"
                  maxLength={300}
                />
              </div>
            </label>

            {/* Override mode — admin only */}
            {isAdmin && (
              <label className="access-field access-override-row">
                <input
                  type="checkbox"
                  checked={overrideMode}
                  onChange={(e) => { setOverrideMode(e.target.checked); if (!e.target.checked) setOverrideReason(""); }}
                />
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
                  <input
                    required
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="State reason for override decision"
                    maxLength={300}
                  />
                </div>
              </label>
            )}

            {/* Action buttons */}
            <div className="access-actions">
              <button
                className={`access-primary${overrideMode ? " override" : ""}`}
                onClick={() => verify()}
                disabled={busy || !isOnline}
              >
                <MdVerifiedUser />
                {busy ? "Checking…" : overrideMode ? "Override verify" : `Verify ${direction === "ENTRY" ? "entry" : "exit"}`}
              </button>
              <button
                className="access-camera"
                onClick={cameraOpen ? stopCamera : startCamera}
                disabled={!cameraSupported || !isOnline}
              >
                <MdCameraAlt />
                {cameraOpen ? "Stop camera" : cameraSupported ? "Scan with camera" : "Camera unavailable"}
              </button>
            </div>

            {/* Camera fallback message */}
            {!cameraSupported && (
              <div className="access-camera-error">
                QR camera scanning requires Chrome (Android) or Safari (iOS) with a rear camera.
                Enter the membership ID manually above.
              </div>
            )}
            {cameraError && <div className="access-camera-error">{cameraError}</div>}

            {/* Camera view */}
            {cameraOpen && (
              <div className="access-video-wrap">
                <video ref={videoRef} autoPlay playsInline muted />
                <div className="access-scan-frame" />
              </div>
            )}

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
                      <dd>{result.member.expiresAt ? new Date(result.member.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Not set"}</dd>
                    </div>
                  </dl>
                )}
              </article>
            )}
          </div>

          {/* Event history panel */}
          <aside className="access-history">
            <div className="access-history-title">
              <MdHistory />
              <div>
                <strong>Recent gate activity</strong>
                <span>Shared security audit log</span>
              </div>
              <button
                className="access-filter-btn"
                onClick={() => setShowFilters((v) => !v)}
                title="Filter events"
                aria-label="Toggle filters"
              >
                <MdFilterList />
              </button>
            </div>

            {/* Filters */}
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
              {!events.length && (
                <div className="access-empty">No gate scans recorded yet.</div>
              )}
            </div>

            {/* Pagination */}
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
