import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Header({
  page,
  setPage,
  user,
  onOpenSettings,
  onLogout,
  unreadNotifications = 0,
  unreadMessages = 0,
}) {
  const isAdmin = user.roles?.includes("ADMIN") || user.role === "admin";
  const marketsActive =
    page === "home" || page === "instrument" || page === "discussion";
  const [avatarUrl, setAvatarUrl] = useState(null);

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

  return (
    <header className="site-header">
      <div className="header-inner">
        <button className="brand" onClick={() => setPage("home")}>
          DWMY
          <small>a FRCTAL company</small>
        </button>

        <nav className="main-nav">
          <button
            className={marketsActive ? "active" : ""}
            onClick={() => setPage("home")}
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
          <button className="search-button">Search</button>

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
      </div>
    </header>
  );
}