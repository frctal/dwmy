import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Admin({
  initialModerationIncidentId = null,
  onModerationIncidentOpened,
}) {
  const [tab, setTab] = useState("dashboard");

  // Real Supabase-backed administration data.
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [roleUpdatingUserId, setRoleUpdatingUserId] = useState(null);
  const [dashboardStats, setDashboardStats] = useState({
    users: 0, sections: 0, discussions: 0, reports: 0, open_incidents: 0,
  });
  const [dashboardLoading, setDashboardLoading] = useState(false);

  // Real Supabase-backed market directory administration.
  const [sections, setSections] = useState([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState("");
  const [directoryMessage, setDirectoryMessage] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [sectionName, setSectionName] = useState("");
  const [sectionDescription, setSectionDescription] = useState("");
  const [hierarchyType, setHierarchyType] = useState("market");
  const [creatingSection, setCreatingSection] = useState(false);

  const [addingInstrumentTo, setAddingInstrumentTo] = useState(null);
  const [instrumentSymbol, setInstrumentSymbol] = useState("");
  const [instrumentName, setInstrumentName] = useState("");
  const [instrumentDescription, setInstrumentDescription] = useState("");
  const [creatingInstrument, setCreatingInstrument] = useState(false);

  // Real beta invitation administration.
  const [invites, setInvites] = useState([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [showInviteCreate, setShowInviteCreate] = useState(false);

  const [inviteNote, setInviteNote] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteExpirationDays, setInviteExpirationDays] = useState("14");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [createdInvite, setCreatedInvite] = useState(null);
  const [copiedCode, setCopiedCode] = useState("");

  // Moderation V1.1 — live incident queue.
  const [moderationQueue, setModerationQueue] = useState([]);
  const [moderationLoading, setModerationLoading] = useState(false);
  const [moderationError, setModerationError] = useState("");
  const [moderationStatus, setModerationStatus] = useState("OPEN");
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [incidentLoading, setIncidentLoading] = useState(false);
  const [incidentActionLoading, setIncidentActionLoading] = useState(false);
  const [moderationNote, setModerationNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [subjectContext, setSubjectContext] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextView, setContextView] = useState("recent_posts");
  const [enforcementType, setEnforcementType] = useState("WARNING");
  const [enforcementScope, setEnforcementScope] = useState("PLATFORM");
  const [enforcementDuration, setEnforcementDuration] = useState("24");
  const [enforcementReason, setEnforcementReason] = useState("");
  const [enforcementSaving, setEnforcementSaving] = useState(false);

  const moderationStages = ["OPEN", "CLAIMED", "INVESTIGATING", "PENDING_APPROVAL", "ACTIONED", "RESOLVED"];

  const loadModerationQueue = useCallback(async (status = moderationStatus) => {
    setModerationLoading(true); setModerationError("");
    const { data, error } = await supabase.rpc("get_moderation_queue", {
      requested_status: status === "ALL" ? null : status,
      requested_limit: 100,
    });
    if (error) {
      console.error("Failed to load moderation queue:", error);
      setModerationError(error.message || "Could not load moderation queue."); setModerationQueue([]);
    } else setModerationQueue(data || []);
    setModerationLoading(false);
  }, [moderationStatus]);

  useEffect(() => {
    if (tab === "moderation") loadModerationQueue(moderationStatus);
  }, [tab, moderationStatus, loadModerationQueue]);

  async function openModerationIncident(incidentId) {
    setIncidentLoading(true); setModerationError("");
    const { data, error } = await supabase.rpc("get_moderation_incident", { target_incident_id: incidentId });
    if (error) { setModerationError(error.message || "Could not open moderation incident."); setSelectedIncident(null); }
    else setSelectedIncident(data || null);
    setIncidentLoading(false);
  }

  // Moderation notification deep-link:
  // App hands us the exact incident id; Admin opens the Moderation tab and case.
  useEffect(() => {
    if (!initialModerationIncidentId) return;

    setTab("moderation");
    setModerationStatus("ALL");
    setSubjectContext(null);

    openModerationIncident(initialModerationIncidentId).finally(() => {
      onModerationIncidentOpened?.();
    });
  }, [initialModerationIncidentId, onModerationIncidentOpened]);

  async function claimModerationIncident(incidentId) {
    setIncidentActionLoading(true); setModerationError("");
    const { error } = await supabase.rpc("claim_moderation_incident", { target_incident_id: incidentId });
    if (error) setModerationError(error.message || "Could not claim incident.");
    else { await loadModerationQueue(moderationStatus); await openModerationIncident(incidentId); }
    setIncidentActionLoading(false);
  }

  async function changeModerationStatus(incidentId, status) {
    setIncidentActionLoading(true); setModerationError("");
    let resolution = null;
    if (status === "DISMISSED" || status === "RESOLVED") {
      resolution = window.prompt(status === "DISMISSED" ? "Why is this incident being dismissed?" : "Resolution note (optional):", "");
      if (resolution === null) { setIncidentActionLoading(false); return; }
    }
    const { error } = await supabase.rpc("set_moderation_incident_status", {
      target_incident_id: incidentId, new_status: status, resolution_text: resolution || null,
    });
    if (error) setModerationError(error.message || "Could not update incident.");
    else { await loadModerationQueue(moderationStatus); await openModerationIncident(incidentId); }
    setIncidentActionLoading(false);
  }

  async function addModerationNote(e) {
    e?.preventDefault();
    const body = moderationNote.trim();
    const incidentId = selectedIncident?.incident?.id;
    if (!body || !incidentId || noteSaving) return;
    setNoteSaving(true); setModerationError("");
    const { error } = await supabase.rpc("add_moderation_note", {
      target_incident_id: incidentId, note_body: body, requested_note_type: "INTERNAL",
    });
    if (error) setModerationError(error.message || "Could not add moderator note.");
    else { setModerationNote(""); await openModerationIncident(incidentId); }
    setNoteSaving(false);
  }

  async function loadSubjectContext(view = contextView) {
    const incidentId = selectedIncident?.incident?.id;
    if (!incidentId) return;
    setContextView(view); setContextLoading(true); setModerationError("");
    const { data, error } = await supabase.rpc("get_moderation_subject_context", {
      target_incident_id: incidentId, recent_post_limit: 25,
    });
    if (error) setModerationError(error.message || "Could not load investigation context.");
    else setSubjectContext(data || null);
    setContextLoading(false);
  }

  async function executeModerationEnforcement() {
    const incident = selectedIncident?.incident;
    if (!incident || enforcementSaving) return;

    const action = enforcementType;
    const needsDuration = action === "MUTE" || action === "SUSPEND";
    const hours = needsDuration ? Number(enforcementDuration) : null;
    if (needsDuration && (!Number.isFinite(hours) || hours <= 0)) {
      setModerationError("Choose a valid enforcement duration.");
      return;
    }

    const confirmed = window.confirm(
      `Execute ${action.replaceAll("_", " ")} for ${incident.public_ref}?\n\n` +
      "This will create a permanent moderation action record."
    );
    if (!confirmed) return;

    setEnforcementSaving(true); setModerationError("");
    const { error } = await supabase.rpc("execute_moderation_enforcement", {
      target_incident_id: incident.id,
      requested_action_type: action,
      requested_scope_type: enforcementScope,
      duration_hours: needsDuration ? hours : null,
      action_reason: enforcementReason.trim() || null,
    });
    if (error) setModerationError(error.message || "Could not execute moderation action.");
    else {
      setEnforcementReason("");
      await loadModerationQueue(moderationStatus);
      await openModerationIncident(incident.id);
      await loadDashboardStats();
    }
    setEnforcementSaving(false);
  }

  async function revokeModerationRestriction(restriction) {
    const incidentId = selectedIncident?.incident?.id;
    if (!incidentId || !restriction?.id || enforcementSaving) return;
    const reason = window.prompt("Why is this restriction being revoked?", "Restriction ended by moderator.");
    if (reason === null) return;
    setEnforcementSaving(true); setModerationError("");
    const { error } = await supabase.rpc("revoke_moderation_restriction", {
      target_restriction_id: restriction.id,
      revoke_reason_text: reason.trim() || null,
    });
    if (error) setModerationError(error.message || "Could not revoke restriction.");
    else { await openModerationIncident(incidentId); await loadDashboardStats(); }
    setEnforcementSaving(false);
  }

  async function continueModerationIncident() {
    const incident = selectedIncident?.incident;
    if (!incident || incidentActionLoading) return;
    if (incident.status === "OPEN") {
      if (!incident.assigned_to) await claimModerationIncident(incident.id);
      else await changeModerationStatus(incident.id, "CLAIMED");
      return;
    }
    const next = { CLAIMED: "INVESTIGATING", INVESTIGATING: "PENDING_APPROVAL", PENDING_APPROVAL: "ACTIONED", ACTIONED: "RESOLVED" }[incident.status];
    if (next) await changeModerationStatus(incident.id, next);
  }

  const loadAdminUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError("");
    const { data, error } = await supabase.rpc("admin_get_users");
    if (error) {
      console.error("Failed to load admin users:", error);
      setUsersError(error.message || "Could not load users.");
      setUsers([]);
    } else {
      setUsers(data || []);
    }
    setUsersLoading(false);
  }, []);

  const loadDashboardStats = useCallback(async () => {
    setDashboardLoading(true);
    const { data, error } = await supabase.rpc("admin_get_dashboard_stats");
    if (error) {
      console.error("Failed to load dashboard stats:", error);
    } else if (data) {
      setDashboardStats(data);
    }
    setDashboardLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "users") loadAdminUsers();
    if (tab === "dashboard") loadDashboardStats();
  }, [tab, loadAdminUsers, loadDashboardStats]);

  async function setUserRole(user, roleCode, enabled) {
    if (roleUpdatingUserId) return;
    const verb = enabled ? "grant" : "remove";
    const confirmed = window.confirm(
      `${verb === "grant" ? "Grant" : "Remove"} ${roleCode} ${enabled ? "to" : "from"} @${user.username || user.user_id}?`
    );
    if (!confirmed) return;

    setRoleUpdatingUserId(user.user_id);
    setUsersError("");
    const { error } = await supabase.rpc("admin_set_user_role", {
      target_user_id: user.user_id,
      target_role_code: roleCode,
      enabled_value: enabled,
    });
    if (error) {
      setUsersError(error.message || "Could not update role.");
    } else {
      await Promise.all([loadAdminUsers(), loadDashboardStats()]);
    }
    setRoleUpdatingUserId(null);
  }

  function slugify(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  const loadDirectory = useCallback(async () => {
    setDirectoryLoading(true);
    setDirectoryError("");

    const { data, error } = await supabase
      .from("sections")
      .select(`
        id,
        section_type,
        slug,
        name,
        description,
        sort_order,
        is_active,
        instruments (
          id,
          section_id,
          symbol,
          slug,
          name,
          description,
          sort_order,
          is_active
        )
      `)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("Failed to load directory:", error);
      setDirectoryError(error.message || "Could not load the market directory.");
      setSections([]);
    } else {
      setSections(
        (data || []).map((section) => ({
          ...section,
          hierarchyType: String(section.section_type || "").toLowerCase(),
          instruments: (section.instruments || []).sort(
            (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
          ),
          children: [],
        }))
      );
    }

    setDirectoryLoading(false);
  }, []);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  async function createSection(e) {
    e.preventDefault();

    const clean = sectionName.trim();
    if (!clean || creatingSection) return;

    setCreatingSection(true);
    setDirectoryError("");
    setDirectoryMessage("");

    const sectionType =
      hierarchyType === "market"
        ? "MARKET"
        : hierarchyType === "education"
          ? "EDUCATION"
          : "GENERAL";

    const maxSort = sections.reduce(
      (max, section) => Math.max(max, Number(section.sort_order) || 0),
      0
    );

    const { error } = await supabase.rpc("admin_create_section", {
      section_name: clean,
      section_slug: slugify(clean),
      section_description: sectionDescription.trim() || null,
      section_type_value: sectionType,
      section_sort_order: maxSort + 10,
    });

    if (error) {
      console.error("Failed to create section:", error);
      setDirectoryError(error.message || "Could not create section.");
      setCreatingSection(false);
      return;
    }

    setSectionName("");
    setSectionDescription("");
    setHierarchyType("market");
    setShowCreate(false);
    setCreatingSection(false);
    setDirectoryMessage(`${clean} created in the live DWMY directory.`);
    await loadDirectory();
  }

  async function createInstrument(e, section) {
    e.preventDefault();

    const symbol = instrumentSymbol.trim().toUpperCase();
    const name = instrumentName.trim();

    if (!symbol || !name || creatingInstrument) return;

    setCreatingInstrument(true);
    setDirectoryError("");
    setDirectoryMessage("");

    const maxSort = (section.instruments || []).reduce(
      (max, instrument) => Math.max(max, Number(instrument.sort_order) || 0),
      0
    );

    const { error } = await supabase.rpc("admin_create_instrument", {
      target_section_id: section.id,
      instrument_symbol: symbol,
      instrument_slug: slugify(symbol.replace("/", "-")),
      instrument_name: name,
      instrument_description: instrumentDescription.trim() || null,
      instrument_sort_order: maxSort + 10,
    });

    if (error) {
      console.error("Failed to create instrument:", error);
      setDirectoryError(error.message || "Could not create instrument.");
      setCreatingInstrument(false);
      return;
    }

    setInstrumentSymbol("");
    setInstrumentName("");
    setInstrumentDescription("");
    setAddingInstrumentTo(null);
    setCreatingInstrument(false);
    setDirectoryMessage(`${symbol} added to ${section.name}.`);
    await loadDirectory();
  }

  async function toggleSectionActive(section) {
    setDirectoryError("");
    setDirectoryMessage("");

    const next = !section.is_active;
    const { error } = await supabase.rpc("admin_set_section_active", {
      target_section_id: section.id,
      active_value: next,
    });

    if (error) {
      console.error("Failed to update section:", error);
      setDirectoryError(error.message || "Could not update section.");
      return;
    }

    setDirectoryMessage(
      `${section.name} is now ${next ? "active" : "inactive"}.`
    );
    await loadDirectory();
  }

  async function toggleInstrumentActive(instrument) {
    setDirectoryError("");
    setDirectoryMessage("");

    const next = !instrument.is_active;
    const { error } = await supabase.rpc("admin_set_instrument_active", {
      target_instrument_id: instrument.id,
      active_value: next,
    });

    if (error) {
      console.error("Failed to update instrument:", error);
      setDirectoryError(error.message || "Could not update instrument.");
      return;
    }

    setDirectoryMessage(
      `${instrument.symbol} is now ${next ? "active" : "inactive"}.`
    );
    await loadDirectory();
  }

  const loadInvites = useCallback(async () => {
    setInvitesLoading(true);
    setInviteError("");

    const { data, error } = await supabase.rpc("list_beta_invites");

    if (error) {
      console.error("Failed to load beta invitations:", error);
      setInviteError(error.message || "Could not load beta invitations.");
      setInvites([]);
    } else {
      setInvites(data || []);
    }

    setInvitesLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "invites") {
      loadInvites();
    }
  }, [tab, loadInvites]);

  async function createBetaInvite(e) {
    e.preventDefault();

    setCreatingInvite(true);
    setInviteError("");
    setCreatedInvite(null);

    let expiresAt = null;

    const expirationDays = Number(inviteExpirationDays);

    if (
      inviteExpirationDays !== "" &&
      Number.isFinite(expirationDays) &&
      expirationDays > 0
    ) {
      const expiration = new Date();
      expiration.setDate(expiration.getDate() + expirationDays);
      expiresAt = expiration.toISOString();
    }

    const { data, error } = await supabase.rpc("create_beta_invite", {
      invite_note: inviteNote.trim() || null,
      invite_email: inviteEmail.trim() || null,
      invite_expires_at: expiresAt,
    });

    if (error) {
      console.error("Failed to create beta invitation:", error);
      setInviteError(error.message || "Could not create beta invitation.");
      setCreatingInvite(false);
      return;
    }

    const invite = Array.isArray(data) ? data[0] : data;

    setCreatedInvite(invite || null);
    setInviteNote("");
    setInviteEmail("");
    setInviteExpirationDays("14");
    setShowInviteCreate(false);
    setCreatingInvite(false);

    await loadInvites();
  }

  async function revokeInvite(invite) {
    const confirmed = window.confirm(
      `Revoke invitation ${invite.code}? This prevents it from being redeemed.`
    );

    if (!confirmed) return;

    setInviteError("");

    const { error } = await supabase.rpc("revoke_beta_invite", {
      target_access_code_id: invite.access_code_id,
    });

    if (error) {
      console.error("Failed to revoke beta invitation:", error);
      setInviteError(error.message || "Could not revoke invitation.");
      return;
    }

    await loadInvites();
  }

  async function copyInviteCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);

      window.setTimeout(() => {
        setCopiedCode((current) => (current === code ? "" : current));
      }, 1600);
    } catch (error) {
      console.error("Could not copy invitation code:", error);
      setInviteError("Could not copy the invitation code.");
    }
  }

  function formatDate(value) {
    if (!value) return "None";

    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function inviteStatusClass(status) {
    return `invite-status invite-status-${String(status || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}`;
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div>
          <span className="eyebrow">Control Center</span>
          <h2>Administration</h2>
        </div>

        <nav>
          <button
            className={tab === "dashboard" ? "active" : ""}
            onClick={() => setTab("dashboard")}
          >
            Dashboard
          </button>

          <button
            className={tab === "users" ? "active" : ""}
            onClick={() => setTab("users")}
          >
            Users & Roles
          </button>

          <button
            className={tab === "invites" ? "active" : ""}
            onClick={() => setTab("invites")}
          >
            Beta Invitations
          </button>

          <button
            className={tab === "sections" ? "active" : ""}
            onClick={() => setTab("sections")}
          >
            Sections
          </button>

          <button
            className={tab === "moderation" ? "active" : ""}
            onClick={() => setTab("moderation")}
          >
            Moderation
          </button>

          <button
            className={tab === "permissions" ? "active" : ""}
            onClick={() => setTab("permissions")}
          >
            Permissions
          </button>
        </nav>
      </aside>

      <main className="admin-main">
        {tab === "dashboard" && (
          <>
            <div className="admin-title">
              <div>
                <span className="eyebrow">Overview</span>
                <h1>Forum Administration</h1>
              </div>
            </div>

            <div className="admin-stats admin-stats-live">
              <div><strong>{dashboardLoading ? "…" : dashboardStats.users}</strong><span>Users</span></div>
              <div><strong>{dashboardLoading ? "…" : dashboardStats.sections}</strong><span>Sections</span></div>
              <div><strong>{dashboardLoading ? "…" : dashboardStats.discussions}</strong><span>Discussions</span></div>
              <div><strong>{dashboardLoading ? "…" : dashboardStats.open_incidents}</strong><span>Open Cases</span></div>
              <div><strong>{dashboardLoading ? "…" : dashboardStats.reports}</strong><span>Reports</span></div>
            </div>

            <section className="admin-panel">
              <h2>Architecture</h2>

              <p>
                Market sections enforce instrument -&gt; Day / Week / Month /
                Year segmentation. General sections use a conventional nested
                hierarchy.
              </p>
            </section>
          </>
        )}

        {tab === "users" && (
          <>
            <div className="admin-title">
              <div>
                <span className="eyebrow">Access Control</span>
                <h1>Users & Roles</h1>
                <p>Live registered DWMY profiles and their real platform roles.</p>
              </div>
              <button onClick={loadAdminUsers} disabled={usersLoading}>
                {usersLoading ? "Refreshing..." : "Refresh Users"}
              </button>
            </div>

            {usersError && <div className="invite-message invite-message-error">{usersError}</div>}

            <section className="admin-panel">
              {usersLoading && users.length === 0 ? (
                <div className="market-directory-state">Loading registered users...</div>
              ) : users.length === 0 ? (
                <div className="market-directory-state">No registered profiles found.</div>
              ) : (
                <div className="admin-user-list">
                  {users.map((account) => {
                    const roles = account.roles || [];
                    const isAdminRole = roles.includes("ADMIN");
                    const isModeratorRole = roles.includes("MODERATOR");
                    return (
                      <article className="admin-user-card" key={account.user_id}>
                        <div className="admin-user-identity">
                          <div>
                            <strong>@{account.username || "unknown"}</strong>
                            <span>{account.display_name || "No display name"}</span>
                          </div>
                          <small>Joined {formatDate(account.created_at)}</small>
                        </div>

                        <div className="admin-user-facts">
                          <div><span>Posts</span><strong>{account.post_count || 0}</strong></div>
                          <div><span>Open cases</span><strong>{account.open_incident_count || 0}</strong></div>
                          <div><span>Restrictions</span><strong>{account.active_restriction_count || 0}</strong></div>
                        </div>

                        <div className="admin-user-roles">
                          <div className="admin-role-pills">
                            {(roles.length ? roles : ["USER"]).map((role) => (
                              <span className={`role-pill ${role.toLowerCase()}`} key={role}>{role}</span>
                            ))}
                          </div>
                          <div className="admin-role-actions">
                            <button
                              disabled={roleUpdatingUserId === account.user_id}
                              onClick={() => setUserRole(account, "MODERATOR", !isModeratorRole)}
                            >
                              {isModeratorRole ? "Remove Moderator" : "Make Moderator"}
                            </button>
                            <button
                              disabled={roleUpdatingUserId === account.user_id}
                              onClick={() => setUserRole(account, "ADMIN", !isAdminRole)}
                            >
                              {isAdminRole ? "Remove Admin" : "Make Admin"}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {tab === "invites" && (
          <>
            <div className="admin-title">
              <div>
                <span className="eyebrow">Founding Beta</span>
                <h1>Beta Invitations</h1>
                <p>
                  Issue individual, single-use invitations and maintain the
                  admission history for DWMY beta access.
                </p>
              </div>

              <button
                className="primary-button"
                onClick={() => {
                  setShowInviteCreate((current) => !current);
                  setCreatedInvite(null);
                  setInviteError("");
                }}
              >
                + Generate Invitation
              </button>
            </div>

            {inviteError && (
              <div className="invite-message invite-message-error">
                {inviteError}
              </div>
            )}

            {createdInvite && (
              <section className="admin-panel invite-created-panel">
                <span className="eyebrow">Invitation Generated</span>
                <h2>{createdInvite.code}</h2>

                <p>
                  This is an individual, single-use beta invitation. Send it
                  only to the intended tester.
                </p>

                <div className="invite-created-actions">
                  <button
                    className="primary-button"
                    onClick={() => copyInviteCode(createdInvite.code)}
                  >
                    {copiedCode === createdInvite.code
                      ? "Copied"
                      : "Copy Code"}
                  </button>
                </div>
              </section>
            )}

            {showInviteCreate && (
              <form
                className="create-section invite-create-form"
                onSubmit={createBetaInvite}
              >
                <label>
                  Recipient email
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="Optional"
                  />
                </label>

                <label>
                  Admin note
                  <input
                    value={inviteNote}
                    onChange={(e) => setInviteNote(e.target.value)}
                    placeholder="e.g. John's founding beta invite"
                  />
                </label>

                <label>
                  Invitation expires in
                  <select
                    value={inviteExpirationDays}
                    onChange={(e) =>
                      setInviteExpirationDays(e.target.value)
                    }
                  >
                    <option value="1">1 day</option>
                    <option value="3">3 days</option>
                    <option value="7">7 days</option>
                    <option value="14">14 days</option>
                    <option value="30">30 days</option>
                    <option value="">No expiration</option>
                  </select>
                </label>

                <div className="segmentation-preview">
                  <strong>Access after redemption</strong>
                  <span>[x] Markets</span>
                  <span>[x] Conversations</span>
                  <span>[x] Live Chat</span>
                  <span>[ ] Education</span>
                  <span>90-day founding beta grant</span>
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    disabled={creatingInvite}
                    onClick={() => setShowInviteCreate(false)}
                  >
                    Cancel
                  </button>

                  <button
                    className="primary-button"
                    type="submit"
                    disabled={creatingInvite}
                  >
                    {creatingInvite
                      ? "Generating..."
                      : "Generate Invitation"}
                  </button>
                </div>
              </form>
            )}

            <section className="admin-panel">
              <div className="invite-panel-heading">
                <div>
                  <h2>Invitation History</h2>
                  <p>
                    Each invitation is individually issued and can be redeemed
                    once.
                  </p>
                </div>

                <button
                  onClick={loadInvites}
                  disabled={invitesLoading}
                >
                  {invitesLoading ? "Loading..." : "Refresh"}
                </button>
              </div>

              {invitesLoading && invites.length === 0 ? (
                <p>Loading beta invitations...</p>
              ) : invites.length === 0 ? (
                <div className="invite-empty">
                  <strong>No individual beta invitations yet.</strong>
                  <p>
                    Generate the first invitation when you are ready to admit
                    a tester.
                  </p>
                </div>
              ) : (
                <div className="invite-list">
                  {invites.map((invite) => (
                    <article
                      className="invite-card"
                      key={invite.access_code_id}
                    >
                      <div className="invite-card-top">
                        <div>
                          <span
                            className={inviteStatusClass(invite.status)}
                          >
                            {invite.status}
                          </span>

                          <h3>{invite.code}</h3>
                        </div>

                        <div className="invite-card-actions">
                          <button
                            onClick={() =>
                              copyInviteCode(invite.code)
                            }
                          >
                            {copiedCode === invite.code
                              ? "Copied"
                              : "Copy"}
                          </button>

                          {invite.status === "ACTIVE" && (
                            <button
                              onClick={() => revokeInvite(invite)}
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="invite-meta-grid">
                        <div>
                          <span>Created</span>
                          <strong>{formatDate(invite.created_at)}</strong>
                        </div>

                        <div>
                          <span>Invite expires</span>
                          <strong>
                            {formatDate(invite.invite_expires_at)}
                          </strong>
                        </div>

                        <div>
                          <span>Recipient</span>
                          <strong>
                            {invite.intended_email || "Not specified"}
                          </strong>
                        </div>

                        <div>
                          <span>Admin note</span>
                          <strong>
                            {invite.note || "None"}
                          </strong>
                        </div>

                        {invite.status === "REDEEMED" && (
                          <>
                            <div>
                              <span>Redeemed by</span>
                              <strong>
                                {invite.redeemed_username ||
                                  invite.redeemed_user_id}
                              </strong>
                            </div>

                            <div>
                              <span>Redeemed</span>
                              <strong>
                                {formatDate(invite.redeemed_at)}
                              </strong>
                            </div>

                            <div>
                              <span>Access expires</span>
                              <strong>
                                {formatDate(invite.grant_expires_at)}
                              </strong>
                            </div>
                          </>
                        )}

                        {invite.status === "REVOKED" && (
                          <div>
                            <span>Revoked</span>
                            <strong>
                              {formatDate(invite.revoked_at)}
                            </strong>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {tab === "sections" && (
          <>
            <div className="admin-title">
              <div>
                <span className="eyebrow">Forum Structure</span>
                <h1>Sections & Hierarchy</h1>
              </div>

              <button
                className="primary-button"
                onClick={() => setShowCreate(true)}
              >
                + Create Section
              </button>
            </div>

            {showCreate && (
              <form className="create-section" onSubmit={createSection}>
                <label>
                  Section name

                  <input
                    value={sectionName}
                    onChange={(e) => setSectionName(e.target.value)}
                    placeholder="e.g. Commodities"
                  />
                </label>

                <label>
                  Hierarchy type

                  <select
                    value={hierarchyType}
                    onChange={(e) => setHierarchyType(e.target.value)}
                  >
                    <option value="market">Market</option>
                    <option value="general">General</option>
                    <option value="education">Education</option>
                  </select>
                </label>

                <label>
                  Description
                  <input
                    value={sectionDescription}
                    onChange={(e) => setSectionDescription(e.target.value)}
                    placeholder="Optional section description"
                  />
                </label>

                {hierarchyType === "market" && (
                  <div className="segmentation-preview">
                    <strong>Enforced segmentation</strong>
                    <span>[x] Day</span>
                    <span>[x] Week</span>
                    <span>[x] Month</span>
                    <span>[x] Year</span>
                  </div>
                )}

                <div className="form-actions">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                  >
                    Cancel
                  </button>

                  <button
                    className="primary-button"
                    type="submit"
                    disabled={creatingSection}
                  >
                    {creatingSection ? "Creating..." : "Create"}
                  </button>
                </div>
              </form>
            )}

            {directoryError && (
              <div className="invite-message invite-message-error">
                {directoryError}
              </div>
            )}

            {directoryMessage && (
              <div className="invite-message">{directoryMessage}</div>
            )}

            {directoryLoading ? (
              <div className="market-directory-state">
                Loading live DWMY directory...
              </div>
            ) : (
              <div className="hierarchy-list">
                {sections.map((section) => (
                  <section className="hierarchy-card" key={section.id}>
                    <div className="hierarchy-heading">
                      <div>
                        <span className="type-label">
                          {section.section_type}
                        </span>
                        <h2>{section.name}</h2>
                        <small>
                          {section.is_active ? "ACTIVE" : "INACTIVE"}
                        </small>
                      </div>

                      <button onClick={() => toggleSectionActive(section)}>
                        {section.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </div>

                    {section.description && <p>{section.description}</p>}

                    {section.section_type === "MARKET" ? (
                      <>
                        <div className="segmentation-line">
                          DAY / WEEK / MONTH / YEAR
                        </div>

                        {(section.instruments || []).map((instrument) => (
                          <div
                            className="hierarchy-child"
                            key={instrument.id}
                          >
                            <span>
                              <strong>{instrument.symbol}</strong>
                              <span>{instrument.name}</span>
                            </span>

                            <button
                              onClick={() => toggleInstrumentActive(instrument)}
                            >
                              {instrument.is_active ? "Deactivate" : "Activate"}
                            </button>
                          </div>
                        ))}

                        {addingInstrumentTo === section.id ? (
                          <form
                            className="create-section"
                            onSubmit={(e) => createInstrument(e, section)}
                          >
                            <label>
                              Symbol
                              <input
                                value={instrumentSymbol}
                                onChange={(e) =>
                                  setInstrumentSymbol(e.target.value)
                                }
                                placeholder="e.g. XAU/USD"
                              />
                            </label>

                            <label>
                              Name
                              <input
                                value={instrumentName}
                                onChange={(e) =>
                                  setInstrumentName(e.target.value)
                                }
                                placeholder="e.g. Gold / U.S. Dollar"
                              />
                            </label>

                            <label>
                              Description
                              <input
                                value={instrumentDescription}
                                onChange={(e) =>
                                  setInstrumentDescription(e.target.value)
                                }
                                placeholder="Optional"
                              />
                            </label>

                            <div className="form-actions">
                              <button
                                type="button"
                                onClick={() => {
                                  setAddingInstrumentTo(null);
                                  setInstrumentSymbol("");
                                  setInstrumentName("");
                                  setInstrumentDescription("");
                                }}
                              >
                                Cancel
                              </button>

                              <button
                                className="primary-button"
                                type="submit"
                                disabled={creatingInstrument}
                              >
                                {creatingInstrument
                                  ? "Adding..."
                                  : "Add Instrument"}
                              </button>
                            </div>
                          </form>
                        ) : (
                          <button
                            className="add-child"
                            onClick={() => {
                              setAddingInstrumentTo(section.id);
                              setInstrumentSymbol("");
                              setInstrumentName("");
                              setInstrumentDescription("");
                            }}
                          >
                            + Add instrument
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="segmentation-line">
                        {section.section_type === "EDUCATION"
                          ? "EDUCATION HIERARCHY RESERVED"
                          : "GENERAL HIERARCHY"}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "moderation" && (
          <>
            <div className="admin-title moderation-admin-title">
              <div><span className="eyebrow">Operations</span><h1>Moderation Queue</h1><p>Reports become case files. Claim, investigate, coordinate, decide, and preserve the record.</p></div>
              <button className="primary-button" onClick={() => loadModerationQueue(moderationStatus)} disabled={moderationLoading}>{moderationLoading ? "Refreshing..." : "Refresh Queue"}</button>
            </div>

            <div className="moderation-queue-filters">
              {["OPEN", "CLAIMED", "INVESTIGATING", "PENDING_APPROVAL", "ACTIONED", "RESOLVED", "DISMISSED", "ALL"].map((status) => (
                <button type="button" key={status} className={moderationStatus === status ? "active" : ""} onClick={() => { setModerationStatus(status); setSelectedIncident(null); setSubjectContext(null); }}>{status.replaceAll("_", " ")}</button>
              ))}
            </div>
            {moderationError && <div className="invite-message invite-message-error">{moderationError}</div>}

            <div className="moderation-operations-grid moderation-operations-grid-v12">
              <section className="admin-panel moderation-queue-panel">
                <div className="moderation-panel-heading"><div><h2>{moderationStatus === "ALL" ? "All Incidents" : `${moderationStatus.replaceAll("_", " ")} Queue`}</h2><p>{moderationQueue.length} incident{moderationQueue.length === 1 ? "" : "s"}</p></div></div>
                {moderationLoading && moderationQueue.length === 0 ? <div className="moderation-empty">Loading moderation queue...</div> : moderationQueue.length === 0 ? (
                  <div className="moderation-empty"><strong>Queue clear.</strong><span>No incidents match this state.</span></div>
                ) : <div className="moderation-incident-list">{moderationQueue.map((incident) => (
                  <article key={incident.incident_id} className={`moderation-incident-card ${selectedIncident?.incident?.id === incident.incident_id ? "selected" : ""}`}>
                    <div className="moderation-incident-topline"><strong>{incident.incident_ref}</strong><span className={`moderation-priority priority-${String(incident.priority).toLowerCase()}`}>{incident.priority}</span></div>
                    <h3>{incident.reason_name || incident.title || "Moderation incident"}</h3>
                    <p>{incident.subject_username ? `@${incident.subject_username}` : "Unknown member"}{incident.subject_post_ref ? ` · ${incident.subject_post_ref}` : ""}</p>
                    {incident.summary && <p className="moderation-incident-summary">{incident.summary}</p>}
                    <div className="moderation-incident-meta"><span>{incident.status.replaceAll("_", " ")}</span><span>{formatDate(incident.created_at)}</span></div>
                    <button type="button" onClick={() => { setSubjectContext(null); openModerationIncident(incident.incident_id); }}>Open Case</button>
                  </article>
                ))}</div>}
              </section>

              <section className="admin-panel moderation-case-panel moderation-case-workspace">
                {incidentLoading ? <div className="moderation-empty">Opening case...</div> : !selectedIncident?.incident ? (
                  <div className="moderation-empty"><strong>Select an incident.</strong><span>The case workspace will open here.</span></div>
                ) : <>
                  <div className="moderation-case-header-v12">
                    <div><span className="eyebrow">{selectedIncident.incident.public_ref}</span><h2>{selectedIncident.incident.primary_reason?.name || selectedIncident.incident.title}</h2><p>{selectedIncident.incident.subject_user ? `@${selectedIncident.incident.subject_user.username} · ` : ""}{selectedIncident.incident.priority} priority</p></div>
                    <span className={`moderation-current-status status-${selectedIncident.incident.status.toLowerCase()}`}>{selectedIncident.incident.status.replaceAll("_", " ")}</span>
                  </div>

                  <div className="moderation-stage-rail">
                    {moderationStages.map((stage, index) => { const currentIndex = moderationStages.indexOf(selectedIncident.incident.status); const terminalDismissed = selectedIncident.incident.status === "DISMISSED"; return <div key={stage} className={`moderation-stage ${!terminalDismissed && index < currentIndex ? "complete" : ""} ${!terminalDismissed && index === currentIndex ? "current" : ""}`}><span>{index + 1}</span><small>{stage.replaceAll("_", " ")}</small></div>; })}
                  </div>

                  {!['RESOLVED','DISMISSED'].includes(selectedIncident.incident.status) && <div className="moderation-guided-action">
                    <div><strong>{selectedIncident.incident.status === "OPEN" ? "Ready for ownership" : selectedIncident.incident.status === "CLAIMED" ? "Ready to investigate" : selectedIncident.incident.status === "INVESTIGATING" ? "Investigation in progress" : selectedIncident.incident.status === "PENDING_APPROVAL" ? "Decision checkpoint" : "Action recorded"}</strong><span>{selectedIncident.incident.status === "INVESTIGATING" ? "Use the investigation tools and moderator notes before advancing." : "The case will preserve everything already collected as it advances."}</span></div>
                    <button className="primary-button" onClick={continueModerationIncident} disabled={incidentActionLoading}>{incidentActionLoading ? "Updating..." : selectedIncident.incident.status === "OPEN" ? "Claim Case →" : selectedIncident.incident.status === "CLAIMED" ? "Begin Investigation →" : selectedIncident.incident.status === "INVESTIGATING" ? "Send to Decision →" : selectedIncident.incident.status === "PENDING_APPROVAL" ? "Mark Actioned →" : "Resolve Case →"}</button>
                  </div>}

                  <div className="moderation-case-section"><h3>Reported Content</h3>
                    {selectedIncident.incident.subject_user && <p><strong>Member:</strong> @{selectedIncident.incident.subject_user.username}</p>}
                    {selectedIncident.incident.subject_post && <div className="moderation-evidence-box"><strong>{selectedIncident.incident.subject_post.public_ref}</strong><p>{selectedIncident.incident.subject_post.body || "[No text body]"}</p></div>}
                    {selectedIncident.incident.subject_discussion && <p><strong>Discussion:</strong> {selectedIncident.incident.subject_discussion.title || `#${selectedIncident.incident.subject_discussion.id}`}</p>}
                  </div>

                  <div className="moderation-case-section"><h3>Reports</h3>{(selectedIncident.reports || []).map((report) => <div className="moderation-report-record" key={report.id}><div><strong>@{report.reporter_username || "unknown"}</strong><span>{report.reason_name}</span></div><p>{report.details || "No additional details supplied."}</p><small>{formatDate(report.created_at)}</small></div>)}</div>

                  <div className="moderation-case-section moderation-investigation-section">
                    <div className="moderation-section-heading"><div><h3>Investigation</h3><p>Load context only when it is useful to the case.</p></div></div>
                    <div className="moderation-investigation-tools">
                      {[['recent_posts','Recent User Posts'],['discussion_context','Discussion Context'],['prior_incidents','Prior Incidents'],['prior_reports','Prior Reports'],['actions','Action History'],['restrictions','Restrictions']].map(([key,label]) => <button key={key} className={contextView===key && subjectContext ? 'active' : ''} onClick={() => loadSubjectContext(key)} disabled={contextLoading}>{label}</button>)}
                    </div>
                    {contextLoading ? <div className="moderation-context-state">Loading investigation context...</div> : subjectContext ? <div className="moderation-context-results">
                      {(subjectContext[contextView] || []).length === 0 ? <div className="moderation-context-state">No records found.</div> : (subjectContext[contextView] || []).map((item, index) => <article key={item.id || index}>
                        <div><strong>{item.public_ref || item.action_type || item.restriction_type || item.reason_name || item.username || `Record ${index+1}`}</strong><span>{formatDate(item.created_at || item.starts_at)}</span></div>
                        {item.username && <small>@{item.username}</small>}{item.status && <small>{item.status.replaceAll('_',' ')}</small>}
                        <p>{item.body || item.details || item.resolution || item.reason_text || item.discussion_title || item.capability || "No additional detail."}</p>
                      </article>)}
                    </div> : <div className="moderation-context-state">Choose a context view to begin.</div>}
                  </div>

                  <div className="moderation-case-section moderation-enforcement-section">
                    <div className="moderation-section-heading"><div><h3>Enforcement</h3><p>Execute a case-bound action. Billing and subscription state are intentionally unaffected.</p></div></div>
                    <div className="moderation-enforcement-grid">
                      <label><span>Action</span><select value={enforcementType} onChange={(e)=>setEnforcementType(e.target.value)}>
                        <option value="WARNING">Warning</option>
                        {selectedIncident.incident.subject_post && <><option value="POST_REMOVE">Remove Post</option><option value="POST_RESTORE">Restore Post</option></>}
                        {selectedIncident.incident.subject_discussion && <><option value="DISCUSSION_LOCK">Lock Discussion</option><option value="DISCUSSION_UNLOCK">Unlock Discussion</option></>}
                        {selectedIncident.incident.subject_user && <><option value="MUTE">Mute Participation</option><option value="SUSPEND">Suspend Participation</option></>}
                      </select></label>
                      {(enforcementType === "MUTE" || enforcementType === "SUSPEND") && <>
                        <label><span>Scope</span><select value={enforcementScope} onChange={(e)=>setEnforcementScope(e.target.value)}><option value="PLATFORM">Platform</option>{selectedIncident.incident.subject_discussion?.instrument_id && <option value="MARKET">This Market</option>}</select></label>
                        <label><span>Duration</span><select value={enforcementDuration} onChange={(e)=>setEnforcementDuration(e.target.value)}><option value="1">1 hour</option><option value="6">6 hours</option><option value="24">24 hours</option><option value="72">3 days</option><option value="168">7 days</option><option value="720">30 days</option></select></label>
                      </>}
                      <label className="moderation-enforcement-reason"><span>Moderator reason</span><textarea value={enforcementReason} onChange={(e)=>setEnforcementReason(e.target.value)} maxLength={4000} placeholder="Optional internal reason attached to the action ledger..." /></label>
                    </div>
                    <div className="moderation-enforcement-preview"><strong>{enforcementType.replaceAll("_", " ")}</strong><span>{(enforcementType === "MUTE" || enforcementType === "SUSPEND") ? `${enforcementScope} · ${enforcementDuration} hours · posting/reply participation blocked` : "Case-bound audited action"}</span><span>Subscription / billing: unchanged</span></div>
                    <button className="primary-button moderation-execute-button" onClick={executeModerationEnforcement} disabled={enforcementSaving || ['RESOLVED','DISMISSED'].includes(selectedIncident.incident.status)}>{enforcementSaving ? "Executing..." : "Execute Enforcement"}</button>

                    {(selectedIncident.restrictions || []).length > 0 && <div className="moderation-active-restrictions"><h4>Restrictions</h4>{selectedIncident.restrictions.map((restriction)=><article key={restriction.id}><div><strong>{restriction.restriction_type}</strong><span>{restriction.scope_type}{restriction.capability ? ` · ${restriction.capability}` : ""}</span></div><small>{restriction.revoked_at ? `Revoked ${formatDate(restriction.revoked_at)}` : restriction.expires_at ? `Expires ${formatDate(restriction.expires_at)}` : "Active until revoked"}</small>{!restriction.revoked_at && (!restriction.expires_at || new Date(restriction.expires_at) > new Date()) && <button type="button" onClick={()=>revokeModerationRestriction(restriction)} disabled={enforcementSaving}>Revoke</button>}</article>)}</div>}

                    {(selectedIncident.actions || []).length > 0 && <div className="moderation-action-ledger"><h4>Case Action Ledger</h4>{selectedIncident.actions.map((action)=><article key={action.id}><div><strong>{action.action_type.replaceAll("_", " ")}</strong><span>{formatDate(action.created_at)}</span></div><p>{action.reason_text || "No additional moderator reason."}</p></article>)}</div>}
                  </div>

                  <div className="moderation-case-actions moderation-terminal-actions">
                    {!['RESOLVED','DISMISSED'].includes(selectedIncident.incident.status) && <><button onClick={() => changeModerationStatus(selectedIncident.incident.id, "RESOLVED")} disabled={incidentActionLoading}>Resolve Without Further Action</button><button className="danger-button" onClick={() => changeModerationStatus(selectedIncident.incident.id, "DISMISSED")} disabled={incidentActionLoading}>Dismiss Case</button></>}
                  </div>
                </>}
              </section>

              <aside className="admin-panel moderation-notes-rail">
                {!selectedIncident?.incident ? <div className="moderation-empty"><strong>Moderator Notes</strong><span>Open a case to coordinate here.</span></div> : <>
                  <div className="moderation-notes-heading"><div><span className="eyebrow">Internal</span><h2>Moderator Notes</h2></div><span>{(selectedIncident.notes || []).length}</span></div>
                  <div className="moderation-notes-list">
                    {(selectedIncident.notes || []).length === 0 ? <div className="moderation-note-empty">No internal notes yet. Notes remain attached to the case through every stage.</div> : (selectedIncident.notes || []).map((note) => <article className="moderation-note" key={note.id}><div><strong>@{note.author_username || "moderator"}</strong><span>{formatDate(note.created_at)}</span></div><small>{note.note_type}</small><p>{note.body}</p></article>)}
                  </div>
                  <form className="moderation-note-compose" onSubmit={addModerationNote}><textarea value={moderationNote} onChange={(e)=>setModerationNote(e.target.value)} placeholder="Add a private note for other moderators..." maxLength={8000}/><div><span>{moderationNote.length}/8000</span><button className="primary-button" type="submit" disabled={noteSaving || !moderationNote.trim()}>{noteSaving ? "Adding..." : "Add Note"}</button></div></form>
                </>}
              </aside>
            </div>
          </>
        )}

        {tab === "permissions" && (
          <>
            <div className="admin-title">
              <div>
                <span className="eyebrow">Security Model</span>
                <h1>Permissions</h1>
              </div>
            </div>

            <section className="admin-panel permission-grid">
              <div>
                <h3>User</h3>
                <p>Read discussions</p>
                <p>Create and reply</p>
                <p>Edit own posts</p>
                <p>Upload images</p>
              </div>

              <div>
                <h3>Admin</h3>
                <p>All user permissions</p>
                <p>Edit/remove any post</p>
                <p>Manage users and roles</p>
                <p>Create/manage hierarchy</p>
                <p>Issue/revoke beta invitations</p>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}