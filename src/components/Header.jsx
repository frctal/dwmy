import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Header({
  page,
  setPage,
  user,
  onOpenSettings,
  onLogout,
  onOpenSearchResult,
  unreadNotifications = 0,
  unreadMessages = 0,
}) {
  const isAdmin = user.roles?.includes("ADMIN") || user.role === "admin";
  const marketsActive =
    page === "home" ||
    page === "markets" || page === "instrument" || page === "discussion";
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState(1);
  const [presenceConnected, setPresenceConnected] = useState(false);
  const [marketSession, setMarketSession] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadAvatar() {
      if (!user?.avatar_path) {
        if (alive) setAvatarUrl(null);
        return;
      }

      const { data, error } = await supabase.storage
        .from("avatars")
        .createSignedUrl(user.avatar_path, 60 * 60);

      if (!alive) return;

      if (error) {
        console.error("Header avatar load failed:", error);
        setAvatarUrl(null);
        return;
      }

      setAvatarUrl(data?.signedUrl || null);
    }

    loadAvatar();

    return () => {
      alive = false;
    };
  }, [user?.avatar_path]);


  useEffect(() => {
    if (!user?.id) return undefined;

    const channel = supabase.channel("dwmy-online-users", {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    function refreshCount() {
      const state = channel.presenceState();
      const uniqueUsers = new Set();

      Object.values(state).forEach((presences) => {
        presences.forEach((presence) => {
          if (presence?.user_id) uniqueUsers.add(presence.user_id);
        });
      });

      setOnlineUsers(Math.max(uniqueUsers.size, 1));
    }

    channel
      .on("presence", { event: "sync" }, refreshCount)
      .on("presence", { event: "join" }, refreshCount)
      .on("presence", { event: "leave" }, refreshCount)
      .subscribe(async (status) => {
        const connected = status === "SUBSCRIBED";
        setPresenceConnected(connected);

        if (connected) {
          await channel.track({
            user_id: user.id,
            username: user.username,
            online_at: new Date().toISOString(),
          });
          refreshCount();
        }
      });

    return () => {
      setPresenceConnected(false);
      supabase.removeChannel(channel);
    };
  }, [user?.id, user?.username]);

  useEffect(() => {
    function getEasternParts() {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        hour: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date());

      return Object.fromEntries(
        parts
          .filter((part) => part.type !== "literal")
          .map((part) => [part.type, part.value])
      );
    }

    function calculateMarketSession() {
      const { weekday, hour } = getEasternParts();
      const h = Number(hour);

      const weekendClosed =
        (weekday === "Fri" && h >= 17) ||
        weekday === "Sat" ||
        (weekday === "Sun" && h < 17);

      if (weekendClosed) return "CLOSED";
      if (h >= 18) return "ASIA";
      if (h < 3) return "FRANKFURT";
      if (h < 6) return "LONDON";
      if (h < 17) return "NEW YORK";
      return "ROLLOVER";
    }

    function refreshSession() {
      setMarketSession(calculateMarketSession());
    }

    refreshSession();
    const timer = window.setInterval(refreshSession, 30 * 1000);

    return () => window.clearInterval(timer);
  }, []);


  useEffect(() => {
    const q = searchQuery.trim();

    if (!searchOpen || q.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return undefined;
    }

    let alive = true;
    const timer = window.setTimeout(async () => {
      setSearching(true);

      const [instrumentResult, discussionResult, postResult] = await Promise.all([
        supabase
          .from("instruments")
          .select("id, symbol, name, section_id, sections(id, name)")
          .or(`symbol.ilike.%${q}%,name.ilike.%${q}%`)
          .limit(6),
        supabase
          .from("discussions")
          .select(`
            id, discussion_type, section_id, instrument_id, segment_type,
            segment_start, segment_end, title, is_locked, reply_count,
            last_activity_at, sections(name), instruments(symbol,name)
          `)
          .eq("is_deleted", false)
          .ilike("title", `%${q}%`)
          .order("last_activity_at", { ascending: false })
          .limit(6),
        supabase
          .from("posts")
          .select(`
            id, public_ref, body, created_at,
            profiles(username, display_name),
            discussions(
              id, discussion_type, section_id, instrument_id, segment_type,
              segment_start, segment_end, title, is_locked, reply_count,
              last_activity_at, sections(name), instruments(symbol,name)
            )
          `)
          .eq("is_deleted", false)
          .ilike("body", `%${q}%`)
          .order("created_at", { ascending: false })
          .limit(12),
      ]);

      if (!alive) return;

      if (instrumentResult.error) {
        console.error("Instrument search failed:", instrumentResult.error);
      }

      if (discussionResult.error) {
        console.error("Discussion search failed:", discussionResult.error);
      }

      if (postResult.error) {
        console.error("Post search failed:", postResult.error);
      }

      const instruments = (instrumentResult.data || []).map((row) => ({
        type: "instrument",
        key: `instrument-${row.id}`,
        label: row.symbol,
        detail: row.name,
        section: row.sections || { id: row.section_id, name: "Markets" },
        instrument: {
          id: row.id,
          symbol: row.symbol,
          name: row.name,
          section_id: row.section_id,
        },
      }));

      const discussions = (discussionResult.data || []).map((row) => ({
        type: "discussion",
        key: `discussion-${row.id}`,
        label:
          row.title ||
          `${row.instruments?.symbol || "Discussion"} - ${row.segment_start || ""}`,
        detail: [
          row.instruments?.symbol,
          row.segment_type,
          row.segment_start,
        ]
          .filter(Boolean)
          .join(" · "),
        discussion: {
          id: row.id,
          discussionType: row.discussion_type,
          sectionId: row.section_id,
          section: row.sections?.name || "Market",
          instrumentId: row.instrument_id,
          instrument: row.instruments?.symbol || row.title || "Discussion",
          instrumentName: row.instruments?.name || "",
          segmentType: row.segment_type,
          segmentStart: row.segment_start,
          segmentEnd: row.segment_end,
          title:
            row.title ||
            `${row.instruments?.symbol || "Market"} - ${row.segment_start || "Discussion"}`,
          locked: row.is_locked || false,
          replies: row.reply_count || 0,
          lastActivityAt: row.last_activity_at,
        },
      }));

      const posts = (postResult.data || [])
        .filter((row) => row.discussions)
        .map((row) => {
          const discussion = row.discussions;
          const body = (row.body || "").replace(/\s+/g, " ").trim();
          const author =
            row.profiles?.display_name ||
            row.profiles?.username ||
            "Member";

          return {
            type: "post",
            key: `post-${row.id}`,
            label: body.length > 88 ? `${body.slice(0, 88)}…` : body,
            detail: `${author} · ${row.public_ref}`,
            discussion: {
              id: discussion.id,
              discussionType: discussion.discussion_type,
              sectionId: discussion.section_id,
              section: discussion.sections?.name || "Market",
              instrumentId: discussion.instrument_id,
              instrument:
                discussion.instruments?.symbol ||
                discussion.title ||
                "Discussion",
              instrumentName: discussion.instruments?.name || "",
              segmentType: discussion.segment_type,
              segmentStart: discussion.segment_start,
              segmentEnd: discussion.segment_end,
              title:
                discussion.title ||
                `${discussion.instruments?.symbol || "Market"} - ${discussion.segment_start || "Discussion"}`,
              locked: discussion.is_locked || false,
              replies: discussion.reply_count || 0,
              lastActivityAt: discussion.last_activity_at,
            },
            publicRef: row.public_ref,
          };
        });

      setSearchResults([...instruments, ...discussions, ...posts]);
      setSearching(false);
    }, 220);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [searchOpen, searchQuery]);

  function chooseSearchResult(result) {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    onOpenSearchResult?.(result);
  }

  return (
    <header className="site-header">
      <div className="header-inner">
        <div className="presence-edge presence-edge-left" title="DWMY live presence">
          <span
            className={presenceConnected ? "heartbeat-dot connected" : "heartbeat-dot"}
            aria-hidden="true"
          />
          <span><strong>Users Online:</strong> {onlineUsers}</span>
        </div>

        <button className="brand" onClick={() => setPage("home")}>
          DWMY
          <small>a FRCTAL company</small>
        </button>

        <nav className="main-nav">
          <button
            className={marketsActive ? "active" : ""}
            onClick={() => setPage("markets")}
          >
            Markets
          </button>
          <button
            className={page === "conversations" ? "active" : ""}
            onClick={() => setPage("conversations")}
          >
            Conversations
          </button>
        </nav>

        <div className="header-actions">
          <div className="header-search">
            <button
              className={searchOpen ? "search-button active" : "search-button"}
              onClick={() => setSearchOpen((open) => !open)}
            >
              Search
            </button>

            {searchOpen && (
              <div className="header-search-panel">
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search markets and discussions..."
                />

                <div className="header-search-results">
                  {searchQuery.trim().length < 2 ? (
                    <span className="header-search-state">
                      Type at least 2 characters.
                    </span>
                  ) : searching ? (
                    <span className="header-search-state">Searching...</span>
                  ) : searchResults.length === 0 ? (
                    <span className="header-search-state">No results.</span>
                  ) : (
                    searchResults.map((result) => (
                      <button
                        key={result.key}
                        type="button"
                        className="header-search-result"
                        onClick={() => chooseSearchResult(result)}
                      >
                        <span>
                          <strong>{result.label}</strong>
                          <small>{result.detail}</small>
                        </span>
                        <em>
                          {result.type === "instrument"
                            ? "MARKET"
                            : result.type === "post"
                              ? "POST"
                              : "THREAD"}
                        </em>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            className={
              page === "notifications"
                ? "header-icon-button active"
                : "header-icon-button"
            }
            onClick={() => setPage("notifications")}
            aria-label="Notifications"
          >
            Notifications
            {unreadNotifications > 0 && (
              <span className="header-badge">{unreadNotifications}</span>
            )}
          </button>

          <button
            className={
              page === "messages"
                ? "header-icon-button active"
                : "header-icon-button"
            }
            onClick={() => setPage("messages")}
            aria-label="Messages"
          >
            Messages
            {unreadMessages > 0 && (
              <span className="header-badge">{unreadMessages}</span>
            )}
          </button>

          {isAdmin && (
            <button
              className={
                page === "admin"
                  ? "admin-button active"
                  : "admin-button"
              }
              onClick={() => setPage("admin")}
            >
              Admin
            </button>
          )}

          <div className="user-menu">
            <button
              type="button"
              className={
                page === "settings"
                  ? "user-account-button active"
                  : "user-account-button"
              }
              onClick={onOpenSettings}
              aria-label="Open account settings"
              title="Account settings"
            >
              <span className="avatar">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" />
                ) : (
                  user.username?.[0]?.toUpperCase() || "U"
                )}
              </span>

              <span className="user-identity">
                <strong>{user.username}</strong>
                <span>{user.role.toUpperCase()}</span>
              </span>
            </button>

            <button className="logout-button" onClick={onLogout}>
              Sign Out
            </button>
          </div>
        </div>

        <div className="presence-edge presence-edge-right" title="DWMY market session">
          <span><strong>Market Session:</strong> {marketSession || "—"}</span>
        </div>
      </div>
    </header>
  );
}