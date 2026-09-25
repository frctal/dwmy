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
    section: row.sections?.name || "Conversations",

    instrumentId: null,
    instrument: null,
    instrumentName: null,

    segmentType: null,
    segmentStart: null,
    segmentEnd: null,

    title: row.title,

    locked: row.is_locked || false,
    isDeleted: row.is_deleted || false,

    replies: row.reply_count || 0,
    lastActivityAt: row.last_activity_at,
  };
}

export default function Conversations({
  user,
  openDiscussion,
}) {
  const [conversations, setConversations] =
    useState([]);

  const [section, setSection] = useState(null);

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] =
    useState(false);

  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  async function loadConversations() {
    setLoading(true);
    setError("");

    const {
      data: sectionRow,
      error: sectionError,
    } = await supabase
      .from("sections")
      .select("id, name, slug, section_type")
      .eq("section_type", "GENERAL")
      .eq("slug", "conversations")
      .single();

    if (sectionError) {
      console.error(
        "Conversations section load failed:",
        sectionError
      );

      setError(sectionError.message);
      setLoading(false);
      return;
    }

    setSection(sectionRow);

    const {
      data,
      error: discussionsError,
    } = await supabase
      .from("discussions")
      .select(`
        id,
        discussion_type,
        section_id,
        title,
        created_by,
        created_at,
        last_activity_at,
        reply_count,
        is_locked,
        is_deleted,
        sections (
          id,
          name,
          slug,
          section_type
        )
      `)
      .eq("discussion_type", "CONVERSATION")
      .eq("section_id", sectionRow.id)
      .eq("is_deleted", false)
      .order("last_activity_at", {
        ascending: false,
      });

    if (discussionsError) {
      console.error(
        "Conversations load failed:",
        discussionsError
      );

      setError(discussionsError.message);
      setConversations([]);
    } else {
      setConversations(
        (data || []).map(toDiscussion)
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    loadConversations();
  }, []);

  async function createConversation(event) {
    event.preventDefault();

    const clean = title.trim();

    if (!clean || !section) return;

    setCreating(true);
    setError("");

    const {
      data,
      error: createError,
    } = await supabase
      .from("discussions")
      .insert({
        discussion_type: "CONVERSATION",
        section_id: section.id,
        instrument_id: null,
        segment_type: null,
        segment_start: null,
        segment_end: null,
        title: clean,
        created_by: user.id,
      })
      .select(`
        id,
        discussion_type,
        section_id,
        title,
        created_by,
        created_at,
        last_activity_at,
        reply_count,
        is_locked,
        is_deleted,
        sections (
          id,
          name,
          slug,
          section_type
        )
      `)
      .single();

    if (createError) {
      console.error(
        "Conversation creation failed:",
        createError
      );

      setError(createError.message);
      setCreating(false);
      return;
    }

    setTitle("");
    setShowCreate(false);
    setCreating(false);

    openDiscussion(toDiscussion(data));
  }

  return (
    <div className="conversations-page">
      <section className="hero conversations-hero">
        <div>
          <span className="eyebrow">
            DWMY Conversations
          </span>

          <h1>
            Talk about the market beyond a single
            period.
          </h1>

          <p>
            Free-form discussions for strategy,
            options, psychology, trading, research,
            and everything around the market.
          </p>
        </div>

        <div>
          <button
            className="primary-button"
            onClick={() =>
              setShowCreate((current) => !current)
            }
          >
            + New Conversation
          </button>
        </div>
      </section>

      {error && (
        <div className="discussion-open-error">
          {error}
        </div>
      )}

      {showCreate && (
        <form
          className="create-section"
          onSubmit={createConversation}
        >
          <label>
            Conversation title

            <input
              value={title}
              onChange={(event) =>
                setTitle(event.target.value)
              }
              placeholder="e.g. Site Improvements Welcome"
              maxLength={160}
              autoFocus
            />
          </label>

          <div className="form-actions">
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setTitle("");
              }}
              disabled={creating}
            >
              Cancel
            </button>

            <button
              className="primary-button"
              type="submit"
              disabled={
                creating || !title.trim()
              }
            >
              {creating
                ? "Creating..."
                : "Create Conversation"}
            </button>
          </div>
        </form>
      )}

      <section className="panel">
        <div className="panel-heading">
          <h2>Conversations</h2>

          <span className="muted">
            {conversations.length} active
          </span>
        </div>

        <div className="discussion-list">
          {loading && (
            <div className="market-directory-state">
              Loading conversations...
            </div>
          )}

          {!loading &&
            conversations.length === 0 &&
            !error && (
              <div className="market-directory-state">
                No conversations yet. Start the first
                one.
              </div>
            )}

          {!loading &&
            conversations.map((conversation) => (
              <div
                className="discussion-row"
                key={conversation.id}
                role="button"
                tabIndex={0}
                onClick={() =>
                  openDiscussion(conversation)
                }
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" ||
                    event.key === " "
                  ) {
                    openDiscussion(conversation);
                  }
                }}
              >
                <div>
                  <div className="discussion-symbol">
                    {conversation.title}
                  </div>

                  <div className="discussion-meta">
                    <span className="segment-badge">
                      CONVERSATION
                    </span>

                    {conversation.locked && (
                      <span className="segment-badge">
                        LOCKED
                      </span>
                    )}

                    <span>
                      DWMY Community
                    </span>
                  </div>
                </div>

                <div className="discussion-stats">
                  <strong>
                    {conversation.replies}
                  </strong>

                  <span>
                    {conversation.replies === 1
                      ? "post"
                      : "posts"}
                  </span>
                </div>

                <div className="activity">
                  <strong>
                    {conversation.locked
                      ? "Locked"
                      : "Active"}
                  </strong>

                  <span>
                    {formatActivity(
                      conversation.lastActivityAt
                    )}
                  </span>
                </div>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}