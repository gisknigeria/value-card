import { useCallback, useEffect, useMemo, useState } from "react";
import { MdClose, MdHistory, MdLogin, MdLogout, MdRefresh, MdFilterList } from "react-icons/md";

const API = "/api";

export default function AccessHistoryPanel({ session, onClose }) {
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [evtPage, setEvtPage] = useState(0);
  const [filterGate, setFilterGate] = useState("");
  const [filterDecision, setFilterDecision] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(false);

  const headers = useMemo(() => ({ Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" }), [session.token]);
  const PAGE_SIZE = 12;

  const loadEvents = useCallback(async (page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (filterGate) params.set("gate", filterGate);
      if (filterDecision) params.set("decision", filterDecision);
      const response = await fetch(`${API}/access/events?${params.toString()}`, { headers });
      if (!response.ok) return;
      const data = await response.json();
      setEvents(data.events ?? data);
      setTotal(data.total ?? 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filterGate, filterDecision, headers]);

  useEffect(() => { loadEvents(evtPage); }, [loadEvents, evtPage]);

  const decisionClass = (d = "") => (d === "ALLOWED" || d === "OVERRIDE_ALLOWED") ? "allowed" : "denied";

  return (
    <div className="access-modal-backdrop">
      <section className="access-modal access-history-modal" aria-label="Gate history">
        <header className="access-head">
          <div>
            <span className="eyebrow">HISTORY</span>
            <h2><MdHistory /> Gate access log</h2>
            <p>Recent gate activity for security and control room review.</p>
          </div>
          <button className="access-close" onClick={onClose} aria-label="Close history"><MdClose /></button>
        </header>

        <div className="access-history-body">
          <div className="access-history-title">
            <MdHistory />
            <div>
              <strong>Recent gate activity</strong>
              <span>Shared security audit log</span>
            </div>
            <button
              className="access-filter-btn"
              onClick={() => setShowFilters((v) => !v)}
              title="Toggle filters"
              aria-label="Toggle filters"
            >
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
              <button type="button" onClick={() => { setFilterGate(""); setFilterDecision(""); }}>
                Clear
              </button>
            </div>
          )}

          <div className="access-events">
            {loading && <div className="access-loading">Loading history…</div>}
            {!loading && !events.length && <div className="access-empty">No gate scans recorded yet.</div>}
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
          </div>

          {total > PAGE_SIZE && (
            <div className="access-pagination">
              <button disabled={evtPage === 0} onClick={() => setEvtPage(evtPage - 1)}>← Previous</button>
              <span>{evtPage * PAGE_SIZE + 1}–{Math.min((evtPage + 1) * PAGE_SIZE, total)} of {total}</span>
              <button disabled={(evtPage + 1) * PAGE_SIZE >= total} onClick={() => setEvtPage(evtPage + 1)}>Next →</button>
            </div>
          )}

          <button className="access-refresh-btn" onClick={() => loadEvents(evtPage)} title="Refresh events">
            <MdRefresh /> Refresh
          </button>
        </div>
      </section>
    </div>
  );
}
