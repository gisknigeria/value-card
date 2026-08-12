/**
 * AccessPointApp — dedicated UI for the "Access Point" role.
 * No map. Shows: QR scan, visitor code, walk-in guest logger, exit code verifier.
 * GPS shares automatically on mount.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MdBadge, MdCameraAlt, MdClose, MdConfirmationNumber, MdHistory,
  MdImage, MdKeyboard, MdLogin, MdLogout, MdNote, MdPerson,
  MdQrCodeScanner, MdRefresh, MdStopCircle, MdVerifiedUser,
  MdWifiOff, MdExitToApp, MdPersonAdd, MdLocationOn, MdEmergency,
} from "react-icons/md";
import { FaVideo, FaVideoSlash } from "react-icons/fa";
import { io } from "socket.io-client";
import WalkieReceiver from "./WalkieReceiver.jsx";
import "./walkie.css";

const API = "/api";
const SCAN_COOLDOWN = 3000;
const MAX_GPS_ACCURACY_METRES = 150;
const GPS_STALE_MS = 45000;

// ── QR payload decoder ────────────────────────────────────────────────────
const QR_PREFIX = "https://bvc-id.ng/v/";
function decodeQrPayload(raw) {
  const s = String(raw || "").trim();
  return s.startsWith(QR_PREFIX) ? s.slice(QR_PREFIX.length) : s;
}

// ── QR helpers (same as AccessScanner) ───────────────────────────────────
async function decodeQR(source) {
  if ("BarcodeDetector" in window) {
    try {
      const det = new window.BarcodeDetector({ formats: ["qr_code"] });
      const codes = await det.detect(source);
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
    canvas.getContext("2d").drawImage(source, 0, 0, w, h);
    const img = canvas.getContext("2d").getImageData(0, 0, w, h);
    return jsQR(img.data, img.width, img.height)?.data ?? null;
  } catch { return null; }
}
async function decodeQRFromFile(file) {
  return new Promise(resolve => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = async () => { resolve(await decodeQR(img)); URL.revokeObjectURL(url); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// ── Main component ────────────────────────────────────────────────────────
export default function AccessPointApp({ session, onLogout }) {
  const [tab, setTab] = useState("card");
  const gate = session.user.unit || "Main Gate";
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [merchants, setMerchants] = useState([]);
  const [events, setEvents] = useState([]);
  const [evtPage, setEvtPage] = useState(0);
  const [totalEvents, setTotalEvents] = useState(0);
  const [sosConfirm, setSosConfirm] = useState(false);
  const [sosStatus, setSosStatus] = useState("");
  const headers = useMemo(() => ({ Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" }), [session.token]);
  const decisionClass = (d = "") => (d === "ALLOWED" || d === "OVERRIDE_ALLOWED") ? "allowed" : "denied";

  // GPS auto-share
  const socketRef = useRef(null);
  const [walkieSocket, setWalkieSocket] = useState(null);
  const gpsRef = useRef(null);
  const lastGpsRef = useRef(0);
  const latestPositionRef = useRef(null);
  const [gpsActive, setGpsActive] = useState(false);
  const [locationAllowed, setLocationAllowed] = useState(false);
  const [locationState, setLocationState] = useState("checking");

  // Camera share
  const [sharingCamera, setSharingCamera] = useState(false);
  const cameraStreamRef = useRef(null);
  const cameraPeersRef = useRef({});

  // ── Online/offline ──────────────────────────────────────────────────────
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // ── Socket + auto GPS ──────────────────────────────────────────────────
  useEffect(() => {
    const socket = io({
      transports: ["polling", "websocket"],
      auth: { token: session.token },
    });
    socketRef.current = socket;
    setWalkieSocket(socket);
    socket.on("connect", () => {
      socket.emit("camera:register", {
        userId: session.user.id, name: session.user.name,
        role: session.user.role, rank: session.user.rank,
        unit: session.user.unit, command: session.user.command,
        lat: session.user.lat, lng: session.user.lng,
      });
      if (cameraStreamRef.current) socket.emit("camera:share:start", { userId: session.user.id, name: session.user.name, type: "Phone" });
    });
    const makeCameraPeer = viewerSocketId => {
      const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      peer.onicecandidate = event => event.candidate && socket.emit("camera:signal", { target: viewerSocketId, data: { candidate: event.candidate } });
      cameraPeersRef.current[viewerSocketId] = peer;
      return peer;
    };
    socket.on("camera:viewer:request", async ({ viewerSocketId }) => {
      const stream = cameraStreamRef.current;
      if (!stream) return;
      const peer = cameraPeersRef.current[viewerSocketId] || makeCameraPeer(viewerSocketId);
      stream.getTracks().forEach(track => peer.addTrack(track, stream));
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socket.emit("camera:signal", { target: viewerSocketId, data: { sdp: peer.localDescription } });
    });
    socket.on("camera:signal", async ({ from, data }) => {
      const peer = cameraPeersRef.current[from];
      if (data.sdp?.type === "answer" && peer) await peer.setRemoteDescription(data.sdp);
      else if (data.candidate && peer) await peer.addIceCandidate(data.candidate).catch(() => {});
    });
    // Auto-start GPS on mount
    startGps(socket);
    return () => {
      stopGps();
      cameraStreamRef.current?.getTracks().forEach(track => track.stop());
      Object.values(cameraPeersRef.current).forEach(peer => peer.close());
      cameraPeersRef.current = {};
      setWalkieSocket(null);
      socket.disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!lastGpsRef.current || Date.now() - lastGpsRef.current > GPS_STALE_MS) {
        setGpsActive(false);
        setLocationAllowed(false);
        setLocationState("stale");
      }
    }, 5000);
    const resume = () => {
      if (document.visibilityState === "visible" && (!gpsRef.current || Date.now() - lastGpsRef.current > GPS_STALE_MS)) {
        stopGps();
        startGps(socketRef.current);
      }
    };
    document.addEventListener("visibilitychange", resume);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", resume); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startGps = (socket) => {
    if (!navigator.geolocation) { setLocationState("unsupported"); setLocationAllowed(false); return; }
    setLocationState("checking");
    gpsRef.current = navigator.geolocation.watchPosition(
      pos => {
        const accurate = Number(pos.coords.accuracy) <= MAX_GPS_ACCURACY_METRES;
        const pt = { userId: session.user.id, lat: pos.coords.latitude, lng: pos.coords.longitude, speed: pos.coords.speed || 0, heading: pos.coords.heading || 0, accuracy: pos.coords.accuracy, timestamp: new Date().toISOString() };
        latestPositionRef.current = pt;
        (socket || socketRef.current)?.emit("gps:update", pt);
        lastGpsRef.current = Date.now();
        setGpsActive(true);
        setLocationAllowed(accurate);
        setLocationState(accurate ? "allowed" : "inaccurate");
      },
      error => {
        setGpsActive(false);
        setLocationAllowed(false);
        setLocationState(error.code === 1 ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
    );
  };
  const stopGps = () => {
    if (gpsRef.current != null) navigator.geolocation.clearWatch(gpsRef.current);
    gpsRef.current = null;
    lastGpsRef.current = 0;
    setGpsActive(false);
    setLocationAllowed(false);
  };

  // ── Camera share ────────────────────────────────────────────────────────
  const toggleCamera = async () => {
    if (sharingCamera) {
      cameraStreamRef.current?.getTracks().forEach(t => t.stop());
      cameraStreamRef.current = null;
      Object.values(cameraPeersRef.current).forEach(peer => peer.close());
      cameraPeersRef.current = {};
      socketRef.current?.emit("camera:share:stop", { userId: session.user.id });
      setSharingCamera(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      cameraStreamRef.current = stream;
      socketRef.current?.emit("camera:share:start", { userId: session.user.id, name: session.user.name, type: "Phone" });
      setSharingCamera(true);
    } catch { setSosStatus("Camera permission was not granted."); }
  };

  const sendSos = async () => {
    const point = latestPositionRef.current;
    if (!point || !isOnline) { setSosStatus("SOS needs an active network and live location."); return; }
    const alert = {
      id: `em-${Date.now()}`, userId: session.user.id, name: session.user.name,
      role: session.user.role, rank: session.user.rank, unit: gate,
      command: session.user.command, type: "Access point emergency",
      text: `Urgent assistance requested at ${gate}`,
      lat: point.lat, lng: point.lng, timestamp: new Date().toISOString(),
    };
    setSosStatus("Sending SOS…");
    try {
      const response = await fetch(`${API}/incidents`, {
        method: "POST", headers,
        body: JSON.stringify({
          title: `SOS - ${gate}`, description: `${session.user.name} requests urgent assistance`,
          reportType: "SOS-Emergency", severity: "Critical", status: "Open",
          lat: point.lat, lng: point.lng, assignedTo: "", visibleTo: [], media: [],
          style: { source: "sos", icon: "SOS", color: "#dc2626", fillColor: "#ef4444", opacity: 0.95 },
        }),
      });
      if (!response.ok) throw new Error("SOS storage failed");
      socketRef.current?.emit("emergency:send", alert);
      setSosStatus("SOS sent to the control room and nearby officers.");
      setSosConfirm(false);
    } catch { setSosStatus("SOS could not be sent. Use the radio immediately."); }
  };

  // ── History ─────────────────────────────────────────────────────────────
  // ── Merchants list ──────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/merchants/list`, { headers })
      .then(r => r.json()).then(d => setMerchants(d.merchants || []))
      .catch(() => {});
  }, [headers]);

  const loadEvents = useCallback(async (page = 0) => {
    try {
      const params = new URLSearchParams({ limit: String(20), offset: String(page * 20) });
      const response = await fetch(`${API}/access/events?${params.toString()}`, { headers });
      if (!response.ok) return;
      const data = await response.json();
      setEvents(data.events ?? data);
      setTotalEvents(data.total ?? 0);
      setEvtPage(page);
    } catch {
      // ignore history load failures
    }
  }, [headers]);

  useEffect(() => { loadEvents(0); }, [loadEvents]);

  return (
    <div className="ap-shell">
      {/* ── Header ────────────────────────────────────────────── */}
      <header className="ap-header">
        <div className="ap-brand">
          <div className="brand-mark" style={{ width: 30, height: 34 }}><span>B</span></div>
          <div>
            <strong>Bodija Gate</strong>
            <small>Access Point</small>
          </div>
        </div>
        <div className="ap-status">
          {!isOnline && <span className="ap-offline"><MdWifiOff /> Offline</span>}
        </div>
        <button className="ap-logout" onClick={onLogout} title="Sign out"><MdLogout size={18} /></button>
      </header>

      <section className="ap-quick-actions" aria-label="Officer safety controls">
        <button className="ap-sos-action" onClick={() => setSosConfirm(true)}><MdEmergency /><span><strong>SOS</strong><small>Request urgent support</small></span></button>
        <button className={`ap-video-action ${sharingCamera ? "active" : ""}`} onClick={toggleCamera}>{sharingCamera ? <FaVideo /> : <FaVideoSlash />}<span><strong>{sharingCamera ? "Stop video" : "Share video"}</strong><small>{sharingCamera ? "Control room can view live" : "Send a live phone feed"}</small></span></button>
      </section>
      {sosStatus && <div className={`ap-action-status ${sosStatus.includes("sent") ? "success" : ""}`}>{sosStatus}</div>}
      {sosConfirm && <div className="ap-sos-confirm" role="dialog" aria-modal="true" aria-label="Confirm SOS"><div><MdEmergency /><h2>Send emergency SOS?</h2><p>Your live location and gate assignment will be sent to the control room and nearby officers.</p><button className="ap-sos-send" onClick={sendSos}>Send SOS now</button><button className="ap-sos-cancel" onClick={() => setSosConfirm(false)}>Cancel</button></div></div>}

      {/* ── Tabs ──────────────────────────────────────────────── */}
      <nav className="ap-tabs">
        <button className={tab === "card" ? "active" : ""} onClick={() => setTab("card")}>
          <MdBadge /> Card code
        </button>
        <button className={tab === "visitor" ? "active" : ""} onClick={() => setTab("visitor")}>
          <MdConfirmationNumber /> Visitor code
        </button>
        <button className={tab === "walkin"  ? "active amber" : "amber"} onClick={() => setTab("walkin")}>
          <MdPersonAdd /> Walk-in
        </button>
        <button className={tab === "exit"    ? "active amber" : "amber"} onClick={() => setTab("exit")}>
          <MdExitToApp /> Exit code
        </button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}> 
          <MdHistory /> History
        </button>
      </nav>

      {/* ── Tab content ───────────────────────────────────────── */}
      <div className="ap-content">
        {tab === "card" && <CardCodeTab gate={gate} headers={headers} isOnline={isOnline} />}
        {tab === "visitor" && <VisitorTab gate={gate} headers={headers} isOnline={isOnline} onVerified={() => {}} />}
        {tab === "walkin"  && <WalkInTab  gate={gate} headers={headers} isOnline={isOnline} merchants={merchants} />}
        {tab === "exit" && <ExitTab gate={gate} headers={headers} isOnline={isOnline} onExited={() => {}} />}
        {tab === "history" && <HistoryTab events={events} onRefresh={() => loadEvents(evtPage)} decisionClass={decisionClass} />}
      </div>
      <WalkieReceiver socket={walkieSocket} userName={session.user.name} />
    </div>
  );
}

// ── ScanTab — QR card verification ───────────────────────────────────────
function CardCodeTab({ gate, headers, isOnline }) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const verify = async () => {
    const value = code.trim().toUpperCase();
    if (!value || busy) return;
    if (!isOnline) { setResult({ decision: "DENIED", reason: "Offline — card code cannot be verified." }); return; }
    setBusy(true); setResult(null);
    try {
      const response = await fetch(`${API}/access/verify`, { method: "POST", headers, body: JSON.stringify({ token: value, direction: "ENTRY", gate, idempotencyKey: `card-${value}-${Date.now()}` }) });
      const data = await response.json();
      setResult({ ...data, decision: data.decision || "DENIED", reason: data.reason || data.message || "Unable to verify card" });
    } catch { setResult({ decision: "DENIED", reason: "Network error — do not allow entry." }); }
    finally { setBusy(false); }
  };
  const allowed = result?.decision === "ALLOWED" || result?.decision === "OVERRIDE_ALLOWED";
  return <div className="ap-tab-panel ap-code-panel">
    <div className="ap-section-hint"><MdBadge /><p>Type the card number printed on the resident’s card. No camera or scanning is required.</p></div>
    <label className="ap-field">Card number<div className="ap-input-row"><MdBadge /><input value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="BVC-ASA-XXXXXXXXXX" autoCapitalize="characters" autoFocus onKeyDown={event => event.key === "Enter" && verify()} /></div></label>
    <button className="ap-verify-btn" onClick={verify} disabled={busy || !code.trim() || !isOnline}><MdVerifiedUser /> {busy ? "Checking…" : "Verify card code"}</button>
    {result && <div className={`ap-result ${allowed ? "allowed" : "denied"}`}><div className="ap-result-head"><span>{result.decision}</span><strong>{result.reason}</strong></div>{result.member && <div className="ap-result-body"><div><small>Resident</small><strong>{result.member.fullName}</strong></div><div><small>Card number</small><strong>{result.member.membershipId}</strong></div><div><small>Association</small><strong>{result.member.neighbourhood}</strong></div><div><small>Status</small><strong>{result.member.cardStatus}</strong></div></div>}</div>}
  </div>;
}

function ScanTab({ gate, session, headers, isOnline, onVerified }) {
  const [inputMode, setInputMode] = useState("camera");
  const [token,    setToken]    = useState("");
  const [result,   setResult]   = useState(null);
  const [busy,     setBusy]     = useState(false);
  const [camOpen,  setCamOpen]  = useState(false);
  const [camErr,   setCamErr]   = useState("");
  const [camStart, setCamStart] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  const videoRef   = useRef(null);
  const streamRef  = useRef(null);
  const timerRef   = useRef(null);
  const photoRef   = useRef(null);
  const lastRef    = useRef({ token: "", at: 0 });

  const stopCam = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCamOpen(false);
  }, []);
  useEffect(() => { if (inputMode !== "camera") stopCam(); }, [inputMode, stopCam]);
  useEffect(() => () => stopCam(), [stopCam]);

  const startCam = useCallback(async () => {
    setCamErr(""); setCamStart(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      setCamOpen(true);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); } }, 50);
      timerRef.current = setInterval(async () => {
        const v = videoRef.current;
        if (!v || v.readyState < 2) return;
        const val = await decodeQR(v);
        if (val) { stopCam(); setToken(decodeQrPayload(val)); verify(decodeQrPayload(val)); }
      }, 500);
    } catch (e) {
      setCamErr(e.name === "NotAllowedError" ? "Camera permission denied." : "Unable to start camera.");
    } finally { setCamStart(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (inputMode === "camera") startCam(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setPhotoErr(""); setPhotoLoading(true);
    try {
      const val = await decodeQRFromFile(file);
      if (val) { setToken(val); verify(val); } else setPhotoErr("No QR code found.");
    } finally { setPhotoLoading(false); if (photoRef.current) photoRef.current.value = ""; }
  };

  const verify = async (v = token) => {
    const value = String(v || "").trim(); if (!value || busy) return;
    if (!isOnline) { setResult({ decision: "DENIED", reason: "Offline — do not allow entry." }); return; }
    const now = Date.now();
    if (lastRef.current.token === value && now - lastRef.current.at < SCAN_COOLDOWN) return;
    lastRef.current = { token: value, at: now };
    setBusy(true); setResult(null);
    try {
      const r = await fetch(`${API}/access/verify`, { method: "POST", headers, body: JSON.stringify({ token: value, direction: "ENTRY", gate, idempotencyKey: `ap-${value}-${now}` }) });
      const d = await r.json();
      setResult({ ...d, decision: d.decision || "ERROR", reason: d.reason || d.message || "Failed" });
      setToken(value); onVerified();
    } catch { setResult({ decision: "DENIED", reason: "Network error — do not allow entry." }); }
    finally { setBusy(false); }
  };

  const dc = d => (d === "ALLOWED" || d === "OVERRIDE_ALLOWED") ? "allowed" : "denied";

  return (
    <div className="ap-tab-panel">
      <div className="ap-mode-tabs">
        <button className={inputMode === "camera" ? "active" : ""} onClick={() => { setInputMode("camera"); setCamErr(""); if (!camOpen) startCam(); }}><MdCameraAlt /> Camera</button>
        <button className={inputMode === "photo"  ? "active" : ""} onClick={() => { setInputMode("photo"); setPhotoErr(""); }}><MdImage /> Photo</button>
        <button className={inputMode === "manual" ? "active" : ""} onClick={() => setInputMode("manual")}><MdKeyboard /> Manual</button>
      </div>

      {inputMode === "camera" && (
        <div className="ap-viewfinder-wrap">
          {camOpen ? (<><video ref={videoRef} autoPlay playsInline muted className="ap-video" /><div className="ap-scan-frame" /><div className="ap-scan-hint">Align QR code</div></>) : (
            <div className="ap-cam-placeholder">
              {camStart ? <><div className="access-spinner" /><span>Starting…</span></> : <><MdCameraAlt size={36} style={{ color: "#c6974c", opacity: 0.7 }} /><span>{camErr || "Camera stopped"}</span><button className="ap-restart-btn" onClick={startCam}>Restart</button></>}
            </div>
          )}
          {camErr && <div className="ap-error">{camErr}</div>}
          {camOpen && <button className="ap-stop-btn" onClick={stopCam}><MdStopCircle /> Stop</button>}
        </div>
      )}
      {inputMode === "photo" && (
        <div className="ap-photo-zone">
          <input ref={photoRef} type="file" accept="image/*" capture="environment" id="ap-photo" style={{ display: "none" }} onChange={handlePhoto} />
          <label htmlFor="ap-photo" className={`ap-photo-label${photoLoading ? " loading" : ""}`}>
            {photoLoading ? <><div className="access-spinner" /><span>Reading…</span></> : <><MdImage size={44} style={{ color: "#c6974c" }} /><strong>Tap to scan photo</strong></>}
          </label>
          {photoErr && <div className="ap-error">{photoErr}</div>}
        </div>
      )}
      {inputMode === "manual" && (
        <label className="ap-field">
          Membership ID or QR value
          <div className="ap-input-row"><MdBadge /><input value={token} onChange={e => setToken(e.target.value)} placeholder="BVC-26-01842" autoFocus onKeyDown={e => { if (e.key === "Enter") verify(); }} /></div>
        </label>
      )}

      {token && inputMode !== "manual" && (
        <div className="ap-scanned-preview"><MdBadge style={{ color: "#c6974c" }} /><span>Scanned: <strong>{token}</strong></span><button onClick={() => setToken("")}><MdClose size={13} /></button></div>
      )}

      <button className="ap-verify-btn" onClick={() => verify()} disabled={busy || !token || !isOnline}>
        <MdVerifiedUser /> {busy ? "Checking…" : "Verify entry"}
      </button>

      {result && (
        <div className={`ap-result ${dc(result.decision)}`}>
          <div className="ap-result-head"><span>{result.decision}</span><strong>{result.reason}</strong></div>
          {result.member && (
            <div className="ap-result-body">
              <div><small>Resident</small><strong>{result.member.fullName}</strong></div>
              <div><small>ID</small><strong>{result.member.membershipId}</strong></div>
              <div><small>Cluster</small><strong>{result.member.neighbourhood}</strong></div>
              <div><small>Status</small><strong>{result.member.cardStatus}</strong></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── VisitorTab — verify resident visitor pass code ────────────────────────
function VisitorTab({ gate, headers, isOnline, onVerified }) {
  const [code,   setCode]   = useState("");
  const [result, setResult] = useState(null);
  const [busy,   setBusy]   = useState(false);

  const verify = async () => {
    const c = code.trim().toUpperCase(); if (!c || busy) return;
    if (!isOnline) { setResult({ decision: "DENIED", reason: "Offline — do not allow entry." }); return; }
    setBusy(true); setResult(null);
    try {
      const r = await fetch(`${API}/visitor/verify`, { method: "POST", headers, body: JSON.stringify({ code: c, gate }) });
      const d = await r.json();
      setResult({ ...d, decision: d.decision || "DENIED" });
      if (d.decision === "ALLOWED") { setCode(""); onVerified(); }
    } catch { setResult({ decision: "DENIED", reason: "Network error — do not allow entry." }); }
    finally { setBusy(false); }
  };

  return (
    <div className="ap-tab-panel">
      <div className="ap-section-hint">
        <MdConfirmationNumber style={{ color: "#c6974c", fontSize: 22 }} />
        <p>Ask the resident's visitor for their 6-character pass code. It is single-use and expires after 24 hours.</p>
      </div>
      <label className="ap-field">
        Visitor pass code
        <div className="ap-input-row"><MdConfirmationNumber style={{ color: "#c6974c" }} />
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            placeholder="e.g. KQJ847" maxLength={6} autoFocus
            style={{ fontFamily: "monospace", fontSize: 22, letterSpacing: 4, fontWeight: 800 }}
            onKeyDown={e => { if (e.key === "Enter") verify(); }} />
        </div>
      </label>
      <button className="ap-verify-btn" onClick={verify} disabled={busy || code.length < 4 || !isOnline}>
        <MdVerifiedUser /> {busy ? "Checking…" : "Verify visitor code"}
      </button>
      {result && (
        <div className={`ap-result ${result.decision === "ALLOWED" ? "allowed" : "denied"}`}>
          <div className="ap-result-head"><span>{result.decision}</span><strong>{result.reason}</strong></div>
          {result.decision === "ALLOWED" && (
            <div className="ap-result-body">
              {result.visitorLabel && <div><small>Visitor</small><strong>{result.visitorLabel}</strong></div>}
              <div><small>Host resident</small><strong>{result.residentName}</strong></div>
              <div><small>Cluster</small><strong>{result.residentNeighbourhood}</strong></div>
              <div><small>Code</small><strong style={{ color: "#ef4444" }}>Consumed</strong></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── WalkInTab — log a guest going to a merchant/business ─────────────────
function WalkInTab({ gate, headers, isOnline, merchants }) {
  const [form, setForm] = useState({ guestName: "", guestPhone: "", merchantId: "", notes: "" });
  const [busy,   setBusy]   = useState(false);
  const [result, setResult] = useState(null);
  const [error,  setError]  = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.guestName.trim() || !form.merchantId) { setError("Guest name and destination are required."); return; }
    if (!isOnline) { setError("Offline — cannot log walk-in."); return; }
    setBusy(true); setError(""); setResult(null);
    const merchant = merchants.find(m => m.id === form.merchantId);
    try {
      const r = await fetch(`${API}/walkin`, { method: "POST", headers, body: JSON.stringify({ guestName: form.guestName.trim(), guestPhone: form.guestPhone.trim() || undefined, merchantId: form.merchantId, merchantName: merchant?.name || "Unknown", gate, notes: form.notes.trim() || undefined }) });
      const d = await r.json();
      if (!r.ok) { setError(d.message || "Failed to log walk-in."); return; }
      setResult({ guestName: form.guestName, destination: merchant?.name });
      setForm({ guestName: "", guestPhone: "", merchantId: "", notes: "" });
    } catch { setError("Network error — could not log walk-in."); }
    finally { setBusy(false); }
  };

  return (
    <div className="ap-tab-panel">
      <div className="ap-section-hint amber">
        <MdPersonAdd style={{ color: "#c6974c", fontSize: 22 }} />
        <p>Log a walk-in guest for a merchant or business. The destination will be notified and must acknowledge before the guest can exit.</p>
      </div>

      {result && (
        <div className="ap-result allowed" style={{ marginBottom: 14 }}>
          <div className="ap-result-head"><span>LOGGED</span><strong>{result.guestName} is heading to {result.destination}</strong></div>
          <p style={{ margin: "8px 14px", fontSize: 12, color: "#9ca3af" }}>The merchant has been notified. Guest can enter. They will need an exit code from the merchant to leave.</p>
        </div>
      )}

      {error && <div className="ap-error" style={{ marginBottom: 12 }}>{error}</div>}

      <form onSubmit={submit} className="ap-walkin-form">
        <label className="ap-field">
          Guest full name *
          <div className="ap-input-row"><MdPerson /><input required value={form.guestName} onChange={e => set("guestName", e.target.value)} placeholder="e.g. Aisha Musa" /></div>
        </label>
        <label className="ap-field">
          Guest phone <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span>
          <div className="ap-input-row"><MdNote /><input value={form.guestPhone} onChange={e => set("guestPhone", e.target.value)} placeholder="e.g. 0803 000 0000" /></div>
        </label>
        <label className="ap-field">
          Going to *
          <select required value={form.merchantId} onChange={e => set("merchantId", e.target.value)} className="ap-select">
            <option value="">— Select merchant / business —</option>
            {merchants.map(m => <option key={m.id} value={m.id}>{m.name} — {m.location}</option>)}
          </select>
        </label>
        <label className="ap-field">
          Notes <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span>
          <div className="ap-input-row"><MdNote /><input value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="e.g. Delivery, appointment" maxLength={300} /></div>
        </label>
        <button type="submit" className="ap-verify-btn amber" disabled={busy || !isOnline}>
          <MdPersonAdd /> {busy ? "Logging…" : "Log walk-in & notify merchant"}
        </button>
      </form>
    </div>
  );
}

// ── ExitTab — verify walk-in exit code ───────────────────────────────────
function ExitTab({ gate, headers, isOnline, onExited }) {
  const [code,   setCode]   = useState("");
  const [result, setResult] = useState(null);
  const [busy,   setBusy]   = useState(false);

  const verify = async () => {
    const c = code.trim(); if (!c || busy) return;
    if (!isOnline) { setResult({ decision: "DENIED", reason: "Offline — cannot verify exit." }); return; }
    setBusy(true); setResult(null);
    try {
      const r = await fetch(`${API}/walkin/exit`, { method: "POST", headers, body: JSON.stringify({ exitCode: c, gate }) });
      const d = await r.json();
      setResult({ ...d, decision: d.decision || "DENIED" });
      if (d.decision === "ALLOWED") { setCode(""); onExited(); }
    } catch { setResult({ decision: "DENIED", reason: "Network error." }); }
    finally { setBusy(false); }
  };

  return (
    <div className="ap-tab-panel">
      <div className="ap-section-hint amber">
        <MdExitToApp style={{ color: "#c6974c", fontSize: 22 }} />
        <p>Enter the 6-digit exit code the guest received from the merchant. Without acknowledgement from the merchant, exit is not permitted.</p>
      </div>
      <label className="ap-field">
        Exit code (from merchant)
        <div className="ap-input-row"><MdConfirmationNumber style={{ color: "#c6974c" }} />
          <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="e.g. 847291" maxLength={6} autoFocus
            style={{ fontFamily: "monospace", fontSize: 22, letterSpacing: 4, fontWeight: 800 }}
            onKeyDown={e => { if (e.key === "Enter") verify(); }} />
        </div>
      </label>
      <button className="ap-verify-btn amber" onClick={verify} disabled={busy || code.length < 4 || !isOnline}>
        <MdExitToApp /> {busy ? "Checking…" : "Verify exit"}
      </button>
      {result && (
        <div className={`ap-result ${result.decision === "ALLOWED" ? "allowed" : "denied"}`}>
          <div className="ap-result-head"><span>{result.decision}</span><strong>{result.reason}</strong></div>
          {result.decision === "ALLOWED" && (
            <div className="ap-result-body">
              <div><small>Guest</small><strong>{result.guestName}</strong></div>
              <div><small>Visited</small><strong>{result.destination}</strong></div>
              <div><small>Entered</small><strong>{result.entryTime ? new Date(result.entryTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}</strong></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── HistoryTab — recent gate events ──────────────────────────────────────
function HistoryTab({ events, onRefresh, decisionClass }) {
  return (
    <div className="ap-tab-panel">
      <button className="ap-refresh-btn" onClick={onRefresh}><MdRefresh /> Refresh</button>
      <div className="ap-events">
        {!events.length && <div className="ap-empty">No gate events yet.</div>}
        {events.map(ev => (
          <div className="ap-event" key={ev.id}>
            <span className={decisionClass(ev.decision)}>
              {ev.direction === "ENTRY" ? <MdLogin /> : <MdLogout />}
            </span>
            <div>
              <strong>{ev.residentName || ev.membershipId}</strong>
              <small>{ev.gate} · {new Date(ev.scannedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small>
              {ev.scanNote && <small style={{ color: "#9ca3af", display: "block" }}>{ev.scanNote}</small>}
            </div>
            <b className={decisionClass(ev.decision)}>{ev.decision === "OVERRIDE_ALLOWED" ? "OVERRIDE" : ev.decision}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
