import { useEffect, useState } from "react";
import "./index.css";

import { supabase } from "./lib/supabaseClient";

import Header from "./components/Header";

import Landing from "./pages/Landing";
import AccessGate from "./pages/AccessGate";
import Home from "./pages/Home";
import Discussion from "./pages/Discussion";
import Instrument from "./pages/Instrument";
import Admin from "./pages/Admin";
import Conversations from "./pages/Conversations";

export default function App() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  const [authLoading, setAuthLoading] = useState(true);
  const [accessLoading, setAccessLoading] = useState(true);

  const [entitlements, setEntitlements] = useState([]);

  const [page, setPage] = useState("home");

  const [
    selectedDiscussion,
    setSelectedDiscussion,
  ] = useState(null);

  const [
    selectedInstrument,
    setSelectedInstrument,
  ] = useState(null);

  useEffect(() => {
    let alive = true;

    async function bootstrap() {
      try {
        const {
          data: { session: currentSession },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("Session load failed:", error);
        }

        if (!alive) return;

        setSession(currentSession);

        if (currentSession?.user) {
          await loadIdentity(currentSession.user, alive);
          await loadAccess(alive, true);
        } else {
          setUser(null);
          setEntitlements([]);
          setAccessLoading(false);
        }
      } finally {
        if (alive) {
          setAuthLoading(false);
        }
      }
    }

    bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (event, nextSession) => {
        if (!alive) return;

        setSession(nextSession);

        if (event === "SIGNED_OUT" || !nextSession?.user) {
          setUser(null);
          setEntitlements([]);
          setAccessLoading(false);

          setPage("home");
          setSelectedDiscussion(null);
          setSelectedInstrument(null);

          return;
        }

        if (event === "TOKEN_REFRESHED") {
          return;
        }

        if (
          event === "SIGNED_IN" ||
          event === "USER_UPDATED"
        ) {
          await loadIdentity(nextSession.user, alive);
          await loadAccess(alive, false);
        }
      }
    );

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  async function loadIdentity(authUser, alive = true) {
    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select(
        "id, username, display_name, bio, avatar_path, created_at"
      )
      .eq("id", authUser.id)
      .single();

    if (!alive) return;

    if (profileError) {
      console.error(
        "Profile load failed:",
        profileError
      );

      setUser(null);
      return;
    }

    const {
      data: roleRows,
      error: roleError,
    } = await supabase
      .from("user_roles")
      .select("roles(code, name)")
      .eq("user_id", authUser.id);

    if (!alive) return;

    if (roleError) {
      console.error(
        "Role load failed:",
        roleError
      );
    }

    const {
      data: rankRows,
      error: rankError,
    } = await supabase
      .from("user_ranks")
      .select(
        "ranks(code, name, sort_order)"
      )
      .eq("user_id", authUser.id);

    if (!alive) return;

    if (rankError) {
      console.error(
        "Rank load failed:",
        rankError
      );
    }

    const roleCodes =
      roleRows
        ?.map((row) => row.roles?.code)
        .filter(Boolean) || [];

    const ranks =
      rankRows
        ?.map((row) => row.ranks)
        .filter(Boolean)
        .sort(
          (a, b) =>
            (a.sort_order || 0) -
            (b.sort_order || 0)
        ) || [];

    let primaryRole = "user";

    if (roleCodes.includes("ADMIN")) {
      primaryRole = "admin";
    } else if (
      roleCodes.includes("MODERATOR")
    ) {
      primaryRole = "moderator";
    }

    if (!alive) return;

    setUser({
      ...profile,
      email: authUser.email,
      role: primaryRole,
      roles: roleCodes,
      ranks,
    });
  }

  async function loadAccess(
    alive = true,
    showLoading = false
  ) {
    if (showLoading) {
      setAccessLoading(true);
    }

    const entitlementCodes = [
      "MARKETS",
      "CONVERSATIONS",
      "LIVE_CHAT",
      "EDUCATION",
    ];

    const entitlementChecks =
      await Promise.all(
        entitlementCodes.map((code) =>
          supabase.rpc("has_entitlement", {
            requested_code: code,
          })
        )
      );

    if (!alive) return [];

    const accessError =
      entitlementChecks.find(
        (result) => result.error
      )?.error;

    if (accessError) {
      console.error(
        "Access check failed:",
        accessError
      );

      if (showLoading) {
        setAccessLoading(false);
      }

      return [];
    }

    const grantedEntitlements =
      entitlementCodes.filter(
        (_, index) =>
          entitlementChecks[index].data === true
      );

    setEntitlements(grantedEntitlements);
    setAccessLoading(false);

    return grantedEntitlements;
  }

  async function handleAccessGranted() {
    await loadAccess(true, false);

    setPage("home");
    setSelectedDiscussion(null);
    setSelectedInstrument(null);

    window.scrollTo(0, 0);
  }

  async function logout() {
    await supabase.auth.signOut();

    setSession(null);
    setUser(null);
    setEntitlements([]);
    setAccessLoading(false);

    setPage("home");
    setSelectedDiscussion(null);
    setSelectedInstrument(null);

    window.scrollTo(0, 0);
  }

  function openDiscussion(discussion) {
    setSelectedDiscussion(discussion);
    setPage("discussion");

    window.scrollTo(0, 0);
  }

  function openInstrument(
    section,
    instrument
  ) {
    setSelectedInstrument({
      section,
      instrument,
    });

    setPage("instrument");

    window.scrollTo(0, 0);
  }

  if (authLoading) {
    return (
      <div className="dwmy-loading">
        <strong>DWMY</strong>
        <span>Connecting...</span>
      </div>
    );
  }

  if (!session || !user) {
    return <Landing />;
  }

  if (accessLoading) {
    return (
      <div className="dwmy-loading">
        <strong>DWMY</strong>
        <span>Checking access...</span>
      </div>
    );
  }

  const hasPlatformAccess =
    entitlements.includes("MARKETS") ||
    entitlements.includes("CONVERSATIONS") ||
    entitlements.includes("LIVE_CHAT");

  if (!hasPlatformAccess) {
    return (
      <AccessGate
        user={user}
        onAccessGranted={
          handleAccessGranted
        }
        onLogout={logout}
      />
    );
  }

  const isAdmin =
    user.roles?.includes("ADMIN") ||
    user.role === "admin";

  return (
    <>
      <Header
        page={page}
        setPage={setPage}
        user={user}
        onLogout={logout}
      />

      <main
        className={
          page === "admin"
            ? "admin-page-container"
            : "site-container"
        }
      >
        {page === "home" && (
          <Home
            user={user}
            entitlements={entitlements}
            openDiscussion={
              openDiscussion
            }
            openInstrument={
              openInstrument
            }
          />
        )}

        {page === "conversations" && (
          <Conversations
            user={user}
            entitlements={entitlements}
            openDiscussion={
              openDiscussion
            }
          />
        )}

        {page === "instrument" &&
          selectedInstrument && (
            <Instrument
              section={
                selectedInstrument.section
              }
              instrument={
                selectedInstrument.instrument
              }
              openDiscussion={
                openDiscussion
              }
              goBack={() =>
                setPage("home")
              }
              user={user}
              entitlements={entitlements}
            />
          )}

        {page === "discussion" &&
          selectedDiscussion && (
            <Discussion
              discussion={
                selectedDiscussion
              }
              user={user}
              entitlements={entitlements}
              goBack={() =>
                selectedInstrument
                  ? setPage("instrument")
                  : setPage("home")
              }
            />
          )}

        {page === "admin" &&
          isAdmin && <Admin />}

        {page === "admin" &&
          !isAdmin && (
            <section className="access-denied">
              <span className="eyebrow">
                DWMY ACCESS
              </span>

              <h1>
                Administrative access
                required.
              </h1>
            </section>
          )}
      </main>
    </>
  );
}