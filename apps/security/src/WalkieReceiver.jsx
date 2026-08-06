import { useCallback, useEffect, useRef, useState } from "react";
import { MdMic, MdRadio, MdSignalWifi4Bar, MdSignalWifiOff, MdVolumeUp } from "react-icons/md";
import { WALKIE_RTC_CONFIG } from "./walkieRtc.js";

export default function WalkieReceiver({ socket, userName = "Officer" }) {
  const [control, setControl] = useState(null);
  const [connected, setConnected] = useState(false);
  const [floor, setFloor] = useState(null);
  const [transmitting, setTransmitting] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  const [minimised, setMinimised] = useState(true);
  const radioPeer = useRef(null);
  const talkbackPeer = useRef(null);
  const micStream = useRef(null);
  const audio = useRef(null);
  const controlId = useRef(null);
  const pttHeld = useRef(false);

  const closeTalkback = useCallback(() => {
    micStream.current?.getTracks().forEach((track) => track.stop());
    micStream.current = null;
    talkbackPeer.current?.close();
    talkbackPeer.current = null;
    setTransmitting(false);
    setRequesting(false);
  }, []);

  const stopTransmit = useCallback(() => {
    pttHeld.current = false;
    socket?.emit("walkie:floor:release");
    closeTalkback();
  }, [closeTalkback, socket]);

  const closeRadio = useCallback(() => {
    radioPeer.current?.close();
    radioPeer.current = null;
    if (audio.current) { audio.current.srcObject = null; audio.current.remove(); audio.current = null; }
    setConnected(false);
  }, []);

  const startTransmit = useCallback(() => {
    if (!socket || !controlId.current || transmitting || requesting || (floor && floor.socketId !== socket.id)) return;
    pttHeld.current = true;
    setError(""); setRequesting(true);
    socket.emit("walkie:floor:request", {}, async (reply) => {
      if (!reply?.granted) {
        setRequesting(false); setError(reply?.message || "The radio channel is busy."); return;
      }
      if (!pttHeld.current) { socket.emit("walkie:floor:release"); setRequesting(false); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
          video: false,
        });
        if (!pttHeld.current) {
          stream.getTracks().forEach((track) => track.stop());
          socket.emit("walkie:floor:release");
          setRequesting(false);
          return;
        }
        micStream.current = stream;
        const pc = new RTCPeerConnection(WALKIE_RTC_CONFIG);
        talkbackPeer.current = pc;
        stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));
        pc.onicecandidate = ({ candidate }) => candidate && socket.emit("walkie:signal", { target: controlId.current, link: "talkback", candidate });
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("walkie:signal", { target: controlId.current, link: "talkback", sdp: pc.localDescription });
        setTransmitting(true); setRequesting(false);
      } catch (reason) {
        socket.emit("walkie:floor:release");
        closeTalkback();
        setError(`Microphone unavailable: ${reason.message}`);
      }
    });
  }, [closeTalkback, floor, requesting, socket, transmitting]);

  useEffect(() => {
    if (!socket) return undefined;
    const join = () => socket.emit("walkie:join", { role: "field", name: userName }, (reply) => {
      if (reply?.control) { controlId.current = reply.control.socketId; setControl(reply.control); }
      setFloor(reply?.floor || null);
    });
    const onControlOnline = (next) => { controlId.current = next.socketId; setControl(next); };
    const onControlOffline = () => {
      controlId.current = null; setControl(null); setFloor(null); closeTalkback(); closeRadio();
    };
    const onFloor = (next) => {
      setFloor(next?.active ? next : null);
      if (!next?.active) closeTalkback();
    };
    const onSignal = async ({ from, link, sdp, candidate }) => {
      if (link === "radio") {
        let pc = radioPeer.current;
        if (sdp?.type === "offer") {
          closeRadio();
          pc = new RTCPeerConnection(WALKIE_RTC_CONFIG);
          radioPeer.current = pc;
          pc.onicecandidate = ({ candidate: next }) => next && socket.emit("walkie:signal", { target: from, link: "radio", candidate: next });
          pc.ontrack = async ({ streams }) => {
            const element = document.createElement("audio");
            Object.assign(element, { autoplay: true, playsInline: true, srcObject: streams[0] });
            element.style.display = "none";
            document.body.appendChild(element);
            audio.current = element;
            await element.play().catch(() => setError("Open the radio panel and tap Enable audio."));
            setConnected(!element.paused);
          };
          pc.onconnectionstatechange = () => {
            if (["failed", "closed", "disconnected"].includes(pc.connectionState)) setConnected(false);
          };
          await pc.setRemoteDescription(sdp);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("walkie:signal", { target: from, link: "radio", sdp: pc.localDescription });
          controlId.current = from;
          setControl((current) => current || { socketId: from, name: "Control Room" });
        } else if (candidate && pc) await pc.addIceCandidate(candidate).catch(() => {});
        return;
      }
      if (link === "talkback") {
        const pc = talkbackPeer.current;
        if (sdp?.type === "answer" && pc) await pc.setRemoteDescription(sdp);
        if (candidate && pc) await pc.addIceCandidate(candidate).catch(() => {});
      }
    };
    socket.on("connect", join);
    socket.on("walkie:control:online", onControlOnline);
    socket.on("walkie:control:offline", onControlOffline);
    socket.on("walkie:floor", onFloor);
    socket.on("walkie:signal", onSignal);
    if (socket.connected) join();
    return () => {
      socket.emit("walkie:leave");
      socket.off("connect", join); socket.off("walkie:control:online", onControlOnline);
      socket.off("walkie:control:offline", onControlOffline); socket.off("walkie:floor", onFloor);
      socket.off("walkie:signal", onSignal);
    };
  }, [closeRadio, closeTalkback, socket, userName]);

  useEffect(() => () => { closeTalkback(); closeRadio(); }, [closeRadio, closeTalkback]);

  const channelBusy = Boolean(floor && floor.socketId !== socket?.id);
  const enableAudio = () => audio.current?.play().then(() => { setConnected(true); setError(""); }).catch(() => {});

  return <aside className={`walkie-receiver ${minimised ? "minimised" : ""} ${transmitting || floor ? "active" : ""}`}>
    <button className="walkie-receiver-toggle" onClick={() => setMinimised((value) => !value)} title="Security radio">
      <MdRadio size={19} /> {!minimised && <span>Security radio</span>}
      <i className={`walkie-dot ${control ? "online" : "offline"}`} />{floor && <i className="walkie-dot talking" />}
    </button>
    {!minimised && <div className="walkie-receiver-body">
      <div className="walkie-receiver-status">
        <span>{control ? <MdSignalWifi4Bar /> : <MdSignalWifiOff />}{control ? "Control room online" : "Control room offline"}</span>
        <span><MdVolumeUp />{connected ? "Radio audio connected" : "Waiting for radio audio"}</span>
      </div>
      {error && <p className="walkie-error">{error}</p>}
      {!connected && audio.current && <button className="walkie-secondary-btn" onClick={enableAudio}>Enable audio</button>}
      {floor && <div className="walkie-floor-indicator"><span className="walkie-live-dot" /><strong>{floor.socketId === socket?.id ? "You are" : floor.name}</strong> transmitting</div>}
      <button className={`walkie-ptt-btn ${transmitting ? "active" : ""}`} disabled={!control || channelBusy || requesting}
        onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); startTransmit(); }}
        onPointerUp={stopTransmit} onPointerCancel={stopTransmit} onPointerLeave={() => transmitting && stopTransmit()}
        onContextMenu={(event) => event.preventDefault()}>
        <MdMic size={19} /> {requesting ? "Requesting channel…" : transmitting ? "Transmitting… release to stop" : channelBusy ? `Busy — ${floor.name}` : "Hold to talk"}
      </button>
      <small className="walkie-ptt-hint">Your voice goes to every security phone and through the control-room radio to every analogue walkie-talkie.</small>
    </div>}
  </aside>;
}
