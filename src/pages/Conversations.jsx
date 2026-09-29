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
    createdBy: row.created_by,
    createdAt: row.created_at,

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
  const [conversationPeople, setConversationPeople] = useState({});

  const totalParticipants = new Set(
    Object.values(conversationPeople)
      .flatMap((people) => [
        people?.starter?.id,
        ...(people?.participants || []).map((profile) => profile?.id),
      ])
      .filter(Boolean)
  ).size;

  async function loadConversationPeople(rows) {
    const discussionIds = (rows || []).map((row) => row.id);
    if (!discussionIds.length) {
      setConversationPeople({});
      return;
    }

    const { data: postRows, error: postError } = await supabase
      .from("posts")
      .select(`
        discussion_id,
        author_id,
        created_at,
        profiles!posts_author_id_fkey (
          id,
          username,
          display_name,
          avatar_path
        )
      `)
      .in("discussion_id", discussionIds)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true });

    if (postError) {
      console.error("Conversation people load failed:", postError);
      setConversationPeople({});
      return;
    }

    const profiles = new Map();
    for (const row of rows || []) {
      if (row.profiles?.id) profiles.set(row.profiles.id, row.profiles);
    }
    for (const post of postRows || []) {
      if (post.profiles?.id) profiles.set(post.profiles.id, post.profiles);
    }

    const signed = new Map();
    await Promise.all(Array.from(profiles.values()).map(async (profile) => {
      let avatarUrl = null;
      if (profile.avatar_path) {
        const { data, error } = await supabase.storage
          .from("avatars")
          .createSignedUrl(profile.avatar_path, 60 * 60);
        if (!error) avatarUrl = data?.signedUrl || null;
      }
      signed.set(profile.id, { ...profile, avatar_url: avatarUrl });
    }));

    const next = {};
    for (const row of rows || []) {
      const threadPosts = (postRows || []).filter((post) => post.discussion_id === row.id);
      const starter = signed.get(row.created_by) || signed.get(threadPosts[0]?.author_id) || null;
      const participantIds = [];
      for (const post of threadPosts) {
        if (post.author_id && post.author_id !== row.created_by && !participantIds.includes(post.author_id)) {
          participantIds.push(post.author_id);
        }
      }
      next[row.id] = {
        starter,
        participants: participantIds.map((id) => signed.get(id)).filter(Boolean),
      };
    }
    setConversationPeople(next);
  }

  function profileName(profile) {
    return profile?.display_name || profile?.username || "DWMY User";
  }

  function ProfileBubble({ profile, small = false }) {
    const name = profileName(profile);
    return (
      <span className={`conversation-person-bubble ${small ? "small" : ""}`} title={name}>
        {profile?.avatar_url ? <img src={profile.avatar_url} alt="" loading="lazy" /> : (name[0]?.toUpperCase() || "D")}
      </span>
    );
  }

  function ParticipantStack({ people = [], limit = 4 }) {
    const shown = people.slice(0, limit);
    const remaining = Math.max(0, people.length - shown.length);
    return (
      <span className="conversation-participant-stack">
        {shown.map((profile) => <ProfileBubble key={profile.id} profile={profile} small />)}
        {remaining > 0 && <span className="conversation-participant-more">+{remaining}</span>}
      </span>
    );
  }

  function renderConversationIdentity(conversation) {
    const people = conversationPeople[conversation.id] || {};
    const starter = people.starter;
    const participants = people.participants || [];
    const count = participants.length;

    return (
      <div className="conversation-identity conversation-identity-starter">
        <ProfileBubble profile={starter} />

        <span className="identity-copy">
          <small>Started by</small>
          <strong>{profileName(starter)}</strong>
        </span>

        {count > 0 && (
          <span className="identity-participants">
            <small>Participants</small>
            <ParticipantStack people={participants} />
          </span>
        )}
      </div>
    );
  }

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
        profiles!discussions_created_by_fkey (
          id,
          username,
          display_name,
          avatar_path
        ),
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
      await loadConversationPeople(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadConversations();
  }, []);

  function createConversation(event) {
    event.preventDefault();
    const clean = title.trim();
    if (!clean || !section) return;
    setCreating(true);
    setError("");
    const draftDiscussion = {
      id: `draft-conversation:${section.id}:${crypto.randomUUID()}`,
      discussionType: "CONVERSATION",
      sectionId: section.id,
      section: section.name || "Conversations",
      instrumentId: null,
      instrument: clean,
      instrumentName: null,
      segmentType: null,
      segmentStart: null,
      segmentEnd: null,
      title: clean,
      locked: false,
      isDeleted: false,
      replies: 0,
      lastActivityAt: null,
      isDraft: true,
      onDraftPublished: (publishedDiscussion) => {
        setTitle("");
        setShowCreate(false);
        setCreating(false);
        openDiscussion(publishedDiscussion);
      },
    };
    setShowCreate(false);
    setCreating(false);
    openDiscussion(draftDiscussion);
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
            {conversations.length} active · {totalParticipants}{" "}
            {totalParticipants === 1 ? "participant" : "participants"}
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

                  {conversation.locked && (
                    <div className="discussion-meta">
                      <span className="segment-badge">
                        LOCKED
                      </span>
                    </div>
                  )}
                  {renderConversationIdentity(conversation)}
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
      <style>{`
        .conversation-person-bubble {
          width: 34px;
          height: 34px;
          flex: 0 0 34px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border: 1px solid var(--border);
          background: var(--surface);
          font-size: 12px;
          font-weight: 800;
        }

        .conversation-person-bubble.small {
          width: 25px;
          height: 25px;
          flex-basis: 25px;
          font-size: 10px;
        }

        .conversation-person-bubble img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .conversation-participant-stack {
          display: inline-flex;
          align-items: center;
          padding-left: 5px;
        }

        .conversation-participant-stack .conversation-person-bubble {
          margin-left: -5px;
          box-shadow: 0 0 0 2px var(--panel);
        }

        .conversation-participant-more {
          margin-left: 5px;
          font-size: 11px;
          font-weight: 700;
          opacity: 0.7;
        }

        .conversation-identity-starter {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 9px;
          font-size: 12px;
        }

        .identity-copy {
          display: flex;
          flex-direction: column;
        }

        .conversation-identity-starter small {
          opacity: 0.58;
        }

        .identity-participants {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-left: 8px;
        }

        @media (max-width: 760px) {
          .conversation-identity-starter {
            align-items: flex-start;
            flex-wrap: wrap;
          }

          .identity-participants {
            margin-left: 0;
          }
        }
      `}</style>
    </div>
  );
}