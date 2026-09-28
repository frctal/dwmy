import {
  useEffect,
  useRef,
  useState,
} from "react";

import { supabase } from "../lib/supabaseClient";

function formatTime(timestamp) {
  if (!timestamp) return "";

  const date = new Date(timestamp);

  const seconds = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 1000)
  );

  if (seconds < 60) return "now";

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h`;
  }

  return date.toLocaleDateString();
}

function displayName(profile) {
  return (
    profile?.display_name ||
    profile?.username ||
    "DWMY User"
  );
}


async function resolveAvatar(profile) {
  if (!profile?.avatar_path) return "";

  const { data, error } = await supabase.storage
    .from("avatars")
    .createSignedUrl(profile.avatar_path, 3600);

  if (error) {
    console.error("Avatar URL failed:", error);
    return "";
  }

  return data?.signedUrl || "";
}

async function hydrateAvatars(rows, profileKey = "profiles") {
  const cache = new Map();

  return Promise.all(
    (rows || []).map(async (row) => {
      const profile = row?.[profileKey];
      const path = profile?.avatar_path;

      if (!profile || !path) return row;

      let avatarUrl = cache.get(path);

      if (avatarUrl === undefined) {
        avatarUrl = await resolveAvatar(profile);
        cache.set(path, avatarUrl);
      }

      return {
        ...row,
        [profileKey]: {
          ...profile,
          avatar_url: avatarUrl,
        },
      };
    })
  );
}

function previewMessage(item) {
  if (!item) return "";
  const clean = (item.message || "").replace(/\s+/g, " ").trim();
  return clean.length > 110 ? `${clean.slice(0, 107)}...` : clean;
}

export default function LiveChat({
  user,
  onMessageUser,
  scopeType = "PUBLIC",
  communityId = null,
  communityName = "",
  canParticipate = true,
}) {
  const normalizedScope = scopeType === "COMMUNITY" ? "COMMUNITY" : "PUBLIC";
  const scopedCommunityId =
    normalizedScope === "COMMUNITY" ? Number(communityId) : null;
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [replyTarget, setReplyTarget] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [removingMessageId, setRemovingMessageId] = useState(null);
  const [canRemoveMessages, setCanRemoveMessages] = useState(false);
  const [error, setError] = useState("");

  const messagesRef = useRef(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const element = messagesRef.current;

      if (!element) return;

      element.scrollTop = element.scrollHeight;
    });
  }

  async function loadModerationAuthority() {
    if (!user?.id) {
      setCanRemoveMessages(false);
      return;
    }

    if (normalizedScope === "PUBLIC") {
      const { data, error: authorityError } = await supabase.rpc(
        "is_dwmy_admin"
      );

      if (authorityError) {
        console.error(
          "Live Chat moderation authority check failed:",
          authorityError
        );
        setCanRemoveMessages(false);
        return;
      }

      setCanRemoveMessages(Boolean(data));
      return;
    }

    if (!scopedCommunityId) {
      setCanRemoveMessages(false);
      return;
    }

    const { data, error: authorityError } = await supabase.rpc(
      "has_community_permission",
      {
        target_community_id: scopedCommunityId,
        requested_permission: "REMOVE_CONTENT",
      }
    );

    if (authorityError) {
      console.error(
        "Community Live Chat moderation authority check failed:",
        authorityError
      );
      setCanRemoveMessages(false);
      return;
    }

    setCanRemoveMessages(Boolean(data));
  }

  async function loadMessages() {
    setLoading(true);
    setError("");

    let query = supabase
      .from("chat_messages")
      .select(`
        id,
        user_id,
        message,
        reply_to_id,
        scope_type,
        community_id,
        created_at,
        profiles!chat_messages_user_id_fkey (
          id,
          username,
          display_name,
          avatar_path
        )
      `)
      .eq("scope_type", normalizedScope);

    query =
      normalizedScope === "COMMUNITY"
        ? query.eq("community_id", scopedCommunityId)
        : query.is("community_id", null);

    const { data, error: loadError } = await query
      .order("created_at", { ascending: true })
      .limit(100);

    if (loadError) {
      console.error(
        "Live chat load failed:",
        loadError
      );

      setError(loadError.message);
      setMessages([]);
      setLoading(false);
      return;
    }

    const hydrated = await hydrateAvatars(data || []);
    setMessages(hydrated);
    setLoading(false);

    scrollToBottom();
  }

  useEffect(() => {
    loadMessages();
    loadModerationAuthority();

    const channel = supabase
      .channel(
        normalizedScope === "COMMUNITY"
          ? `dwmy-community-chat-${scopedCommunityId}`
          : "dwmy-global-chat"
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter:
            normalizedScope === "COMMUNITY"
              ? `community_id=eq.${scopedCommunityId}`
              : "scope_type=eq.PUBLIC",
        },
        async (payload) => {
          if (
            payload.new.scope_type !== normalizedScope ||
            (normalizedScope === "COMMUNITY" &&
              Number(payload.new.community_id) !== scopedCommunityId) ||
            (normalizedScope === "PUBLIC" && payload.new.community_id != null)
          ) {
            return;
          }
          let messageQuery = supabase
            .from("chat_messages")
            .select(`
              id,
              user_id,
              message,
              reply_to_id,
              scope_type,
              community_id,
              created_at,
              profiles!chat_messages_user_id_fkey (
                id,
                username,
                display_name,
                avatar_path
              )
            `)
            .eq("id", payload.new.id)
            .eq("scope_type", normalizedScope);

          messageQuery =
            normalizedScope === "COMMUNITY"
              ? messageQuery.eq("community_id", scopedCommunityId)
              : messageQuery.is("community_id", null);

          const { data, error: messageError } = await messageQuery.single();

          if (messageError) {
            console.error(
              "Realtime chat message load failed:",
              messageError
            );

            return;
          }

          const [hydratedMessage] = await hydrateAvatars([data]);

          setMessages((current) => {
            if (
              current.some(
                (item) => item.id === hydratedMessage.id
              )
            ) {
              return current;
            }

            return [...current, hydratedMessage];
          });

          scrollToBottom();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "chat_messages",
        },
        (payload) => {
          const removedId = payload.old?.id;

          if (removedId == null) return;

          setMessages((current) =>
            current.filter((item) => item.id !== removedId)
          );

          setReplyTarget((current) =>
            current?.id === removedId ? null : current
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [normalizedScope, scopedCommunityId, user?.id]);

  async function removeMessage(item) {
    if (!item?.id || !canRemoveMessages || removingMessageId != null) {
      return;
    }

    const confirmed = window.confirm(
      `Remove this Live Chat message from ${displayName(item.profiles)}?`
    );

    if (!confirmed) return;

    setRemovingMessageId(item.id);
    setError("");

    const { data, error: removeError } = await supabase.rpc(
      "remove_live_chat_message",
      { target_message_id: item.id }
    );

    if (removeError) {
      console.error("Live Chat message removal failed:", removeError);
      setError(removeError.message);
      setRemovingMessageId(null);
      return;
    }

    if (!data) {
      setError("Live Chat message could not be removed.");
      setRemovingMessageId(null);
      return;
    }

    // Immediate local removal. Realtime DELETE performs the same operation
    // for other connected room clients.
    setMessages((current) =>
      current.filter((messageItem) => messageItem.id !== item.id)
    );

    setReplyTarget((current) =>
      current?.id === item.id ? null : current
    );

    setRemovingMessageId(null);
  }

  async function sendMessage(event) {
    event.preventDefault();

    const clean = message.trim();

    if (!clean || !user?.id || sending) {
      return;
    }

    setSending(true);
    setError("");

    const { data, error: sendError } =
      await supabase
        .from("chat_messages")
        .insert({
          user_id: user.id,
          message: clean,
          reply_to_id: replyTarget?.id || null,
          scope_type: normalizedScope,
          community_id:
            normalizedScope === "COMMUNITY" ? scopedCommunityId : null,
        })
        .select(`
          id,
          user_id,
          message,
          reply_to_id,
          scope_type,
          community_id,
          created_at,
          profiles!chat_messages_user_id_fkey (
            id,
            username,
            display_name,
            avatar_path
          )
        `)
        .single();

    if (sendError) {
      console.error(
        "Live chat send failed:",
        sendError
      );

      setError(sendError.message);
      setSending(false);
      return;
    }

    const [hydratedMessage] = await hydrateAvatars([data]);

    setMessages((current) => {
      if (
        current.some(
          (item) => item.id === hydratedMessage.id
        )
      ) {
        return current;
      }

      return [...current, hydratedMessage];
    });

    setMessage("");
    setReplyTarget(null);
    setSending(false);

    scrollToBottom();
  }

  function addEmoji(emoji) {
    setMessage((current) => `${current}${emoji}`);
    setShowEmojiPicker(false);
    requestAnimationFrame(() => {
      document.getElementById("dwmy-live-chat-input")?.focus();
    });
  }

  return (
    <section className="panel chat-panel">
      <div className="panel-heading">
        <div>
          <span className="live-dot"></span>

          <h2>Live Chat</h2>
        </div>

        <span className="muted">
          {normalizedScope === "COMMUNITY"
            ? `${communityName || "Community"} room`
            : "Global room"}
        </span>
      </div>

      <div
        className="chat-messages"
        ref={messagesRef}
      >
        {loading && (
          <div className="market-directory-state">
            Loading chat...
          </div>
        )}

        {!loading && error && (
          <div className="market-directory-state">
            {error}
          </div>
        )}

        {!loading &&
          !error &&
          messages.length === 0 && (
            <div className="market-directory-state">
              No messages yet. Start the conversation.
            </div>
          )}

        {!loading &&
          messages.map((item) => {
            const name = displayName(
              item.profiles
            );

            const parent = item.reply_to_id
              ? messages.find((candidate) => candidate.id === item.reply_to_id)
              : null;

            return (
              <div
                className={`chat-row ${replyTarget?.id === item.id ? "reply-selected" : ""}`}
                key={item.id}
                role={canParticipate ? "button" : undefined}
                tabIndex={canParticipate ? 0 : undefined}
                title={canParticipate ? `Reply to ${name}` : undefined}
                onClick={() => {
                  if (!canParticipate) return;
                  setReplyTarget(item);
                  document.getElementById("dwmy-live-chat-input")?.focus();
                }}
                onKeyDown={(event) => {
                  if (!canParticipate) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setReplyTarget(item);
                    document.getElementById("dwmy-live-chat-input")?.focus();
                  }
                }}
              >
                <div className="mini-avatar">
                  {item.profiles?.avatar_url ? (
                    <img
                      src={item.profiles.avatar_url}
                      alt=""
                      className="mini-avatar-image"
                    />
                  ) : (
                    name[0]?.toUpperCase() || "D"
                  )}
                </div>

                <div className="chat-content">
                  <div>
                    <button
                      type="button"
                      className="chat-user-link"
                      disabled={item.user_id === user.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (item.user_id !== user.id) {
                          onMessageUser?.(item.profiles);
                        }
                      }}
                      title={
                        item.user_id === user.id
                          ? "This is you"
                          : `Message @${item.profiles?.username || name}`
                      }
                    >
                      {name}
                    </button>

                    <span>
                      {formatTime(item.created_at)}
                    </span>

                    {canRemoveMessages && (
                      <button
                        type="button"
                        className="chat-remove-message"
                        disabled={removingMessageId === item.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          removeMessage(item);
                        }}
                        title="Remove message"
                      >
                        {removingMessageId === item.id
                          ? "Removing..."
                          : "Remove"}
                      </button>
                    )}
                  </div>

                  {parent && (
                    <div className="chat-reply-context">
                      <strong>
                        ↳ {displayName(parent.profiles)}
                      </strong>
                      <span>{previewMessage(parent)}</span>
                    </div>
                  )}

                  <p>{item.message}</p>
                </div>
              </div>
            );
          })}
      </div>

      {canParticipate ? (
      <form
        className="chat-compose chat-compose-stacked"
        onSubmit={sendMessage}
      >
        {replyTarget && (
          <div className="chat-compose-reply chat-compose-reply-row">
            <span>
              Replying to {displayName(replyTarget.profiles)} · “{previewMessage(replyTarget)}”
            </span>
            <button
              type="button"
              onClick={() => setReplyTarget(null)}
              aria-label="Cancel reply"
            >
              ×
            </button>
          </div>
        )}

        <div className="chat-compose-main">
          <div className="chat-emoji-wrap">
            <button
              type="button"
              className="chat-emoji-button"
              aria-label="Add emoji"
              title="Add emoji"
              onClick={() => setShowEmojiPicker((current) => !current)}
            >
              ☺
            </button>

            {showEmojiPicker && (
              <div className="chat-emoji-picker">
                {["😀", "😂", "👍", "🔥", "❤️", "🎯", "📈", "📉", "💯", "👀", "🤝", "🚀"].map(
                  (emoji) => (
                    <button
                      type="button"
                      key={emoji}
                      onClick={() => addEmoji(emoji)}
                    >
                      {emoji}
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          <input
            id="dwmy-live-chat-input"
            value={message}
            onChange={(event) =>
              setMessage(event.target.value)
            }
            placeholder="Message the room..."
            maxLength={2000}
            disabled={sending}
          />

          <button
            type="submit"
            disabled={sending || !message.trim()}
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </form>
      ) : (
        <div className="market-directory-state">
          Live Chat is visible to DWMY Free members. Participation is currently available to DWMY Beta members.
        </div>
      )}
    </section>
  );
}