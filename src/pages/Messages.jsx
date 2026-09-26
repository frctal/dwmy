import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Messages({
  user,
  initialConversationId,
  onChanged,
}) {
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(
    initialConversationId || null
  );
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [username, setUsername] = useState("");
  const [userSuggestions, setUserSuggestions] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [error, setError] = useState("");

  async function withAvatarUrl(profile) {
    if (!profile?.avatar_path) {
      return profile ? { ...profile, avatar_url: null } : profile;
    }

    const { data, error } = await supabase.storage
      .from("avatars")
      .createSignedUrl(profile.avatar_path, 3600);

    if (error) {
      console.error("Message avatar load failed:", error);
      return { ...profile, avatar_url: null };
    }

    return {
      ...profile,
      avatar_url: data?.signedUrl || null,
    };
  }

  async function loadConversations() {
    const { data, error } = await supabase
      .from("message_participants")
      .select(`
        conversation_id,
        last_read_at,
        archived_at,
        message_conversations!inner(
          id,
          last_message_at,
          updated_at
        ),
        participants:message_conversations!inner(
          message_participants(
            user_id,
            profiles(
              id,
              username,
              display_name,
              avatar_path
            )
          )
        )
      `)
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("conversation_id", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    const hydrated = await Promise.all(
      (data || []).map(async (conversation) => {
        const participantRows =
          conversation.participants?.message_participants || [];

        const nextParticipants = await Promise.all(
          participantRows.map(async (participant) => ({
            ...participant,
            profiles: await withAvatarUrl(participant.profiles),
          }))
        );

        return {
          ...conversation,
          participants: conversation.participants
            ? {
                ...conversation.participants,
                message_participants: nextParticipants,
              }
            : conversation.participants,
        };
      })
    );

    setConversations(hydrated);
  }

  async function loadMessages(id) {
    if (!id) {
      setMessages([]);
      return;
    }

    const { data, error } = await supabase
      .from("direct_messages")
      .select(`
        id,
        conversation_id,
        sender_id,
        body,
        reply_to_message_id,
        is_edited,
        is_deleted,
        created_at,
        sender:profiles!direct_messages_sender_id_fkey(
          id,
          username,
          display_name,
          avatar_path
        )
      `)
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      setError(error.message);
      return;
    }

    const hydrated = await Promise.all(
      (data || []).map(async (message) => ({
        ...message,
        sender: await withAvatarUrl(message.sender),
      }))
    );

    setMessages(hydrated);

    await supabase.rpc("mark_message_conversation_read", {
      target_conversation_id: id,
    });

    onChanged?.();
  }

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (initialConversationId) {
      setSelected(initialConversationId);
    }
  }, [initialConversationId]);

  useEffect(() => {
    loadMessages(selected);
  }, [selected]);

  async function searchUsers(value) {
    setUsername(value);
    setSelectedUser(null);
    setError("");

    const clean = value.trim().replace(/^@/, "");

    if (!clean) {
      setUserSuggestions([]);
      return;
    }

    setSearchingUsers(true);

    const { data, error } = await supabase
      .from("profiles")
      .select("id,username,display_name")
      .neq("id", user.id)
      .ilike("username", `${clean}%`)
      .order("username", { ascending: true })
      .limit(8);

    setSearchingUsers(false);

    if (error) {
      setError(error.message);
      setUserSuggestions([]);
      return;
    }

    setUserSuggestions(data || []);
  }

  function chooseUser(profile) {
    setSelectedUser(profile);
    setUsername(`@${profile.username}`);
    setUserSuggestions([]);
    setError("");
  }

  async function start(profileOverride = null) {
    let profile = profileOverride || selectedUser;
    const clean = username.trim().replace(/^@/, "");

    if (!profile && clean) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,username,display_name")
        .neq("id", user.id)
        .ilike("username", clean)
        .maybeSingle();

      if (error || !data) {
        setError(error?.message || "Select a valid DWMY member.");
        return;
      }

      profile = data;
    }

    if (!profile) {
      setError("Select a valid DWMY member.");
      return;
    }

    const { data, error } = await supabase.rpc(
      "start_direct_conversation",
      {
        target_user_id: profile.id,
      }
    );

    if (error) {
      setError(error.message);
      return;
    }

    setUsername("");
    setSelectedUser(null);
    setUserSuggestions([]);
    setSelected(data);
    await loadConversations();
  }

  async function send(e) {
    e.preventDefault();

    const normalizedBody = body
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!selected || !normalizedBody) {
      return;
    }

    const { error } = await supabase.rpc(
      "send_direct_message",
      {
        target_conversation_id: selected,
        message_body: normalizedBody,
        target_reply_message_id: null,
      }
    );

    if (error) {
      setError(error.message);
      return;
    }

    setBody("");
    await loadMessages(selected);
    await loadConversations();
  }

  function handleBodyChange(e) {
    const normalized = e.target.value
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n");

    setBody(normalized);
  }

  function otherProfile(conversation) {
    const participants =
      conversation.participants?.message_participants || [];

    return participants.find(
      (participant) => participant.user_id !== user.id
    )?.profiles || null;
  }

  function otherName(conversation) {
    const other = otherProfile(conversation);

    return (
      other?.display_name ||
      other?.username ||
      `Conversation ${conversation.conversation_id}`
    );
  }

  return (
    <section className="messages-page">
      <div className="page-title-row">
        <div>
          <span className="eyebrow">PRIVATE</span>
          <h1>Messages</h1>
          <p>Direct conversations between DWMY members.</p>
        </div>
      </div>

      <div className="new-message-row">
        <div className="user-picker">
          <input
            value={username}
            onChange={(e) => searchUsers(e.target.value)}
            placeholder="@username"
            autoComplete="off"
          />

          {selectedUser && (
            <span className="username-confirmed">
              ✓ @{selectedUser.username}
            </span>
          )}

          {userSuggestions.length > 0 && (
            <div className="user-suggestions">
              {userSuggestions.map((profile) => (
                <button
                  type="button"
                  key={profile.id}
                  onClick={() => chooseUser(profile)}
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

          {searchingUsers && (
            <span className="username-searching">Searching...</span>
          )}
        </div>

        <button
          className="primary-button"
          onClick={() => start()}
          disabled={!selectedUser && !username.trim()}
        >
          New Message
        </button>
      </div>

      {error && (
        <div className="discussion-open-error">
          {error}
        </div>
      )}

      <div className="messages-layout">
        <aside className="message-inbox">
          {conversations.length === 0 ? (
            <div className="market-directory-state">
              No messages yet.
            </div>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.conversation_id}
                className={
                  selected === conversation.conversation_id
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setSelected(conversation.conversation_id)
                }
              >
                <div className="message-inbox-identity">
                  <span className="message-avatar">
                    {otherProfile(conversation)?.avatar_url ? (
                      <img
                        src={otherProfile(conversation).avatar_url}
                        alt=""
                      />
                    ) : (
                      otherName(conversation)[0]?.toUpperCase() || "D"
                    )}
                  </span>

                  <strong>
                    {otherName(conversation)}
                  </strong>
                </div>

                <span>
                  {conversation.message_conversations
                    ?.last_message_at
                    ? new Date(
                        conversation.message_conversations
                          .last_message_at
                      ).toLocaleString()
                    : "New conversation"}
                </span>
              </button>
            ))
          )}
        </aside>

        <div className="message-thread">
          {!selected ? (
            <div className="market-directory-state">
              Choose a conversation or start a new one.
            </div>
          ) : (
            <>
              <div className="direct-message-list">
                {messages.map((message) => (
                  <div
                    id={`message-${message.id}`}
                    key={message.id}
                    className={
                      message.sender_id === user.id
                        ? "direct-message mine"
                        : "direct-message"
                    }
                  >
                    <div className="direct-message-author">
                      <span className="message-avatar">
                        {message.sender?.avatar_url ? (
                          <img src={message.sender.avatar_url} alt="" />
                        ) : (
                          (
                            message.sender?.display_name ||
                            message.sender?.username ||
                            "D"
                          )[0]?.toUpperCase()
                        )}
                      </span>

                      <strong>
                        {message.sender?.display_name ||
                          message.sender?.username ||
                          "DWMY User"}
                      </strong>
                    </div>

                    <p className="direct-message-body">
                      {message.is_deleted ? (
                        <em>Message removed.</em>
                      ) : (
                        message.body
                      )}
                    </p>

                    <span>
                      {new Date(
                        message.created_at
                      ).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>

              <form
                className="message-composer"
                onSubmit={send}
              >
                <textarea
                  value={body}
                  onChange={handleBodyChange}
                  placeholder="Write a private message..."
                />

                <button
                  className="primary-button"
                  type="submit"
                >
                  Send
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}