export default function Header({
  page,
  setPage,
  user,
  onLogout,
}) {
  const isAdmin =
    user.roles?.includes("ADMIN") ||
    user.role === "admin";

  const marketsActive =
    page === "home" ||
    page === "instrument" ||
    (page === "discussion" &&
      page !== "conversations");

  return (
    <header className="site-header">
      <div className="header-inner">
        <button
          className="brand"
          onClick={() => setPage("home")}
        >
          DWMY
          <small>a FRCTAL company</small>
        </button>

        <nav className="main-nav">
          <button
            className={
              marketsActive ? "active" : ""
            }
            onClick={() => setPage("home")}
          >
            Markets
          </button>

          <button
            className={
              page === "conversations"
                ? "active"
                : ""
            }
            onClick={() =>
              setPage("conversations")
            }
          >
            Conversations
          </button>
        </nav>

        <div className="header-actions">
          <button className="search-button">
            Search
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
            <div className="avatar">
              {user.username?.[0]?.toUpperCase() ||
                "U"}
            </div>

            <div className="user-identity">
              <strong>{user.username}</strong>

              <span>
                {user.role.toUpperCase()}
              </span>
            </div>

            <button
              className="logout-button"
              onClick={onLogout}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}