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
import Notifications from "./pages/Notifications";
import Messages from "./pages/Messages";
import Settings from "./pages/Settings";

export default function App() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  const [authLoading, setAuthLoading] = useState(true);
  const [accessLoading, setAccessLoading] = useState(true);

  const [entitlements, setEntitlements] = useState([]);

  const [page, setPage] = useState("home");
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [selectedMessageConversation, setSelectedMessageConversation] = useState(null);

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
          await loadActivityCounts(alive);
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
          await loadActivityCounts(alive);
        }
      }
    );

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (page !== "discussion" && page !== "messages" && window.location.hash) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`
      );
    }
  }, [page]);

  async function loadIdentity(authUser, alive = true) {
    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select(
        "id, username, display_name, bio, signature, avatar_path, created_at"
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

  async function loadActivityCounts(alive = true) {
    const [{ count: notificationCount, error: notificationError }, { count: messageCount, error: messageError }] = await Promise.all([
      supabase.from("notifications").select("id", { count: "exact", head: true }).is("archived_at", null),
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("notification_type", "DIRECT_MESSAGE").is("archived_at", null),
    ]);
    if (!alive) return;
    if (!notificationError) setUnreadNotifications(notificationCount || 0);
    if (!messageError) setUnreadMessages(messageCount || 0);
  }

  async function loadDiscussionById(discussionId) {
    const { data, error } = await supabase.from("discussions").select(`
      id, discussion_type, section_id, instrument_id, segment_type, segment_start, segment_end, title, is_locked, reply_count, last_activity_at,
      sections(name), instruments(symbol,name)
    `).eq("id", discussionId).single();
    if (error) { console.error("Deep-link discussion load failed:", error); return null; }
    return {
      id: data.id, discussionType: data.discussion_type, sectionId: data.section_id, section: data.sections?.name || "Market",
      instrumentId: data.instrument_id, instrument: data.instruments?.symbol || data.title || "Discussion", instrumentName: data.instruments?.name || "",
      segmentType: data.segment_type, segmentStart: data.segment_start, segmentEnd: data.segment_end,
      title: data.title || `${data.instruments?.symbol || "Market"} - ${data.segment_start || "Discussion"}`,
      locked: data.is_locked || false, replies: data.reply_count || 0, lastActivityAt: data.last_activity_at,
    };
  }

  async function openNotificationPost(discussionId, postId) {
    const target = await loadDiscussionById(discussionId);
    if (!target) return;

    let publicRef = null;

    if (postId) {
      const { data, error } = await supabase
        .from("posts")
        .select("public_ref")
        .eq("id", postId)
        .maybeSingle();

      if (!error) publicRef = data?.public_ref || null;
    }

    setSelectedDiscussion(target);
    setPage("discussion");
    window.location.hash = publicRef || "";

    if (publicRef) {
      setTimeout(
        () =>
          document
            .getElementById(publicRef)
            ?.scrollIntoView({ behavior: "smooth", block: "center" }),
        250
      );
    }

    loadActivityCounts(true);
  }

  async function messageUser(profile) {
    if (!profile?.id || profile.id === user?.id) return;

    const { data, error } = await supabase.rpc(
      "start_direct_conversation",
      { target_user_id: profile.id }
    );

    if (error) {
      console.error("Unable to start direct conversation:", error);
      return;
    }

    setSelectedMessageConversation(data);
    setPage("messages");
    window.location.hash = "";
    window.scrollTo(0, 0);
  }

  function openNotificationMessage(conversationId, messageId) {
    setSelectedMessageConversation(conversationId); setPage("messages");
    window.location.hash = messageId ? `message-${messageId}` : "";
    setTimeout(() => document.getElementById(`message-${messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
    loadActivityCounts(true);
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


  function openSearchResult(result) {
    if (result?.type === "instrument" && result.section && result.instrument) {
      setSelectedInstrument({
        section: result.section,
        instrument: result.instrument,
      });
      setSelectedDiscussion(null);
      setPage("instrument");
      window.scrollTo(0, 0);
      return;
    }

    if (
      (result?.type === "discussion" || result?.type === "post") &&
      result.discussion
    ) {
      setSelectedDiscussion(result.discussion);

      if (result.discussion.instrumentId) {
        setSelectedInstrument({
          section: {
            id: result.discussion.sectionId,
            name: result.discussion.section,
          },
          instrument: {
            id: result.discussion.instrumentId,
            symbol: result.discussion.instrument,
            name: result.discussion.instrumentName,
            section_id: result.discussion.sectionId,
          },
        });
      }

      setPage("discussion");

      const base = `${window.location.pathname}${window.location.search}`;
      const hash =
        result.type === "post" && result.publicRef
          ? `#${result.publicRef}`
          : "";

      window.history.replaceState(null, "", `${base}${hash}`);
      window.scrollTo(0, 0);
    }
  }

  function openDiscussion(discussion) {
    setSelectedDiscussion(discussion);
    setPage("discussion");

    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`
    );
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
        unreadNotifications={unreadNotifications}
        unreadMessages={unreadMessages}
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
        onOpenSettings={() => {
          setPage("settings");
          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}${window.location.search}`
          );
          window.scrollTo(0, 0);
        }}
        onLogout={logout}
        onOpenSearchResult={openSearchResult}
        unreadNotifications={unreadNotifications}
        unreadMessages={unreadMessages}
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
              onMessageUser={messageUser}
            />
          )}

        {page === "notifications" && (
          <Notifications
            onOpenPost={openNotificationPost}
            onOpenMessage={openNotificationMessage}
            onChanged={() => loadActivityCounts(true)}
          />
        )}

        {page === "messages" && (
          <Messages
            user={user}
            initialConversationId={selectedMessageConversation}
            onChanged={() => loadActivityCounts(true)}
          />
        )}

        {page === "settings" && (
          <Settings
            user={user}
            entitlements={entitlements}
            onProfileUpdated={() =>
              session?.user
                ? loadIdentity(session.user, true)
                : Promise.resolve()
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