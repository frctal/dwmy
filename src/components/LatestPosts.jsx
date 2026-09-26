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

function postAuthor(post) {
  return (
    post.profiles?.display_name ||
    post.profiles?.username ||
    "DWMY User"
  );
}

function toDiscussion(row) {
  const discussion = row.discussions;

  return {
    id: discussion.id,
    discussionType: discussion.discussion_type,

    sectionId: discussion.section_id,

    section:
      discussion.sections?.name || "Market",

    instrumentId: discussion.instrument_id,

    instrument:
      discussion.instruments?.symbol ||
      discussion.title ||
      "Discussion",

    instrumentName:
      discussion.instruments?.name || "",

    segmentType: discussion.segment_type,
    segmentStart: discussion.segment_start,
    segmentEnd: discussion.segment_end,

    title:
      discussion.title ||
      `${
        discussion.instruments?.symbol ||
        "Market"
      } - ${discussion.segment_start}`,

    locked: discussion.is_locked || false,

    replies: discussion.reply_count || 0,

    lastActivityAt:
      discussion.last_activity_at,
  };
}

export default function LatestPosts({
  openDiscussion,
}) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] =
    useState(true);

  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("posts")
        .select(`
          id,
          public_ref,
          body,
          author_id,
          is_deleted,
          created_at,
          profiles!posts_author_id_fkey (
            id,
            username,
            display_name
          ),
          attachments (
            id,
            storage_bucket,
            storage_path,
            file_name
          ),
          discussions (
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
              slug
            ),
            instruments (
              id,
              symbol,
              name,
              slug
            )
          )
        `)
        .eq("is_deleted", false)
        .order("created_at", {
          ascending: false,
        })
        .limit(20);

      if (error) {
        console.error(
          "Latest posts load failed:",
          error
        );

        setError(error.message);
        setPosts([]);
      } else {
        const visiblePosts = (data || [])
          .filter(
            (post) =>
              post.discussions &&
              !post.discussions.is_deleted
          )
          .slice(0, 8);

        setPosts(visiblePosts);
      }

      setLoading(false);
    }

    load();
  }, []);

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Latest Posts</h2>

        <span className="muted">
          Across the forum
        </span>
      </div>

      <div className="latest-posts">
        {loading && (
          <div className="market-directory-state">
            Loading posts...
          </div>
        )}

        {!loading && error && (
          <div className="market-directory-state">
            {error}
          </div>
        )}

        {!loading &&
          !error &&
          posts.length === 0 && (
            <div className="market-directory-state">
              No posts yet.
            </div>
          )}

        {!loading &&
          !error &&
          posts.map((post) => {
            const author = postAuthor(post);

            const discussion =
              toDiscussion(post);

            const hasImage =
              (post.attachments || []).length > 0;

            const preview =
              post.body ||
              (hasImage
                ? "Shared an image"
                : "New post");

            return (
              <button
                className="latest-post"
                key={post.id}
                onClick={() => {
                  openDiscussion(discussion);
                  if (post.public_ref) {
                    window.location.hash = post.public_ref;
                    setTimeout(
                      () =>
                        document
                          .getElementById(post.public_ref)
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          }),
                      250
                    );
                  }
                }}
              >
                <div className="mini-avatar">
                  {author[0]?.toUpperCase() || "D"}
                </div>

                <div>
                  <div className="latest-topline">
                    <strong>
                      {discussion.instrument}
                    </strong>

                    <span className="latest-context">
                      {discussion.segmentType ||
                        discussion.section}
                    </span>

                    {discussion.locked && (
                      <span className="segment-badge">
                        LOCKED
                      </span>
                    )}
                  </div>

                  <p>
                    {preview.length > 120
                      ? `${preview.slice(0, 120)}...`
                      : preview}
                  </p>

                  <small>
                    {author}
                    <span className="meta-separator">
                      /
                    </span>
                    {formatActivity(
                      post.created_at
                    )}

                    {hasImage && (
                      <>
                        <span className="meta-separator">
                          /
                        </span>
                        image
                      </>
                    )}
                  </small>
                </div>
              </button>
            );
          })}
      </div>
    </section>
  );
}