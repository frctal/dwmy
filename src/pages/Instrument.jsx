import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const SEGMENTS = ["DAY", "WEEK", "MONTH", "YEAR"];
const ET_ZONE = "America/New_York";

function partsInET(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseISO(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function shiftISO(value, days) {
  const date = parseISO(value);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function mondayForISO(value) {
  const date = parseISO(value);
  const day = date.getUTCDay();
  const distance = day === 0 ? 6 : day - 1;
  return shiftISO(value, -distance);
}

function currentMarketPeriod(segment, now = new Date()) {
  const et = partsInET(now);
  const today = isoDate(Number(et.year), Number(et.month), Number(et.day));
  const hour = Number(et.hour);
  const minute = Number(et.minute);
  const after1700 = hour > 17 || (hour === 17 && minute >= 0);
  const weekday = et.weekday;

  if (segment === "DAY") {
    if (weekday === "Sat") return null;
    if (weekday === "Sun") return after1700 ? { start: shiftISO(today, 1), end: shiftISO(today, 1) } : null;
    if (weekday === "Fri" && after1700) return null;
    const start = after1700 ? shiftISO(today, 1) : today;
    return { start, end: start };
  }

  if (segment === "WEEK") {
    let start = mondayForISO(today);
    if (weekday === "Fri" && after1700) start = shiftISO(start, 7);
    if (weekday === "Sat" || weekday === "Sun") start = shiftISO(mondayForISO(today), 7);
    return { start, end: shiftISO(start, 4) };
  }

  const year = Number(et.year);
  const month = Number(et.month);
  if (segment === "MONTH") {
    const end = new Date(Date.UTC(year, month, 0, 12));
    return { start: isoDate(year, month, 1), end: isoDate(year, month, end.getUTCDate()) };
  }
  return { start: isoDate(year, 1, 1), end: isoDate(year, 12, 31) };
}

function formatPeriodTitle(symbol, segment, startDate) {
  const date = parseISO(startDate);
  const options = { timeZone: "UTC" };
  if (segment === "DAY") return `${symbol} - ${date.toLocaleDateString(undefined, { ...options, month: "long", day: "numeric", year: "numeric" })}`;
  if (segment === "WEEK") return `${symbol} - Week of ${date.toLocaleDateString(undefined, { ...options, month: "long", day: "numeric", year: "numeric" })}`;
  if (segment === "MONTH") return `${symbol} - ${date.toLocaleDateString(undefined, { ...options, month: "long", year: "numeric" })}`;
  return `${symbol} - ${startDate.slice(0, 4)}`;
}

function periodStatus(segment, start, activePeriod) {
  if (!activePeriod) return "ARCHIVED";
  if (start === activePeriod.start) return "ACTIVE";
  return start < activePeriod.start ? "ARCHIVED" : "UPCOMING";
}

export default function Instrument({ section, instrument, openDiscussion, goBack, user }) {
  const [statsWindow, setStatsWindow] = useState("7D");
  const [marketStats, setMarketStats] = useState(null);
  const [marketStatsLoading, setMarketStatsLoading] = useState(true);

  const [segment, setSegment] = useState("DAY");
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const activePeriod = useMemo(() => currentMarketPeriod(segment), [segment]);
  const activeTitle = activePeriod ? formatPeriodTitle(instrument.symbol, segment, activePeriod.start) : "";

  useEffect(() => {
    let alive = true;
    async function loadHistory() {
      setHistoryLoading(true);
      const { data, error: historyError } = await supabase
        .from("discussions")
        .select("id,discussion_type,section_id,instrument_id,segment_type,segment_start,segment_end,created_by,created_at,last_activity_at,reply_count,is_locked")
        .eq("discussion_type", "MARKET_SEGMENT")
        .eq("instrument_id", instrument.id)
        .eq("segment_type", segment)
        .order("segment_start", { ascending: false })
        .limit(60);
      if (!alive) return;
      if (historyError) {
        console.error("Market history load failed:", historyError);
        setError(historyError.message);
        setHistory([]);
      } else {
        setHistory(data || []);
      }
      setHistoryLoading(false);
    }
    loadHistory();
    return () => { alive = false; };
  }, [instrument.id, segment]);

  useEffect(() => {
    let alive = true;

    async function loadMarketStats() {
      setMarketStatsLoading(true);
      const lookbackDays = statsWindow === "7D" ? 7 : statsWindow === "30D" ? 30 : 36500;

      const { data, error: statsError } = await supabase.rpc("get_instrument_statistics", {
        target_instrument_id: instrument.id,
        lookback_days: lookbackDays,
        trader_limit: 5,
      });

      if (!alive) return;
      if (statsError) {
        console.error("Instrument statistics load failed:", statsError);
        setMarketStats(null);
      } else {
        setMarketStats(data || null);
      }
      setMarketStatsLoading(false);
    }

    loadMarketStats();
    return () => { alive = false; };
  }, [instrument.id, statsWindow]);

  function discussionPayload(discussion, title, replyOnly = false) {
    return {
      ...discussion,
      section: section.name,
      instrument: instrument.symbol,
      instrumentId: instrument.id,
      segmentType: discussion.segment_type,
      segmentStart: discussion.segment_start,
      segmentEnd: discussion.segment_end,
      title,
      replies: discussion.reply_count || 0,
      lastActivity: discussion.last_activity_at,
      author: user.username,
      marketReplyOnly: replyOnly,
    };
  }

  async function openExisting(discussion) {
    const status = periodStatus(segment, discussion.segment_start, activePeriod);
    openDiscussion(discussionPayload(
      discussion,
      formatPeriodTitle(instrument.symbol, segment, discussion.segment_start),
      status === "ARCHIVED"
    ));
  }

  async function getOrCreateDiscussion() {
    if (!user?.id || !activePeriod) return;
    setOpening(true);
    setError("");
    try {
      const { data: existing, error: lookupError } = await supabase
        .from("discussions")
        .select("id,discussion_type,section_id,instrument_id,segment_type,segment_start,segment_end,created_by,created_at,last_activity_at,reply_count,is_locked")
        .eq("discussion_type", "MARKET_SEGMENT")
        .eq("instrument_id", instrument.id)
        .eq("segment_type", segment)
        .eq("segment_start", activePeriod.start)
        .maybeSingle();
      if (lookupError) throw lookupError;

      let discussion = existing;
      if (!discussion) {
        const { data: created, error: createError } = await supabase
          .from("discussions")
          .insert({
            discussion_type: "MARKET_SEGMENT",
            section_id: section.id,
            instrument_id: instrument.id,
            segment_type: segment,
            segment_start: activePeriod.start,
            segment_end: activePeriod.end,
            created_by: user.id,
          })
          .select("id,discussion_type,section_id,instrument_id,segment_type,segment_start,segment_end,created_by,created_at,last_activity_at,reply_count,is_locked")
          .single();
        if (createError) {
          if (createError.code !== "23505") throw createError;
          const { data: winner, error: winnerError } = await supabase
            .from("discussions")
            .select("id,discussion_type,section_id,instrument_id,segment_type,segment_start,segment_end,created_by,created_at,last_activity_at,reply_count,is_locked")
            .eq("discussion_type", "MARKET_SEGMENT")
            .eq("instrument_id", instrument.id)
            .eq("segment_type", segment)
            .eq("segment_start", activePeriod.start)
            .single();
          if (winnerError) throw winnerError;
          discussion = winner;
        } else discussion = created;
      }
      openDiscussion(discussionPayload(discussion, activeTitle, false));
    } catch (err) {
      console.error("Canonical discussion open failed:", err);
      setError(err.message || "Unable to open this discussion.");
    } finally {
      setOpening(false);
    }
  }

  const previousThreads = history.filter((item) => !activePeriod || item.segment_start !== activePeriod.start);

  return (
    <div className="instrument-page">
      <nav className="market-breadcrumb" aria-label="Market breadcrumb">
        <button onClick={goBack}>{section.name}</button><span>&gt;</span>
        <button className="current-instrument" onClick={() => setSegment("DAY")}>{instrument.symbol}</button><span>&gt;</span>
        <strong>{segment}</strong>
      </nav>

      <div className="instrument-hero">
        <div className="instrument-identity">
          <span className="eyebrow">{section.name}</span>
          <h1>{instrument.symbol}</h1>
          <p>{instrument.name}</p>
        </div>

        <div className="instrument-stats-panel">
          <div className="instrument-stats-head">
            <div>
              <span className="eyebrow">Market Activity</span>
              <strong>Instrument Statistics</strong>
            </div>
            <div className="instrument-stats-windows">
              {["7D", "30D", "ALL"].map((windowName) => (
                <button key={windowName} className={statsWindow === windowName ? "active" : ""} onClick={() => setStatsWindow(windowName)}>
                  {windowName}
                </button>
              ))}
            </div>
          </div>

          {marketStatsLoading ? (
            <div className="instrument-stats-loading">Measuring activity...</div>
          ) : marketStats ? (
            <>
              <div className="instrument-stat-grid">
                <div><strong>{marketStats.contribution_count || 0}</strong><span>Contributions</span></div>
                <div><strong>{marketStats.trader_count || 0}</strong><span>Traders</span></div>
                <div><strong>{marketStats.discussion_count || 0}</strong><span>Discussions</span></div>
                <div><strong>{marketStats.latest_activity_at ? new Date(marketStats.latest_activity_at).toLocaleDateString() : "—"}</strong><span>Latest</span></div>
              </div>

              <div className="instrument-resolution-stats">
                {["DAY", "WEEK", "MONTH", "YEAR"].map((resolution) => (
                  <div key={resolution}><span>{resolution}</span><strong>{marketStats.resolutions?.[resolution] || 0}</strong></div>
                ))}
              </div>

              <div className="instrument-top-traders">
                <div className="instrument-top-traders-title"><span>Top Traders</span><small>{statsWindow} CONTRIBUTIONS</small></div>
                {(marketStats.top_traders || []).length ? marketStats.top_traders.map((trader, index) => (
                  <div className="instrument-top-trader" key={trader.user_id}>
                    <span><b>{index + 1}</b>{trader.display_name || trader.username}</span>
                    <strong>{trader.contributions}</strong>
                  </div>
                )) : <div className="instrument-stats-empty">No contributions in this window.</div>}
              </div>
            </>
          ) : <div className="instrument-stats-empty">Statistics unavailable.</div>}
        </div>
      </div>

      <div className="segment-selector">
        {SEGMENTS.map((item) => (
          <button key={item} className={segment === item ? "active" : ""} onClick={() => { setSegment(item); setError(""); }}>
            {item}
          </button>
        ))}
      </div>

      {activePeriod ? (
        <section className="period-card">
          <div>
            <span className="type-label">ACTIVE {segment} DISCUSSION</span>
            <h2>{activeTitle}</h2>
            <p>{segment === "DAY" ? "FX trade day · 5:00 PM to 4:59 PM ET." : segment === "WEEK" ? "Weekly discussion remains active through Friday 4:59 PM ET." : "One permanent discussion is allowed for this instrument and period."}</p>
          </div>
          <button className="primary-button" onClick={getOrCreateDiscussion} disabled={opening}>
            {opening ? "Opening..." : "Open Discussion ->"}
          </button>
        </section>
      ) : (
        <section className="market-closed-card">
          <span className="type-label">MARKET CLOSED</span>
          <h2>Enjoy your weekend.</h2>
          <p>No weekend daily thread is created. The next FX daily discussion opens Sunday at 5:00 PM ET.</p>
        </section>
      )}

      {error && <div className="discussion-open-error">{error}</div>}

      <section className="market-history">
        <div className="market-history-heading">
          <div><span className="eyebrow">Archive</span><h2>Previous {segment.toLowerCase()} discussions</h2></div>
          <span>{previousThreads.length} available</span>
        </div>

        {historyLoading ? (
          <div className="market-history-state">Loading discussion history...</div>
        ) : previousThreads.length === 0 ? (
          <div className="market-history-state">No previous {segment.toLowerCase()} discussions yet.</div>
        ) : (
          <div className="market-history-list">
            {previousThreads.map((discussion) => (
              <button key={discussion.id} onClick={() => openExisting(discussion)}>
                <span className="history-dot" />
                <span className="history-copy">
                  <strong>{formatPeriodTitle(instrument.symbol, segment, discussion.segment_start)}</strong>
                  <small>Archived · replies remain open</small>
                </span>
                <span className="history-meta">{discussion.reply_count || 0} posts&nbsp;&nbsp; &gt;</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {activePeriod && (
        <div className="coordinate-card">
          <span>Canonical coordinate</span>
          <code>{instrument.id} + {segment.toLowerCase()} + {activePeriod.start}</code>
        </div>
      )}
    </div>
  );
}
