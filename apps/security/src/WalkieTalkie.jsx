import { useCallback, useEffect, useRef, useState } from "react";
import { MdClose, MdGraphicEq, MdRadio, MdRefresh, MdSignalWifi4Bar, MdSignalWifiOff, MdVolumeUp } from "react-icons/md";
import { WALKIE_RTC_CONFIG } from "./walkieRtc.js";

const RAW_AUDIO = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 };

export default function WalkieTalkie({ socket, userName = "Control Room", onClose }) {
  const [online, setOnline] = useState(false);
  const [peers, setPeers] = useState([]);
  const [floor, setFloor] = useState(null);
  const [error, setError] = useState("");
  const [inputs, setInputs] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [inputId, setInputId] = useState(() => localStorage.getItem("walkie-radio-input") || "");
  const [outputId, setOutputId] = useState(() => localStorage.getItem("walkie-radio-output") || "");
  const [level, setLevel] = useState(0);
  const [minimised, setMinimised] = useState(false);
  const radioStream = useRef(null);
  const receivePeers = useRef({});
  const talkbackPeers = useRef({});
  const remoteAudio = useRef({});
  const phoneBroadcast = useRef({ track: null, speakerId: null });
  const meterCleanup = useRef(null);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    setInputs(devices.filter((device) => device.kind === "audioinput"));
    setOutputs(devices.filter((device) => device.kind === "audiooutput"));
  }, []);

  useEffect(() => {
    refreshDevices().catch(() => {});
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
  }, [refreshDevices]);

  const closeReceivePeer = useCallback((id) => {
    receivePeers.current[id]?.close();
    delete receivePeers.current[id];
  }, []);

  const closeTalkbackPeer = useCallback((id) => {
    talkbackPeers.current[id]?.close();
    delete talkbackPeers.current[id];
    const audio = remoteAudio.current[id];
    if (audio) { audio.srcObject = null; audio.remove(); delete remoteAudio.current[id]; }
  }, []);

  const broadcastTrack = useCallback((track, speakerId = null) => {
    if (!track) return;
    Object.entries(receivePeers.current).forEach(([peerId, pc]) => {
      // Keep the speaker on the radio input so their own voice is not returned as an echo.
      if (speakerId && peerId === speakerId) return;
      const sender = pc.getSenders().find((item) => item.track?.kind === "audio");
      sender?.replaceTrack(track).catch(() => {});
    });
  }, []);

  const restoreRadioBroadcast = useCallback(() => {
    phoneBroadcast.current = { track: null, speakerId: null };
    const [radioTrack] = radioStream.current?.getAudioTracks() || [];
    if (radioTrack) broadcastTrack(radioTrack);
  }, [broadcastTrack]);

  const offerRadioAudio = useCallback(async (target) => {
    if (!radioStream.current || !socket) return;
    closeReceivePeer(target);
    const pc = new RTCPeerConnection(WALKIE_RTC_CONFIG);
    receivePeers.current[target] = pc;
    const activePhone = phoneBroadcast.current;
    const track = activePhone.track && activePhone.speakerId !== target
      ? activePhone.track
      : radioStream.current.getAudioTracks()[0];
    if (track) pc.addTrack(track, new MediaStream([track]));
    pc.onicecandidate = ({ candidate }) => candidate && socket.emit("walkie:signal", { target, link: "radio", candidate });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("walkie:signal", { target, link: "radio", sdp: pc.localDescription });
  }, [closeReceivePeer, socket]);

  const startMeter = useCallback((stream) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let frame;
    const update = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
      setLevel(Math.min(100, Math.round(Math.sqrt(sum / samples.length) * 240)));
      frame = requestAnimationFrame(update);
    };
    update();
    meterCleanup.current = () => { cancelAnimationFrame(frame); context.close().catch(() => {}); setLevel(0); };
  }, []);

  const goOnline = useCallback(async () => {
    if (!socket) { setError("The control-room connection is not ready."); return; }
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: inputId ? { ...RAW_AUDIO, deviceId: { exact: inputId } } : RAW_AUDIO,
        video: false,
      });
      radioStream.current = stream;
      localStorage.setItem("walkie-radio-input", inputId);
      localStorage.setItem("walkie-radio-output", outputId);
      startMeter(stream);
      await refreshDevices();
      socket.emit("walkie:join", { role: "control", name: userName }, (reply) => {
        if (!reply?.ok) {
          setError(reply?.message || "Unable to register the radio gateway.");
          stream.getTracks().forEach((track) => track.stop());
          radioStream.current = null;
          meterCleanup.current?.();
          return;
        }
        setPeers(reply.peers || []);
        setFloor(reply.floor || null);
        setOnline(true);
        (reply.peers || []).forEach((peer) => offerRadioAudio(peer.socketId));
      });
    } catch (reason) { setError(`Radio input unavailable: ${reason.message}`); }
  }, [inputId, offerRadioAudio, outputId, refreshDevices, socket, startMeter, userName]);

  const goOffline = useCallback(() => {
    socket?.emit("walkie:leave");
    radioStream.current?.getTracks().forEach((track) => track.stop());
    radioStream.current = null;
    meterCleanup.current?.();
    Object.keys(receivePeers.current).forEach(closeReceivePeer);
    Object.keys(talkbackPeers.current).forEach(closeTalkbackPeer);
    setOnline(false); setPeers([]); setFloor(null);
  }, [closeReceivePeer, closeTalkbackPeer, socket]);

  useEffect(() => {
    if (!socket) return undefined;
    const onPeerJoined = (peer) => {
      setPeers((current) => current.some((item) => item.socketId === peer.socketId) ? current : [...current, peer]);
      if (radioStream.current) offerRadioAudio(peer.socketId).catch(() => {});
    };
    const onPeerLeft = ({ socketId }) => {
      setPeers((current) => current.filter((peer) => peer.socketId !== socketId));
      closeReceivePeer(socketId); closeTalkbackPeer(socketId);
    };
    const onFloor = (next) => {
      setFloor(next?.active ? next : null);
      if (!next?.active) restoreRadioBroadcast();
    };
    const onSignal = async ({ from, link, sdp, candidate }) => {
      if (link === "radio") {
        const pc = receivePeers.current[from];
        if (sdp?.type === "answer" && pc) await pc.setRemoteDescription(sdp);
        if (candidate && pc) await pc.addIceCandidate(candidate).catch(() => {});
        return;
      }
      if (link !== "talkback") return;
      let pc = talkbackPeers.current[from];
      if (sdp?.type === "offer") {
        closeTalkbackPeer(from);
        pc = new RTCPeerConnection(WALKIE_RTC_CONFIG);
        talkbackPeers.current[from] = pc;
        pc.onicecandidate = ({ candidate: next }) => next && socket.emit("walkie:signal", { target: from, link: "talkback", candidate: next });
        pc.ontrack = async ({ streams, track }) => {
          phoneBroadcast.current = { track, speakerId: from };
          broadcastTrack(track, from);
          track.onended = () => {
            if (phoneBroadcast.current.track === track) restoreRadioBroadcast();
          };
          const audio = document.createElement("audio");
          Object.assign(audio, { autoplay: true, playsInline: true, srcObject: streams[0] });
          audio.style.display = "none";
          document.body.appendChild(audio);
          remoteAudio.current[from] = audio;
          if (outputId && typeof audio.setSinkId === "function") await audio.setSinkId(outputId).catch(() => setError("The selected radio output could not be opened."));
          await audio.play().catch(() => setError("Click the page once to allow radio talk-back audio."));
        };
        await pc.setRemoteDescription(sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("walkie:signal", { target: from, link: "talkback", sdp: pc.localDescription });
      } else if (candidate && pc) await pc.addIceCandidate(candidate).catch(() => {});
    };
    socket.on("walkie:peer:joined", onPeerJoined);
    socket.on("walkie:peer:left", onPeerLeft);
    socket.on("walkie:floor", onFloor);
    socket.on("walkie:signal", onSignal);
    return () => {
      socket.off("walkie:peer:joined", onPeerJoined); socket.off("walkie:peer:left", onPeerLeft);
      socket.off("walkie:floor", onFloor); socket.off("walkie:signal", onSignal);
    };
  }, [broadcastTrack, closeReceivePeer, closeTalkbackPeer, offerRadioAudio, outputId, restoreRadioBroadcast, socket]);

  useEffect(() => () => goOffline(), [goOffline]);

  return <section className={`walkie-panel walkie-control ${minimised ? "minimised" : ""}`}>
    {onClose && <button className="walkie-modal-close" type="button" onClick={onClose} aria-label="Close radio gateway"><MdClose /></button>}
    <button className="walkie-header" type="button" onClick={() => setMinimised((value) => !value)}>
      <MdRadio size={20} /><span><strong>Analogue radio gateway</strong><small>Control room</small></span>
      <em className={`walkie-status ${online ? "online" : ""}`}>{online ? <><MdSignalWifi4Bar /> Live</> : <><MdSignalWifiOff /> Offline</>}</em>
    </button>
    {!minimised && <>
      {error && <p className="walkie-error">{error}</p>}
      {!online ? <div className="walkie-setup">
        <label className="walkie-device-label">Radio receive input<select value={inputId} onChange={(event) => setInputId(event.target.value)} className="walkie-device-select"><option value="">Default audio input</option>{inputs.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Audio input ${index + 1}`}</option>)}</select></label>
        <label className="walkie-device-label">Radio transmit output<select value={outputId} onChange={(event) => setOutputId(event.target.value)} className="walkie-device-select"><option value="">Default audio output</option>{outputs.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Audio output ${index + 1}`}</option>)}</select></label>
        <p className="walkie-hardware-note">Audio/VOX mode is ready for testing. Direct cable PTT control will be selected when the interface hardware is confirmed.</p>
        <div className="walkie-actions"><button className="walkie-go-btn" onClick={goOnline}><MdRadio /> Start gateway</button><button className="walkie-secondary-btn" onClick={refreshDevices}><MdRefresh /> Refresh devices</button></div>
      </div> : <>
        <div className="walkie-meter-row"><MdGraphicEq /><span>Radio receive level</span><div className="walkie-meter"><i style={{ width: `${level}%` }} /></div></div>
        <div className="walkie-route"><MdVolumeUp /> Phone talk-back routes to <strong>{outputs.find((item) => item.deviceId === outputId)?.label || "default output"}</strong></div>
        {floor && <div className="walkie-floor-indicator"><span className="walkie-live-dot" /><strong>{floor.name}</strong> is transmitting to all phones and radios</div>}
        <div className="walkie-peers">{peers.length ? peers.map((peer) => <span className={`walkie-peer ${floor?.socketId === peer.socketId ? "talking" : ""}`} key={peer.socketId}>{peer.name}</span>) : <span className="walkie-no-peers">No field phones connected</span>}</div>
        <button className="walkie-offline-btn" onClick={goOffline}>Stop gateway</button>
      </>}
    </>}
  </section>;
}
