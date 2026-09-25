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

export default function LiveChat({ user }) {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const messagesRef = useRef(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const element = messagesRef.current;

      if (!element) return;

      element.scrollTop = element.scrollHeight;
    });
  }

  async function loadMessages() {
    setLoading(true);
    setError("");

    const { data, error: loadError } =
      await supabase
        .from("chat_messages")
        .select(`
          id,
          user_id,
          message,
          reply_to_id,
          created_at,
          profiles!chat_messages_user_id_fkey (
            id,
            username,
            display_name
          )
        `)
        .order("created_at", {
          ascending: true,
        })
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

    setMessages(data || []);
    setLoading(false);

    scrollToBottom();
  }

  useEffect(() => {
    loadMessages();

    const channel = supabase
      .channel("dwmy-global-chat")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
        },
        async (payload) => {
          const { data, error: messageError } =
            await supabase
              .from("chat_messages")
              .select(`
                id,
                user_id,
                message,
                reply_to_id,
                created_at,
                profiles!chat_messages_user_id_fkey (
                  id,
                  username,
                  display_name
                )
              `)
              .eq("id", payload.new.id)
              .single();

          if (messageError) {
            console.error(
              "Realtime chat message load failed:",
              messageError
            );

            return;
          }

          setMessages((current) => {
            if (
              current.some(
                (item) => item.id === data.id
              )
            ) {
              return current;
            }

            return [...current, data];
          });

          scrollToBottom();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
          reply_to_id: null,
        })
        .select(`
          id,
          user_id,
          message,
          reply_to_id,
          created_at,
          profiles!chat_messages_user_id_fkey (
            id,
            username,
            display_name
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

    setMessages((current) => {
      if (
        current.some(
          (item) => item.id === data.id
        )
      ) {
        return current;
      }

      return [...current, data];
    });

    setMessage("");
    setSending(false);

    scrollToBottom();
  }

  return (
    <section className="panel chat-panel">
      <div className="panel-heading">
        <div>
          <span className="live-dot"></span>

          <h2>Live Chat</h2>
        </div>

        <span className="muted">
          Global room
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

            return (
              <div
                className="chat-row"
                key={item.id}
              >
                <div className="mini-avatar">
                  {name[0]?.toUpperCase() || "D"}
                </div>

                <div className="chat-content">
                  <div>
                    <strong>{name}</strong>

                    <span>
                      {formatTime(item.created_at)}
                    </span>
                  </div>

                  <p>{item.message}</p>
                </div>
              </div>
            );
          })}
      </div>

      <form
        className="chat-compose"
        onSubmit={sendMessage}
      >
        <input
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
          disabled={
            sending || !message.trim()
          }
        >
          {sending ? "Sending..." : "Send"}
        </button>
      </form>
    </section>
  );
}