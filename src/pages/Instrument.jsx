import { useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function startOfWeek(date) {
  const result = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  const day = result.getDay();
  const distanceFromMonday = day === 0 ? 6 : day - 1;

  result.setDate(
    result.getDate() - distanceFromMonday
  );

  return result;
}

function getPeriod(segment) {
  const now = new Date();

  let start;
  let end;

  if (segment === "DAY") {
    start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    end = new Date(start);
  }

  if (segment === "WEEK") {
    start = startOfWeek(now);

    end = new Date(start);
    end.setDate(end.getDate() + 6);
  }

  if (segment === "MONTH") {
    start = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

    end = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0
    );
  }

  if (segment === "YEAR") {
    start = new Date(
      now.getFullYear(),
      0,
      1
    );

    end = new Date(
      now.getFullYear(),
      11,
      31
    );
  }

  return {
    start: localDateString(start),
    end: localDateString(end),
  };
}

function formatPeriodTitle(symbol, segment, startDate) {
  const [year, month, day] =
    startDate.split("-").map(Number);

  const date = new Date(
    year,
    month - 1,
    day
  );

  if (segment === "DAY") {
    return `${symbol} - ${date.toLocaleDateString(
      undefined,
      {
        month: "long",
        day: "numeric",
        year: "numeric",
      }
    )}`;
  }

  if (segment === "WEEK") {
    return `${symbol} - Week of ${date.toLocaleDateString(
      undefined,
      {
        month: "long",
        day: "numeric",
        year: "numeric",
      }
    )}`;
  }

  if (segment === "MONTH") {
    return `${symbol} - ${date.toLocaleDateString(
      undefined,
      {
        month: "long",
        year: "numeric",
      }
    )}`;
  }

  return `${symbol} - ${year}`;
}

export default function Instrument({
  section,
  instrument,
  openDiscussion,
  goBack,
  user,
}) {
  const [segment, setSegment] = useState("DAY");
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  const period = useMemo(
    () => getPeriod(segment),
    [segment]
  );

  const displayTitle = formatPeriodTitle(
    instrument.symbol,
    segment,
    period.start
  );

  async function getOrCreateDiscussion() {
    if (!user?.id) {
      setError("Your DWMY identity is not available.");
      return;
    }

    setOpening(true);
    setError("");

    try {
      const {
        data: existing,
        error: lookupError,
      } = await supabase
        .from("discussions")
        .select(`
          id,
          discussion_type,
          section_id,
          instrument_id,
          segment_type,
          segment_start,
          segment_end,
          created_by,
          created_at,
          last_activity_at,
          reply_count
        `)
        .eq("discussion_type", "MARKET_SEGMENT")
        .eq("instrument_id", instrument.id)
        .eq("segment_type", segment)
        .eq("segment_start", period.start)
        .maybeSingle();

      if (lookupError) {
        throw lookupError;
      }

      let discussion = existing;

      if (!discussion) {
        const {
          data: created,
          error: createError,
        } = await supabase
          .from("discussions")
          .insert({
            discussion_type: "MARKET_SEGMENT",
            section_id: section.id,
            instrument_id: instrument.id,
            segment_type: segment,
            segment_start: period.start,
            segment_end: period.end,
            created_by: user.id,
          })
          .select(`
            id,
            discussion_type,
            section_id,
            instrument_id,
            segment_type,
            segment_start,
            segment_end,
            created_by,
            created_at,
            last_activity_at,
            reply_count
          `)
          .single();

        if (createError) {
          if (createError.code === "23505") {
            const {
              data: winner,
              error: winnerError,
            } = await supabase
              .from("discussions")
              .select(`
                id,
                discussion_type,
                section_id,
                instrument_id,
                segment_type,
                segment_start,
                segment_end,
                created_by,
                created_at,
                last_activity_at,
                reply_count
              `)
              .eq(
                "discussion_type",
                "MARKET_SEGMENT"
              )
              .eq(
                "instrument_id",
                instrument.id
              )
              .eq("segment_type", segment)
              .eq(
                "segment_start",
                period.start
              )
              .single();

            if (winnerError) {
              throw winnerError;
            }

            discussion = winner;
          } else {
            throw createError;
          }
        } else {
          discussion = created;
        }
      }

      openDiscussion({
        ...discussion,
        section: section.name,
        instrument: instrument.symbol,
        instrumentId: instrument.id,
        segmentType: discussion.segment_type,
        segmentStart: discussion.segment_start,
        segmentEnd: discussion.segment_end,
        title: displayTitle,
        replies: discussion.reply_count || 0,
        lastActivity: discussion.last_activity_at,
        author: user.username,
      });
    } catch (err) {
      console.error(
        "Canonical discussion open failed:",
        err
      );

      setError(
        err.message ||
          "Unable to open this discussion."
      );
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="instrument-page">
      <button
        className="back-link"
        onClick={goBack}
      >
        &lt;- Back to markets
      </button>

      <div className="instrument-hero">
        <span className="eyebrow">
          {section.name}
        </span>

        <h1>{instrument.symbol}</h1>
        <p>{instrument.name}</p>
      </div>

      <div className="segment-selector">
        {["DAY", "WEEK", "MONTH", "YEAR"].map(
          (item) => (
            <button
              key={item}
              className={
                segment === item ? "active" : ""
              }
              onClick={() => {
                setSegment(item);
                setError("");
              }}
            >
              {item}
            </button>
          )
        )}
      </div>

      <section className="period-card">
        <div>
          <span className="type-label">
            CANONICAL {segment} DISCUSSION
          </span>

          <h2>{displayTitle}</h2>

          <p>
            One permanent discussion is allowed for
            this instrument and period.
          </p>
        </div>

        <button
          className="primary-button"
          onClick={getOrCreateDiscussion}
          disabled={opening}
        >
          {opening
            ? "Opening..."
            : "Open Discussion ->"}
        </button>
      </section>

      {error && (
        <div className="discussion-open-error">
          {error}
        </div>
      )}

      <div className="coordinate-card">
        <span>Canonical coordinate</span>

        <code>
          {instrument.id} +{" "}
          {segment.toLowerCase()} +{" "}
          {period.start}
        </code>
      </div>
    </div>
  );
}
