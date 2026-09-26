import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const IMAGE_BUCKET = "post-images";

function normalizeMessageSpacing(value = "") {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function makeImageRecord(file) {
  return {
    id: crypto.randomUUID(),
    file,
    url: URL.createObjectURL(file),
    name: file.name || "clipboard-image.png",
  };
}

function formatPostTime(timestamp) {
  if (!timestamp) return "";

  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function safeExtension(file) {
  const extensions = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };

  return extensions[file.type] || "png";
}

function storagePath(userId, file) {
  return `${userId}/${crypto.randomUUID()}.${safeExtension(
    file
  )}`;
}

function imageDimensions(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      resolve({
        width: image.naturalWidth || null,
        height: image.naturalHeight || null,
      });

      URL.revokeObjectURL(url);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);

      resolve({
        width: null,
        height: null,
      });
    };

    image.src = url;
  });
}

const MARKET_ET_ZONE = "America/New_York";

function marketETParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_ET_ZONE,
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

function marketISO(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function marketParseISO(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function marketShiftISO(value, days) {
  const date = marketParseISO(value);
  date.setUTCDate(date.getUTCDate() + days);
  return marketISO(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function marketMondayForISO(value) {
  const date = marketParseISO(value);
  const day = date.getUTCDay();
  const distance = day === 0 ? 6 : day - 1;
  return marketShiftISO(value, -distance);
}

function activeMarketStart(segment, now = new Date()) {
  const et = marketETParts(now);
  const today = marketISO(Number(et.year), Number(et.month), Number(et.day));
  const hour = Number(et.hour);
  const minute = Number(et.minute);
  const after1700 = hour > 17 || (hour === 17 && minute >= 0);

  if (segment === "DAY") {
    if (et.weekday === "Sat") return null;
    if (et.weekday === "Sun") return after1700 ? marketShiftISO(today, 1) : null;
    if (et.weekday === "Fri" && after1700) return null;
    return after1700 ? marketShiftISO(today, 1) : today;
  }

  if (segment === "WEEK") {
    let start = marketMondayForISO(today);
    if (et.weekday === "Fri" && after1700) start = marketShiftISO(start, 7);
    if (et.weekday === "Sat" || et.weekday === "Sun") start = marketShiftISO(marketMondayForISO(today), 7);
    return start;
  }

  // MONTH/YEAR keep their current V1 navigation-provided state until their
  // exact rollover contract is frozen.
  return null;
}

function isArchivedMarketDiscussion(discussion) {
  const segment = discussion.segmentType || discussion.segment_type;
  const start = discussion.segmentStart || discussion.segment_start;
  if (!segment || !start) return false;

  const activeStart = activeMarketStart(segment);
  if (segment === "DAY" || segment === "WEEK") {
    // During the weekend DAY has no active coordinate, so every existing DAY
    // discussion is historical/reply-only.
    if (!activeStart) return segment === "DAY";
    return start < activeStart;
  }

  return false;
}

const COMPOSER_EMOJIS = [
  "😀", "😂", "🙂", "😍", "🤝", "👍", "👎", "🔥", "🚀", "💡",
  "📈", "📉", "💰", "🎯", "⚡", "👀", "✅", "❌", "⚠️", "💎",
  "🧠", "🫡", "🙏", "💯"
];

export default function Discussion({
  discussion,
  goBack,
  user,
  onMessageUser,
}) {
  const [posts, setPosts] = useState([]);
  const [reply, setReply] = useState("");
  const [replyTarget, setReplyTarget] = useState(null);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionSuggestions, setMentionSuggestions] = useState([]);
  const [reactions, setReactions] = useState({});
  const [images, setImages] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [conversationTitle, setConversationTitle] =
    useState(discussion.title || "");

  const [conversationLocked, setConversationLocked] =
    useState(Boolean(discussion.locked));

  const [showModeration, setShowModeration] =
    useState(false);

  const [renamingConversation, setRenamingConversation] =
    useState(false);

  const [conversationTitleDraft, setConversationTitleDraft] =
    useState(discussion.title || "");

  const [moderating, setModerating] =
    useState(false);

  const previewRef = useRef([]);
  const composerRef = useRef(null);

  const isAdmin =
    user.roles?.includes("ADMIN") ||
    user.role === "admin";

  const isConversation =
    discussion.discussionType === "CONVERSATION";

  const isMarketSegment =
    discussion.discussionType === "MARKET_SEGMENT";

  // Archived market state must be derivable inside the discussion itself.
  // Do not rely only on the Instrument page passing marketReplyOnly: a user can
  // arrive here from Latest Posts, notifications, a hash/deep link, etc.
  const marketReplyOnly =
    isMarketSegment &&
    (Boolean(discussion.marketReplyOnly) || isArchivedMarketDiscussion(discussion));

  const draftKey = `dwmy:discussion-draft:${user.id}:${discussion.id}`;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(draftKey);
      if (saved) setReply(saved);
    } catch (err) {
      console.warn("Draft restore unavailable:", err);
    }
  }, [draftKey]);

  useEffect(() => {
    try {
      if (reply) window.localStorage.setItem(draftKey, reply);
      else window.localStorage.removeItem(draftKey);
    } catch (err) {
      console.warn("Draft save unavailable:", err);
    }
  }, [draftKey, reply]);

  useEffect(() => {
    previewRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => {
      previewRef.current.forEach((image) =>
        URL.revokeObjectURL(image.url)
      );
    };
  }, []);

  async function hydrateAttachments(rows) {
    return Promise.all(
      (rows || []).map(async (post) => {
        const attachments = await Promise.all(
          (post.attachments || []).map(
            async (attachment) => {
              const { data, error } =
                await supabase.storage
                  .from(
                    attachment.storage_bucket ||
                      IMAGE_BUCKET
                  )
                  .createSignedUrl(
                    attachment.storage_path,
                    3600
                  );

              if (error) {
                console.error(
                  "Signed URL failed:",
                  error
                );

                return null;
              }

              return {
                ...attachment,
                url: data.signedUrl,
              };
            }
          )
        );

        let avatarUrl = null;

        if (post.profiles?.avatar_path) {
          const { data: avatarData, error: avatarError } =
            await supabase.storage
              .from("avatars")
              .createSignedUrl(post.profiles.avatar_path, 3600);

          if (avatarError) {
            console.error("Avatar signed URL failed:", avatarError);
          } else {
            avatarUrl = avatarData?.signedUrl || null;
          }
        }

        return {
          ...post,
          profiles: post.profiles
            ? { ...post.profiles, avatar_url: avatarUrl }
            : post.profiles,
          attachments: attachments.filter(Boolean),
        };
      })
    );
  }

  async function loadPosts() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("posts")
      .select(`
        id,
        public_ref,
        discussion_id,
        author_id,
        reply_to_id,
        body,
        is_edited,
        is_deleted,
        created_at,
        updated_at,
        profiles!posts_author_id_fkey (
          id,
          username,
          display_name,
          signature,
          avatar_path,
          post_count
        ),
        attachments (
          id,
          storage_bucket,
          storage_path,
          file_name,
          mime_type,
          file_size,
          width,
          height
        )
      `)
      .eq("discussion_id", discussion.id)
      .order("created_at", {
        ascending: true,
      });

    if (error) {
      console.error(error);
      setError(error.message);
      setPosts([]);
    } else {
      setPosts(
        await hydrateAttachments(data || [])
      );
    }

    if (!error) {
      await loadReactions(data || []);
    }

    setLoading(false);
  }

  async function loadReactions(rows) {
    const ids = (rows || []).map((row) => row.id);
    if (!ids.length) { setReactions({}); return; }
    const { data, error } = await supabase
      .from("post_reactions")
      .select("post_id, user_id, reaction_type")
      .in("post_id", ids)
      .eq("reaction_type", "LIKE");
    if (error) { console.error("Reaction load failed:", error); return; }
    const next = {};
    ids.forEach((id) => { next[id] = { count: 0, liked: false }; });
    (data || []).forEach((row) => {
      next[row.post_id] ||= { count: 0, liked: false };
      next[row.post_id].count += 1;
      if (row.user_id === user.id) next[row.post_id].liked = true;
    });
    setReactions(next);
  }

  async function toggleLike(post) {
    const state = reactions[post.id] || { count: 0, liked: false };
    setError("");
    if (state.liked) {
      const { error } = await supabase.from("post_reactions").delete()
        .eq("post_id", post.id).eq("user_id", user.id).eq("reaction_type", "LIKE");
      if (error) { setError(error.message); return; }
    } else {
      const { error } = await supabase.from("post_reactions").insert({
        post_id: post.id, user_id: user.id, reaction_type: "LIKE"
      });
      if (error) { setError(error.message); return; }
    }
    await loadReactions(posts);
  }

  function beginReply(post) {
    setReplyTarget(post);
    const username = post.profiles?.username;
    if (username && !reply.trim()) setReply(`@${username} `);
    setTimeout(() => document.getElementById("dwmy-reply-composer")?.focus(), 0);
  }

  function threadProfiles() {
    const seen = new Map();

    posts.forEach((post) => {
      const profile = post.profiles;
      if (profile?.id && profile?.username && profile.id !== user.id) {
        seen.set(profile.id, profile);
      }
    });

    return Array.from(seen.values()).sort((a, b) =>
      a.username.localeCompare(b.username)
    );
  }

  function updateMentionSuggestions(value, cursorPosition = value.length) {
    const beforeCursor = value.slice(0, cursorPosition);
    const match = beforeCursor.match(/(?:^|\s)@([A-Za-z0-9_]*)$/);

    if (!match) {
      setMentionQuery(null);
      setMentionSuggestions([]);
      return;
    }

    const query = match[1].toLowerCase();
    const matches = threadProfiles()
      .filter((profile) =>
        profile.username.toLowerCase().startsWith(query)
      )
      .slice(0, 8);

    setMentionQuery({
      start: beforeCursor.lastIndexOf("@"),
      end: cursorPosition,
    });
    setMentionSuggestions(matches);
  }

  function handleReplyChange(event) {
    const value = normalizeMessageSpacing(event.target.value);
    setReply(value);
    updateMentionSuggestions(value, event.target.selectionStart);
  }

  function chooseMention(profile) {
    if (!mentionQuery) return;

    const next =
      reply.slice(0, mentionQuery.start) +
      `@${profile.username} ` +
      reply.slice(mentionQuery.end);

    setReply(next);
    setMentionQuery(null);
    setMentionSuggestions([]);

    setTimeout(() => {
      const composer = document.getElementById("dwmy-reply-composer");
      composer?.focus();
    }, 0);
  }

  async function loadConversationState() {
    if (!isConversation) return;

    const { data, error } = await supabase.rpc(
      "get_conversation_state",
      {
        target_discussion_id: discussion.id,
      }
    );

    if (error) {
      console.error(
        "Conversation state load failed:",
        error
      );
      return;
    }

    const state = data?.[0];

    if (!state) return;

    setConversationTitle(
      state.title || discussion.title || ""
    );

    setConversationTitleDraft(
      state.title || discussion.title || ""
    );

    setConversationLocked(
      Boolean(state.is_locked)
    );

    if (state.is_deleted) {
      goBack();
    }
  }

  useEffect(() => {
    loadPosts();
    loadConversationState();
  }, [discussion.id]);

  useEffect(() => {
    if (loading || posts.length === 0) return;

    const targetRef = decodeURIComponent(
      window.location.hash.replace(/^#/, "")
    );

    if (!targetRef?.toUpperCase().startsWith("FRCTAL-")) return;

    requestAnimationFrame(() => {
      const target = document.getElementById(targetRef);
      if (!target) return;

      target.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [loading, posts]);

  function addFiles(files) {
    const valid = Array.from(files).filter(
      (file) =>
        file.type.startsWith("image/") &&
        file.size <= 10 * 1024 * 1024
    );

    setImages((current) => [
      ...current,
      ...valid.map(makeImageRecord),
    ]);
  }

  function handlePaste(event) {
    const files = Array.from(
      event.clipboardData?.items || []
    )
      .filter((item) =>
        item.type.startsWith("image/")
      )
      .map((item) => item.getAsFile())
      .filter(Boolean);

    if (files.length) addFiles(files);
  }

  function removePreview(id) {
    setImages((current) => {
      const target = current.find(
        (item) => item.id === id
      );

      if (target) {
        URL.revokeObjectURL(target.url);
      }

      return current.filter(
        (item) => item.id !== id
      );
    });
  }

  async function uploadAttachment(postId, record) {
    const file = record.file;
    const path = storagePath(user.id, file);

    const dimensions =
      await imageDimensions(file);

    const { error: uploadError } =
      await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });

    if (uploadError) throw uploadError;

    const { error: metadataError } =
      await supabase
        .from("attachments")
        .insert({
          post_id: postId,
          uploaded_by: user.id,
          storage_bucket: IMAGE_BUCKET,
          storage_path: path,
          file_name:
            file.name ||
            "clipboard-image.png",
          mime_type: file.type,
          file_size: file.size,
          width: dimensions.width,
          height: dimensions.height,
        });

    if (metadataError) {
      await supabase.storage
        .from(IMAGE_BUCKET)
        .remove([path]);

      throw metadataError;
    }
  }

  function replaceComposerSelection(prefix, suffix = prefix, fallback = "text") {
    const composer = composerRef.current;
    if (!composer) return;

    const start = composer.selectionStart ?? reply.length;
    const end = composer.selectionEnd ?? start;
    const selected = reply.slice(start, end) || fallback;
    const next = reply.slice(0, start) + prefix + selected + suffix + reply.slice(end);
    setReply(next);

    requestAnimationFrame(() => {
      composer.focus();
      const cursor = start + prefix.length + selected.length + suffix.length;
      composer.setSelectionRange(cursor, cursor);
    });
  }

  function insertComposerText(text) {
    const composer = composerRef.current;
    if (!composer) return;
    const start = composer.selectionStart ?? reply.length;
    const end = composer.selectionEnd ?? start;
    const next = reply.slice(0, start) + text + reply.slice(end);
    setReply(next);
    setShowEmojiPicker(false);
    requestAnimationFrame(() => {
      composer.focus();
      const cursor = start + text.length;
      composer.setSelectionRange(cursor, cursor);
    });
  }

  function quoteComposerSelection() {
    const composer = composerRef.current;
    if (!composer) return;
    const start = composer.selectionStart ?? reply.length;
    const end = composer.selectionEnd ?? start;
    const selected = reply.slice(start, end) || "quoted text";
    const quoted = selected.split("\n").map((line) => `> ${line}`).join("\n");
    const next = reply.slice(0, start) + quoted + reply.slice(end);
    setReply(next);
    requestAnimationFrame(() => composer.focus());
  }

  async function submitReply(event) {
    event.preventDefault();

    if (isConversation && conversationLocked) {
      setError(
        "This conversation is locked."
      );
      return;
    }

    if (marketReplyOnly && !replyTarget) {
      setError("This market period is archived. Reply to an existing post to continue the conversation.");
      return;
    }

    const body = normalizeMessageSpacing(reply).trim();

    if (!body && images.length === 0) return;

    setPosting(true);
    setError("");

    try {
      const { data: post, error } =
        await supabase
          .from("posts")
          .insert({
            discussion_id: discussion.id,
            author_id: user.id,
            body: body || null,
            reply_to_id: replyTarget?.id || null,
          })
          .select("id")
          .single();

      if (error) throw error;

      for (const image of images) {
        await uploadAttachment(post.id, image);
      }

      images.forEach((image) =>
        URL.revokeObjectURL(image.url)
      );

      setReply("");
      setShowEmojiPicker(false);
      setReplyTarget(null);
      setImages([]);

      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`
      );

      await loadPosts();
    } catch (err) {
      console.error(err);

      setError(
        err.message || "Unable to publish post."
      );
    } finally {
      setPosting(false);
    }
  }

  function beginEdit(post) {
    setEditingId(post.id);
    setEditBody(post.body || "");
    setError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditBody("");
    setSavingEdit(false);
  }

  async function saveEdit(post) {
    const clean = normalizeMessageSpacing(editBody).trim();

    if (
      !clean &&
      (!post.attachments ||
        post.attachments.length === 0)
    ) {
      setError(
        "A post needs text or an attachment."
      );
      return;
    }

    setSavingEdit(true);
    setError("");

    const { error } = await supabase
      .from("posts")
      .update({
        body: clean || null,
      })
      .eq("id", post.id)
      .eq("author_id", user.id);

    if (error) {
      setError(error.message);
      setSavingEdit(false);
      return;
    }

    cancelEdit();
    await loadPosts();
  }

  async function removePost(post) {
    if (
      post.author_id !== user.id &&
      !isAdmin
    ) {
      return;
    }

    if (
      !window.confirm(
        "Remove this post from the discussion?"
      )
    ) {
      return;
    }

    setError("");

    const { error } = await supabase.rpc(
      "remove_post",
      {
        target_post_id: post.id,
      }
    );

    if (error) {
      setError(error.message);
      return;
    }

    await loadPosts();
  }

  async function saveConversationRename() {
    const clean =
      conversationTitleDraft.trim();

    if (!clean) return;

    setModerating(true);
    setError("");

    const { error } = await supabase.rpc(
      "rename_conversation",
      {
        target_discussion_id: discussion.id,
        new_title: clean,
      }
    );

    if (error) {
      setError(error.message);
      setModerating(false);
      return;
    }

    setConversationTitle(clean);
    setConversationTitleDraft(clean);
    setRenamingConversation(false);
    setModerating(false);
  }

  async function toggleConversationLocked() {
    setModerating(true);
    setError("");

    const nextLocked = !conversationLocked;

    const { error } = await supabase.rpc(
      "set_conversation_locked",
      {
        target_discussion_id: discussion.id,
        target_locked: nextLocked,
      }
    );

    if (error) {
      setError(error.message);
      setModerating(false);
      return;
    }

    setConversationLocked(nextLocked);
    setModerating(false);
    setShowModeration(false);
  }

  async function removeConversation() {
    const confirmed = window.confirm(
      `Remove "${conversationTitle}"?\n\n` +
        "The conversation will disappear from the forum, " +
        "but its history will be preserved."
    );

    if (!confirmed) return;

    setModerating(true);
    setError("");

    const { error } = await supabase.rpc(
      "remove_conversation",
      {
        target_discussion_id: discussion.id,
      }
    );

    if (error) {
      setError(error.message);
      setModerating(false);
      return;
    }

    goBack();
  }

  function authorName(post) {
    return (
      post.profiles?.display_name ||
      post.profiles?.username ||
      "DWMY User"
    );
  }

  function publicRef(post) {
    return post?.public_ref || `FRCTAL-${String(post?.id || 0).padStart(6, "0")}`;
  }

  function replyParent(post) {
    if (!post?.reply_to_id) return null;
    return posts.find((candidate) => candidate.id === post.reply_to_id) || null;
  }

  function replyPreview(post) {
    if (!post) return "Original post";
    if (post.is_deleted) return "This post was removed.";

    const clean = (post.body || "")
      .replace(/\s+/g, " ")
      .trim();

    if (clean) {
      return clean.length > 160 ? `${clean.slice(0, 157)}...` : clean;
    }

    if (post.attachments?.length) return "Image attachment";
    return "Original post";
  }

  function jumpToPost(post) {
    if (!post) return;

    const ref = publicRef(post);
    window.history.replaceState(null, "", `#${ref}`);

    document
      .getElementById(ref)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="discussion-page">
      <button
        className="back-link"
        onClick={goBack}
      >
        &lt;- Back to forum
      </button>

      {isConversation && (
        <>
          <div className="breadcrumb">
            <span>Conversations</span>
            <span>&gt;</span>
            <span>{conversationTitle}</span>
          </div>

          <section className="discussion-header">
            <div>
              <span className="eyebrow">
                DWMY CONVERSATION
              </span>

              <h1>{conversationTitle}</h1>

              <p>
                Free-form community discussion.
              </p>
            </div>

            {isAdmin && (
              <div className="thread-moderation">
                <button
                  type="button"
                  className="dwmy-action-button"
                  onClick={() =>
                    setShowModeration(
                      (current) => !current
                    )
                  }
                >
                  Moderate
                </button>

                {showModeration && (
                  <div className="moderation-menu">
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingConversation(true);
                        setShowModeration(false);
                      }}
                    >
                      Rename Conversation
                    </button>

                    <button
                      type="button"
                      onClick={
                        toggleConversationLocked
                      }
                      disabled={moderating}
                    >
                      {conversationLocked
                        ? "Unlock Conversation"
                        : "Lock Conversation"}
                    </button>

                    <button
                      type="button"
                      className="danger-action"
                      onClick={removeConversation}
                      disabled={moderating}
                    >
                      Remove Conversation
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {conversationLocked && (
            <div className="thread-state-banner">
              This conversation is locked.
            </div>
          )}

          {renamingConversation && (
            <div className="thread-rename-panel">
              <span className="eyebrow">
                Rename Conversation
              </span>

              <input
                value={conversationTitleDraft}
                onChange={(event) =>
                  setConversationTitleDraft(
                    event.target.value
                  )
                }
                maxLength={160}
                autoFocus
              />

              <div className="native-action-row">
                <button
                  type="button"
                  className="dwmy-text-button"
                  onClick={() => {
                    setRenamingConversation(false);
                    setConversationTitleDraft(
                      conversationTitle
                    );
                  }}
                  disabled={moderating}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="primary-button"
                  onClick={saveConversationRename}
                  disabled={
                    moderating ||
                    !conversationTitleDraft.trim()
                  }
                >
                  {moderating
                    ? "Saving..."
                    : "Save"}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {isMarketSegment && (
        <>
          <div className="breadcrumb">
            <span>{discussion.section}</span>
            <span>&gt;</span>
            <span>{discussion.instrument}</span>
            <span>&gt;</span>
            <span>{discussion.segmentType}</span>
          </div>

          <section className="discussion-header">
            <div>
              <span className="eyebrow">
                {discussion.segmentType} /{" "}
                {discussion.segmentStart}
              </span>

              <h1>{discussion.title}</h1>

              <p>
                Canonical discussion for{" "}
                {discussion.instrument} /{" "}
                {discussion.segmentType?.toLowerCase()}{" "}
                segment
              </p>
            </div>
          </section>

          <div className="segment-tabs">
            {["DAY", "WEEK", "MONTH", "YEAR"].map(
              (segment) => (
                <button
                  key={segment}
                  className={
                    discussion.segmentType === segment
                      ? "active"
                      : ""
                  }
                >
                  {segment[0] +
                    segment.slice(1).toLowerCase()}
                </button>
              )
            )}
          </div>

          <div className="date-navigator">
            <button>&lt;- Previous</button>

            <strong>
              {discussion.segmentStart}
            </strong>

            <button>Next -&gt;</button>
          </div>
        </>
      )}

      {!isConversation && !isMarketSegment && (
        <>
          <div className="breadcrumb">
            <span>DWMY</span>
            <span>&gt;</span>
            <span>
              {discussion.title || "Discussion"}
            </span>
          </div>

          <section className="discussion-header">
            <div>
              <span className="eyebrow">
                DWMY DISCUSSION
              </span>

              <h1>
                {discussion.title || "Discussion"}
              </h1>
            </div>
          </section>
        </>
      )}

      {error && (
        <div className="discussion-open-error">
          {error}
        </div>
      )}

      <div className="post-list">
        {loading && (
          <div className="market-directory-state">
            Loading discussion...
          </div>
        )}

        {!loading &&
          posts.length === 0 && (
            <div className="market-directory-state">
              No posts yet. Start the discussion.
            </div>
          )}

        {!loading &&
          posts.map((post) => {
            const name = authorName(post);

            const owns =
              post.author_id === user.id;

            const parent = replyParent(post);
            const ref = publicRef(post);

            return (
              <article
                className={`post-card ${window.location.hash.toUpperCase() === `#${ref}`.toUpperCase() ? "post-targeted" : ""}`}
                id={ref}
                key={post.id}
              >
                <aside className="post-author">
                  <div className="post-avatar">
                    {post.profiles?.avatar_url ? (
                      <img
                        src={post.profiles.avatar_url}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      name[0]?.toUpperCase() || "D"
                    )}
                  </div>

                  <button
                    type="button"
                    className="user-link"
                    onClick={() =>
                      post.author_id !== user.id &&
                      onMessageUser?.(post.profiles)
                    }
                    disabled={post.author_id === user.id}
                    title={
                      post.author_id === user.id
                        ? "This is you"
                        : `Message @${post.profiles?.username || name}`
                    }
                  >
                    {name}
                  </button>

                  <span>
                    {owns
                      ? user.role?.toUpperCase()
                      : "MEMBER"}
                  </span>

                  <span className="post-count">
                    {Number(post.profiles?.post_count || 0).toLocaleString()}{" "}
                    {Number(post.profiles?.post_count || 0) === 1 ? "POST" : "POSTS"}
                  </span>

                  {!post.is_deleted && post.profiles?.signature && (
                    <span className="post-signature">
                      {post.profiles.signature}
                    </span>
                  )}
                </aside>

                <div className="post-body">
                  <div className="post-toolbar">
                    <span>
                      {formatPostTime(
                        post.created_at
                      )}

                      {post.is_edited &&
                        !post.is_deleted &&
                        " (edited)"}

                      <button
                        type="button"
                        className="post-public-ref"
                        onClick={() => jumpToPost(post)}
                        title={`Link to ${ref}`}
                      >
                        {ref}
                      </button>
                    </span>

                    {!post.is_deleted && (
                      <div className="post-actions">
                        {owns && (
                          <button
                            type="button"
                            className="dwmy-text-button"
                            onClick={() =>
                              beginEdit(post)
                            }
                          >
                            Edit
                          </button>
                        )}

                        {(owns || isAdmin) && (
                          <button
                            type="button"
                            className="dwmy-text-button"
                            onClick={() => removePost(post)}
                          >
                            {owns ? "Remove" : "Moderate / Remove"}
                          </button>
                        )}


                      </div>
                    )}
                  </div>

                  {post.reply_to_id && !post.is_deleted && (
                    <button
                      type="button"
                      className="reply-context reply-context-rich"
                      onClick={() => parent && jumpToPost(parent)}
                      disabled={!parent}
                    >
                      <span className="reply-context-meta">
                        ↳ Replying to {parent ? authorName(parent) : "original post"}
                        {parent ? ` · ${publicRef(parent)}` : ""}
                      </span>
                      <span className="reply-context-preview">
                        “{replyPreview(parent)}”
                      </span>
                    </button>
                  )}

                  {post.is_deleted ? (
                    <p>
                      <em>
                        This post was removed.
                      </em>
                    </p>
                  ) : editingId === post.id ? (
                    <div className="post-edit-native">
                      <textarea
                        value={editBody}
                        onChange={(event) =>
                          setEditBody(
                            normalizeMessageSpacing(event.target.value)
                          )
                        }
                        autoFocus
                      />

                      <div className="native-action-row">
                        <button
                          type="button"
                          className="dwmy-text-button"
                          onClick={cancelEdit}
                          disabled={savingEdit}
                        >
                          Cancel
                        </button>

                        <button
                          type="button"
                          className="primary-button"
                          onClick={() =>
                            saveEdit(post)
                          }
                          disabled={savingEdit}
                        >
                          {savingEdit
                            ? "Saving..."
                            : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {post.body && (
                        <p>{post.body}</p>
                      )}

                      {post.attachments?.length >
                        0 && (
                        <div className="post-images">
                          {post.attachments.map(
                            (attachment) => (
                              <img
                                key={attachment.id}
                                src={attachment.url}
                                alt={
                                  attachment.file_name ||
                                  "DWMY attachment"
                                }
                                loading="lazy"
                              />
                            )
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {!post.is_deleted && editingId !== post.id && (
                    <div className="post-social-actions">
                      <button type="button" className={reactions[post.id]?.liked ? "social-button active" : "social-button"} onClick={() => toggleLike(post)}>
                        Like{reactions[post.id]?.count ? ` ${reactions[post.id].count}` : ""}
                      </button>
                      <button type="button" className="social-button" onClick={() => beginReply(post)}>Reply</button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
      </div>

      {isConversation && conversationLocked ? (
        <div className="reply-box locked-reply-box">
          <div className="reply-heading">
            <strong>
              Conversation locked
            </strong>

            <span>
              New replies are currently closed.
            </span>
          </div>
        </div>
      ) : (
        <form
          className={`reply-box ${
            dragging ? "dragging" : ""
          }`}
          onSubmit={submitReply}
          onPaste={handlePaste}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(event.dataTransfer.files);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() =>
            setDragging(false)
          }
        >
          <div className="reply-heading">
            <strong>{replyTarget ? `Reply to ${authorName(replyTarget)}` : marketReplyOnly ? "Archived market discussion" : "Reply to discussion"}</strong>

            <span>
              Paste screenshots with Ctrl+V or drag
              them here
            </span>
          </div>

          {marketReplyOnly && !replyTarget && (
            <div className="market-archive-notice" role="status">
              <strong>This {String(discussion.segmentType || discussion.segment_type || "market period").toLowerCase()} is archived.</strong>
              <span>New top-level posts are closed. Replies to existing posts are still accepted — choose Reply beneath a post to continue the conversation.</span>
            </div>
          )}

          {replyTarget && (
            <div className="composer-reply-target">
              <span>
                Replying to {authorName(replyTarget)} · {publicRef(replyTarget)}
              </span>
              <button type="button" onClick={() => setReplyTarget(null)}>Cancel</button>
            </div>
          )}

          {(!marketReplyOnly || replyTarget) && (
            <>
          <div className="composer-toolbar" aria-label="Post formatting tools">
            <button type="button" title="Bold" onClick={() => replaceComposerSelection("**", "**", "bold text")}><strong>B</strong></button>
            <button type="button" title="Italic" onClick={() => replaceComposerSelection("*", "*", "italic text")}><em>I</em></button>
            <button type="button" title="Inline code" onClick={() => replaceComposerSelection("`", "`", "code")}>{"</>"}</button>
            <button type="button" title="Quote" onClick={quoteComposerSelection}>❝</button>
            <span className="composer-toolbar-divider" />
            <button
              type="button"
              className={showEmojiPicker ? "active" : ""}
              title="Emoji"
              onClick={() => setShowEmojiPicker((current) => !current)}
            >
              ☺
            </button>
            <span className="composer-draft-status">Draft saved locally</span>
          </div>

          {showEmojiPicker && (
            <div className="composer-emoji-picker">
              {COMPOSER_EMOJIS.map((emoji) => (
                <button type="button" key={emoji} onClick={() => insertComposerText(emoji)}>{emoji}</button>
              ))}
            </div>
          )}

          <textarea
            ref={composerRef}
            id="dwmy-reply-composer"
            value={reply}
            onChange={handleReplyChange}
            placeholder={marketReplyOnly && !replyTarget ? "This period is archived — choose Reply on an existing post." : "Write your reply or paste a screenshot..."}
            disabled={posting || (marketReplyOnly && !replyTarget)}
          />

          {mentionSuggestions.length > 0 && (
            <div className="mention-suggestions">
              {mentionSuggestions.map((profile) => (
                <button
                  type="button"
                  key={profile.id}
                  onClick={() => chooseMention(profile)}
                >
                  <strong>@{profile.username}</strong>
                  {profile.display_name &&
                    profile.display_name !== profile.username && (
                      <span>{profile.display_name}</span>
                    )}
                </button>
              ))}
            </div>
          )}

          {images.length > 0 && (
            <div className="image-preview-grid">
              {images.map((image) => (
                <div
                  className="image-preview"
                  key={image.id}
                >
                  <img
                    src={image.url}
                    alt={image.name}
                  />

                  <button
                    type="button"
                    onClick={() =>
                      removePreview(image.id)
                    }
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
          )}

          {dragging && (
            <div className="drop-overlay">
              Drop screenshot here
            </div>
          )}

          <div className="reply-footer">
            <label className="attachment-button">
              + Add image

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                hidden
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>

            <button
              type="submit"
              className="primary-button"
              disabled={posting || (marketReplyOnly && !replyTarget)}
            >
              {posting
                ? "Publishing..."
                : "Post Reply"}
            </button>
          </div>
            </>
          )}
        </form>
      )}
    </div>
  );
}