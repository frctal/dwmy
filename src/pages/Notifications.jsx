import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function when(ts) {
  return ts ? new Date(ts).toLocaleString() : "";
}

function label(n) {
  const who = n.actor?.display_name || n.actor?.username || "DWMY";

  if (n.notification_type === "REPLY") return `${who} replied to your post`;
  if (n.notification_type === "MENTION") return `${who} mentioned you`;
  if (n.notification_type === "REACTION") return `${who} liked your post`;
  if (n.notification_type === "DIRECT_MESSAGE") return `${who} sent you a message`;
  if (n.notification_type === "COMMUNITY_INVITATION") return `${who} invited you to a Community`;

  if (n.notification_type === "MODERATION_INCIDENT") {
    return "New moderation case requires review";
  }

  if (n.notification_type === "MODERATION_NOTE") {
    return "New moderator note on an assigned case";
  }

  if (n.notification_type === "MODERATION_WARNING") {
    return "Moderation warning issued";
  }

  if (n.notification_type === "MODERATION_RESTRICTION") {
    return "A moderation restriction was applied to your account";
  }

  if (n.notification_type === "MODERATION_RESTRICTION_REVOKED") {
    return "A moderation restriction was revoked";
  }

  return `${who}: ${String(n.notification_type || "notification")
    .toLowerCase()
    .replaceAll("_", " ")}`;
}

export default function Notifications({
  onOpenPost,
  onOpenMessage,
  onOpenModeration,
  onOpenCommunities,
  onChanged,
}) {
  const [tab, setTab] = useState("active");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [moderationDetails, setModerationDetails] = useState({});

  async function load() {
    setLoading(true);
    setError("");

    let q = supabase
      .from("notifications")
      .select(`
        id,
        notification_type,
        discussion_id,
        post_id,
        message_conversation_id,
        message_id,
        moderation_incident_id,
        community_invitation_id,
        is_read,
        created_at,
        read_at,
        archived_at,
        actor:profiles!notifications_actor_user_id_fkey(
          id,
          username,
          display_name
        )
      `)
      .order("created_at", { ascending: false })
      .limit(200);

    q =
      tab === "active"
        ? q.is("archived_at", null)
        : q.not("archived_at", "is", null);

    const { data, error } = await q;

    if (error) {
      setError(error.message);
      setRows([]);
      setModerationDetails({});
    } else {
      const nextRows = data || [];
      setRows(nextRows);

      const incidentIds = [
        ...new Set(
          nextRows
            .filter((row) =>
              ["MODERATION_WARNING", "MODERATION_RESTRICTION", "MODERATION_RESTRICTION_REVOKED"].includes(
                row.notification_type
              )
            )
            .map((row) => row.moderation_incident_id)
            .filter(Boolean)
        ),
      ];

      if (incidentIds.length === 0) {
        setModerationDetails({});
      } else {
        const { data: detailRows, error: detailError } = await supabase.rpc(
          "get_my_moderation_notification_details",
          { target_incident_ids: incidentIds }
        );

        if (detailError) {
          console.error("Moderation notification details failed:", detailError);
          setModerationDetails({});
        } else {
          setModerationDetails(
            Object.fromEntries(
              (detailRows || []).map((detail) => [detail.incident_id, detail])
            )
          );
        }
      }
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [tab]);

  async function open(n) {
    const { error } = await supabase.rpc("open_notification", {
      target_notification_id: n.id,
    });

    if (error) {
      setError(error.message);
      return;
    }

    onChanged?.();

    if (
      (n.notification_type === "MODERATION_INCIDENT" ||
        n.notification_type === "MODERATION_NOTE") &&
      n.moderation_incident_id &&
      onOpenModeration
    ) {
      onOpenModeration(n.moderation_incident_id);
      return;
    }

    if (
      n.notification_type === "COMMUNITY_INVITATION" &&
      n.community_invitation_id &&
      onOpenCommunities
    ) {
      onOpenCommunities();
      return;
    }

    if (
      n.notification_type === "DIRECT_MESSAGE" &&
      n.message_conversation_id
    ) {
      onOpenMessage(n.message_conversation_id, n.message_id);
      return;
    }

    if (n.discussion_id) {
      onOpenPost(n.discussion_id, n.post_id);
      return;
    }

    const moderationDetail = moderationDetails[n.moderation_incident_id];
    if (
      moderationDetail?.community_id &&
      onOpenCommunities
    ) {
      onOpenCommunities(moderationDetail.community_id);
    }
  }

  async function archive(id) {
    const { error } = await supabase.rpc("archive_notification", {
      target_notification_id: id,
    });

    if (error) setError(error.message);
    else {
      await load();
      onChanged?.();
    }
  }

  async function restore(id) {
    const { error } = await supabase.rpc("restore_notification", {
      target_notification_id: id,
    });

    if (error) setError(error.message);
    else {
      await load();
      onChanged?.();
    }
  }

  async function clearAll() {
    const { error } = await supabase.rpc("archive_all_notifications");

    if (error) setError(error.message);
    else {
      await load();
      onChanged?.();
    }
  }

  return (
    <section className="notification-center">
      <div className="page-title-row">
        <div>
          <span className="eyebrow">DWMY ACTIVITY</span>
          <h1>Notification Center</h1>
          <p>
            Active notifications disappear after opening, but remain available
            in Archive.
          </p>
        </div>

        {tab === "active" && rows.length > 0 && (
          <button className="dwmy-action-button" onClick={clearAll}>
            Clear Active
          </button>
        )}
      </div>

      <div className="notification-tabs">
        <button
          className={tab === "active" ? "active" : ""}
          onClick={() => setTab("active")}
        >
          Active
        </button>

        <button
          className={tab === "archive" ? "active" : ""}
          onClick={() => setTab("archive")}
        >
          Archive
        </button>
      </div>

      {error && <div className="discussion-open-error">{error}</div>}

      {loading ? (
        <div className="market-directory-state">Loading notifications...</div>
      ) : rows.length === 0 ? (
        <div className="market-directory-state">
          {tab === "active"
            ? "You're caught up."
            : "No archived notifications yet."}
        </div>
      ) : (
        <div className="notification-list">
          {rows.map((n) => {
            const detail = moderationDetails[n.moderation_incident_id];
            const isMemberModeration = [
              "MODERATION_WARNING",
              "MODERATION_RESTRICTION",
              "MODERATION_RESTRICTION_REVOKED",
            ].includes(n.notification_type);

            return (
              <article className="notification-row" key={n.id}>
                <button className="notification-main" onClick={() => open(n)}>
                  <strong>{label(n)}</strong>

                  {isMemberModeration && detail?.community_name && (
                    <span className="notification-context">
                      {detail.community_name}
                    </span>
                  )}

                  {isMemberModeration && detail?.reason_text && (
                    <span className="notification-moderation-reason">
                      <b>Reason:</b> {detail.reason_text}
                    </span>
                  )}

                  {n.notification_type === "MODERATION_RESTRICTION" &&
                    detail?.restriction_expires_at && (
                      <span className="notification-context">
                        Until {when(detail.restriction_expires_at)}
                      </span>
                    )}

                  <span>{when(n.created_at)}</span>

                  {isMemberModeration &&
                    (n.discussion_id || detail?.community_id) && (
                      <span className="notification-context-link">
                        {n.discussion_id ? "View context →" : "Open Community →"}
                      </span>
                    )}
                </button>

                {tab === "active" ? (
                  <button
                    className="dwmy-text-button"
                    onClick={() => archive(n.id)}
                  >
                    Archive
                  </button>
                ) : (
                  <button
                    className="dwmy-text-button"
                    onClick={() => restore(n.id)}
                  >
                    Restore
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
