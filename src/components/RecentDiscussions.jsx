import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function formatActivity(timestamp) {
  if (!timestamp) return "";

  const seconds = Math.max(
    0,
    Math.floor(
      (Date.now() - new Date(timestamp).getTime()) / 1000
    )
  );

  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

function toDiscussion(row) {
  return {
    id: row.id,
    discussionType: row.discussion_type,

    sectionId: row.section_id,
    section: row.sections?.name || "Market",

    instrumentId: row.instrument_id,

    instrument:
      row.instruments?.symbol ||
      row.title ||
      "Discussion",

    instrumentName:
      row.instruments?.name || "",

    segmentType: row.segment_type,
    segmentStart: row.segment_start,
    segmentEnd: row.segment_end,

    title:
      row.title ||
      `${row.instruments?.symbol || "Market"} - ${
        row.segment_start
      }`,

    locked: row.is_locked || false,

    replies: row.reply_count || 0,
    lastActivityAt: row.last_activity_at,
  };
}

export default function RecentDiscussions({
  openDiscussion,
}) {
  const [discussions, setDiscussions] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("discussions")
        .select(`
          id,
          discussion_type,
          section_id,
          instrument_id,
          segment_type,
          segment_start,
          segment_end,
          title,
          reply_count,
          last_activity_at,
          is_locked,
          is_deleted,
          sections (
            id,
            name,
            slug,
            section_type
          ),
          instruments (
            id,
            symbol,
            name,
            slug
          )
        `)
        .eq("is_deleted", false)
        .order("last_activity_at", {
          ascending: false,
        })
        .limit(8);

      if (error) {
        console.error(
          "Recent discussions load failed:",
          error
        );

        setError(error.message);
        setDiscussions([]);
      } else {
        setDiscussions(
          (data || []).map(toDiscussion)
        );
      }

      setLoading(false);
    }

    load();
  }, []);

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Recent Discussions</h2>

        <span className="muted">
          Active now
        </span>
      </div>

      <div className="discussion-list">
        {loading && (
          <div className="market-directory-state">
            Loading activity...
          </div>
        )}

        {!loading && error && (
          <div className="market-directory-state">
            {error}
          </div>
        )}

        {!loading &&
          !error &&
          discussions.length === 0 && (
            <div className="market-directory-state">
              No discussions yet.
            </div>
          )}

        {!loading &&
          !error &&
          discussions.map((discussion) => (
            <button
              className="discussion-row"
              key={discussion.id}
              onClick={() =>
                openDiscussion(discussion)
              }
            >
              <div>
                <div className="discussion-symbol">
                  {discussion.instrument}
                </div>

                <div className="discussion-meta">
                  {discussion.segmentType && (
                    <span className="segment-badge">
                      {discussion.segmentType}
                    </span>
                  )}

                  {discussion.locked && (
                    <span className="segment-badge">
                      LOCKED
                    </span>
                  )}

                  <span>
                    {discussion.segmentStart ||
                      discussion.section}
                  </span>
                </div>
              </div>

              <div className="discussion-stats">
                <strong>
                  {discussion.replies}
                </strong>

                <span>
                  {discussion.replies === 1
                    ? "post"
                    : "posts"}
                </span>
              </div>

              <div className="activity">
                <strong>
                  {discussion.section}
                </strong>

                <span>
                  {formatActivity(
                    discussion.lastActivityAt
                  )}
                </span>
              </div>
            </button>
          ))}
      </div>
    </section>
  );
}