import { useEffect, useState } from "react";
import "./index.css";

import { supabase } from "./lib/supabaseClient";

import Header from "./components/Header";

import Landing from "./pages/Landing";
import AccessGate from "./pages/AccessGate";
import ProfileOnboarding from "./pages/ProfileOnboarding";
import Home from "./pages/Home";
import Discussion from "./pages/Discussion";
import Instrument from "./pages/Instrument";
import MarketDirectory from "./pages/MarketDirectory";
import Admin from "./pages/Admin";
import Conversations from "./pages/Conversations";
import Communities from "./pages/Communities";
import Notifications from "./pages/Notifications";
import Messages from "./pages/Messages";
import Settings from "./pages/Settings";


const DWMY_APPEARANCE_KEY = "dwmy-appearance-v1";
const DEFAULT_APPEARANCE = {
  mode: "dark",
  accent: "#52d6a0",
};

function normalizeAppearance(value) {
  const mode = value?.mode === "light" ? "light" : "dark";
  const accent =
    typeof value?.accent === "string" &&
    /^#[0-9a-fA-F]{6}$/.test(value.accent)
      ? value.accent.toLowerCase()
      : DEFAULT_APPEARANCE.accent;

  return { mode, accent };
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function applyAppearance(value) {
  const appearance = normalizeAppearance(value);
  const root = document.documentElement;
  const { r, g, b } = hexToRgb(appearance.accent);

  root.dataset.theme = appearance.mode;
  root.style.setProperty("--accent", appearance.accent);
  root.style.setProperty("--accent-soft", `rgba(${r}, ${g}, ${b}, 0.11)`);
  root.style.setProperty("--accent-glow", `rgba(${r}, ${g}, ${b}, 0.80)`);
  root.style.setProperty("--accent-border", `rgba(${r}, ${g}, ${b}, 0.30)`);

  return appearance;
}

function loadStoredAppearance() {
  try {
    const stored = window.localStorage.getItem(DWMY_APPEARANCE_KEY);
    return applyAppearance(stored ? JSON.parse(stored) : DEFAULT_APPEARANCE);
  } catch (error) {
    console.warn("Appearance preference load failed:", error);
    return applyAppearance(DEFAULT_APPEARANCE);
  }
}

function ProAccessGate({ feature, onBack }) {
  const [trialStatus, setTrialStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkoutBusy, setCheckoutBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadTrialStatus() {
      setLoading(true);
      setError("");

      const { data, error: statusError } = await supabase.rpc(
        "get_my_stripe_pro_trial_status"
      );

      if (!alive) return;

      if (statusError) {
        setError(statusError.message || "Unable to check your PRO trial status.");
        setLoading(false);
        return;
      }

      setTrialStatus(
        data?.[0] || {
          status: "NEVER_USED",
          billing_period: null,
          started_at: null,
          consumed_at: null,
        }
      );
      setLoading(false);
    }

    loadTrialStatus();

    return () => {
      alive = false;
    };
  }, []);

  async function startCheckout(billingPeriod, checkoutType = "subscription") {
    const busyKey = `${checkoutType}:${billingPeriod}`;
    setCheckoutBusy(busyKey);
    setError("");

    try {
      const returnUrl = `${window.location.origin}${window.location.pathname}`;

      const { data, error: checkoutError } = await supabase.functions.invoke(
        "create-pro-checkout",
        {
          body: {
            billing_period: billingPeriod,
            checkout_type: checkoutType,
            success_url: returnUrl,
            cancel_url: returnUrl,
          },
        }
      );

      if (checkoutError) throw checkoutError;
      if (!data?.checkout_url) throw new Error("Stripe Checkout URL was not returned.");

      window.location.assign(data.checkout_url);
    } catch (err) {
      console.error("PRO checkout failed:", err);
      setError(err.message || "Unable to open Stripe Checkout.");
      setCheckoutBusy("");
    }
  }

  const featureLabel =
    feature === "MESSAGING"
      ? "Messages"
      : feature === "LIVE_CHAT"
        ? "Live Chat"
        : "Conversations";

  const trialAvailable = trialStatus?.status === "NEVER_USED";

  return (
    <section className="access-denied" style={{ maxWidth: 720, margin: "56px auto" }}>
      <span className="eyebrow">DWMY PRO</span>
      <h1>{featureLabel} is a PRO feature.</h1>
      <p>
        PRO includes Conversations, Live Chat participation, and direct Messaging.
        Markets remain included with your Free account.
      </p>

      {loading ? (
        <p>Checking your PRO access...</p>
      ) : trialAvailable ? (
        <>
          <h2>Try DWMY PRO FREE for 7 days.</h2>
          <p>
            Choose monthly or yearly billing. A payment method is required through
            Stripe. You will not be charged until the 7-day trial ends, and you can
            cancel before then.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 22 }}>
            <button
              type="button"
              className="primary-button"
              disabled={Boolean(checkoutBusy)}
              onClick={() => startCheckout("monthly", "trial")}
            >
              {checkoutBusy === "trial:monthly"
                ? "Opening Stripe..."
                : "7 days free · then $1.52/month"}
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={Boolean(checkoutBusy)}
              onClick={() => startCheckout("yearly", "trial")}
            >
              {checkoutBusy === "trial:yearly"
                ? "Opening Stripe..."
                : "7 days free · then $9.12/year"}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={Boolean(checkoutBusy)}
              onClick={onBack}
            >
              Back to Markets
            </button>
          </div>
        </>
      ) : (
        <>
          <h2>Your PRO trial has been used.</h2>
          <p>
            Subscribe to DWMY PRO to unlock Conversations, Live Chat participation,
            and Messaging. Markets remain included with your Free account.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 22 }}>
            <button
              type="button"
              className="primary-button"
              disabled={Boolean(checkoutBusy)}
              onClick={() => startCheckout("monthly", "subscription")}
            >
              {checkoutBusy === "subscription:monthly"
                ? "Opening Stripe..."
                : "PRO Monthly · $1.52/month"}
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={Boolean(checkoutBusy)}
              onClick={() => startCheckout("yearly", "subscription")}
            >
              {checkoutBusy === "subscription:yearly"
                ? "Opening Stripe..."
                : "PRO Yearly · $9.12/year"}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={Boolean(checkoutBusy)}
              onClick={onBack}
            >
              Back to Markets
            </button>
          </div>
        </>
      )}

      {error && (
        <p role="alert" style={{ marginTop: 20, color: "#ff9c9c" }}>
          {error}
        </p>
      )}
    </section>
  );
}

export default function App() {
  const [appearance, setAppearance] = useState(() => loadStoredAppearance());
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  const [authLoading, setAuthLoading] = useState(true);
  const [accessLoading, setAccessLoading] = useState(true);

  const [entitlements, setEntitlements] = useState([]);

  const [page, setPage] = useState("home");
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [selectedMessageConversation, setSelectedMessageConversation] = useState(null);
  const [selectedModerationIncident, setSelectedModerationIncident] = useState(null);
  const [communityReturnContext, setCommunityReturnContext] = useState(null);
  const [proGateFeature, setProGateFeature] = useState(null);

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
        "id, username, display_name, bio, signature, avatar_path, country, onboarding_completed_at, profile_setup_skipped, created_at"
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
      "COMMUNITIES",
      "MESSAGING",
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
      community_id, community_category_id,
      sections(name), instruments(symbol,name)
    `).eq("id", discussionId).single();
    if (error) { console.error("Deep-link discussion load failed:", error); return null; }
    return {
      id: data.id, discussionType: data.discussion_type, sectionId: data.section_id, section: data.sections?.name || "Market",
      instrumentId: data.instrument_id, instrument: data.instruments?.symbol || data.title || "Discussion", instrumentName: data.instruments?.name || "",
      segmentType: data.segment_type, segmentStart: data.segment_start, segmentEnd: data.segment_end,
      communityId: data.community_id, communityCategoryId: data.community_category_id,
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
    if (!entitlements.includes("MESSAGING")) {
      requirePro("MESSAGING");
      return;
    }

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

  function openNotificationModeration(incidentId) {
    if (!incidentId || !isAdmin) return;
    setSelectedModerationIncident(incidentId);
    setPage("admin");
    window.location.hash = "";
    window.scrollTo(0, 0);
    loadActivityCounts(true);
  }

  function requirePro(feature) {
    const requiredEntitlement =
      feature === "MESSAGING"
        ? "MESSAGING"
        : feature === "LIVE_CHAT"
          ? "LIVE_CHAT"
          : "CONVERSATIONS";

    if (entitlements.includes(requiredEntitlement)) {
      if (requiredEntitlement === "MESSAGING") setPage("messages");
      if (requiredEntitlement === "CONVERSATIONS") setPage("conversations");
      return true;
    }

    setProGateFeature(requiredEntitlement);
    window.location.hash = "";
    window.scrollTo(0, 0);
    return false;
  }


  async function handleAccessGranted() {
    await loadAccess(true, false);

    setPage("home");
    setSelectedDiscussion(null);
    setSelectedInstrument(null);

    window.scrollTo(0, 0);
  }

  function updateAppearance(nextAppearance) {
    const normalized = applyAppearance(nextAppearance);
    setAppearance(normalized);

    try {
      window.localStorage.setItem(
        DWMY_APPEARANCE_KEY,
        JSON.stringify(normalized)
      );
    } catch (error) {
      console.warn("Appearance preference save failed:", error);
    }
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

  function openCommunityDiscussion(discussion, returnContext) {
    setSelectedDiscussion(discussion);
    setCommunityReturnContext(returnContext || null);
    setPage("discussion");

    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`
    );
    window.scrollTo(0, 0);
  }

  function openDiscussion(discussion) {
    setCommunityReturnContext(null);
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

  if (!user.onboarding_completed_at) {
    return (
      <ProfileOnboarding
        user={user}
        onComplete={async () => {
          if (session?.user) {
            await loadIdentity(session.user, true);
            await loadAccess(true, false);
          }

          setPage("home");
          setSelectedDiscussion(null);
          setSelectedInstrument(null);
          window.scrollTo(0, 0);
        }}
      />
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
        entitlements={entitlements}
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
        entitlements={entitlements}
        onRequirePro={requirePro}
      />

      <main
        className={
          page === "admin"
            ? "admin-page-container"
            : "site-container"
        }
      >
        {proGateFeature && (
          <ProAccessGate
            feature={proGateFeature}
            onBack={() => {
              setProGateFeature(null);
              setPage("markets");
              window.scrollTo(0, 0);
            }}
          />
        )}

        {!proGateFeature && page === "home" && (
          <Home
            user={user}
            entitlements={entitlements}
            openDiscussion={
              openDiscussion
            }
            openInstrument={
              openInstrument
            }
            openDirectory={() => {
              setPage("markets");
              window.scrollTo(0, 0);
            }}
          />
        )}

        {!proGateFeature && page === "markets" && (
          <MarketDirectory openInstrument={openInstrument} />
        )}

        {!proGateFeature && page === "conversations" && (
          <Conversations
            user={user}
            entitlements={entitlements}
            openDiscussion={
              openDiscussion
            }
          />
        )}


        {!proGateFeature && page === "communities" && (
          <Communities
            user={user}
            openDiscussion={openCommunityDiscussion}
            returnContext={communityReturnContext}
            onReturnContextConsumed={() => setCommunityReturnContext(null)}
          />
        )}

        {!proGateFeature && page === "instrument" &&
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

        {!proGateFeature && page === "discussion" &&
          selectedDiscussion && (
            <Discussion
              discussion={
                selectedDiscussion
              }
              user={user}
              entitlements={entitlements}
              goBack={() => {
                if (selectedDiscussion?.discussionType === "COMMUNITY") {
                  setPage("communities");
                  return;
                }
                if (selectedDiscussion?.discussionType === "CONVERSATION") {
                  setPage("conversations");
                  return;
                }
                if (selectedInstrument) {
                  setPage("instrument");
                  return;
                }
                setPage("home");
              }}
              onOpenConversations={() => setPage("conversations")}
              onMessageUser={messageUser}
            />
          )}

        {!proGateFeature && page === "notifications" && (
          <Notifications
            onOpenPost={openNotificationPost}
            onOpenMessage={openNotificationMessage}
            onOpenModeration={openNotificationModeration}
            onOpenCommunities={() => {
              setCommunityReturnContext(null);
              setPage("communities");
              window.history.replaceState(
                null,
                "",
                `${window.location.pathname}${window.location.search}`
              );
              window.scrollTo(0, 0);
              loadActivityCounts(true);
            }}
            onChanged={() => loadActivityCounts(true)}
          />
        )}

        {!proGateFeature && page === "messages" && (
          <Messages
            user={user}
            initialConversationId={selectedMessageConversation}
            onChanged={() => loadActivityCounts(true)}
          />
        )}

        {!proGateFeature && page === "settings" && (
          <Settings
            user={user}
            entitlements={entitlements}
            appearance={appearance}
            onAppearanceChange={updateAppearance}
            onProfileUpdated={() =>
              session?.user
                ? loadIdentity(session.user, true)
                : Promise.resolve()
            }
          />
        )}

        {!proGateFeature && page === "admin" &&
          isAdmin && (
            <Admin
              initialModerationIncidentId={selectedModerationIncident}
              onModerationIncidentOpened={() => setSelectedModerationIncident(null)}
            />
          )}

        {!proGateFeature && page === "admin" &&
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