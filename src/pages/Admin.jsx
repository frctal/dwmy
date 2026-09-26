import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

import { users as initialUsers } from "../data/mockData";

export default function Admin() {
  const [tab, setTab] = useState("dashboard");

  // Users/Roles remain on the existing prototype path for now.
  const [users, setUsers] = useState(initialUsers);

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

  function toggleRole(id) {
    setUsers(
      users.map((user) =>
        user.id === id
          ? {
              ...user,
              role: user.role === "admin" ? "user" : "admin",
            }
          : user
      )
    );
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

            <div className="admin-stats">
              <div>
                <strong>{users.length}</strong>
                <span>Users</span>
              </div>

              <div>
                <strong>{sections.length}</strong>
                <span>Sections</span>
              </div>

              <div>
                <strong>72</strong>
                <span>Discussions</span>
              </div>

              <div>
                <strong>0</strong>
                <span>Reports</span>
              </div>
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
              </div>
            </div>

            <section className="admin-panel">
              <div className="admin-table">
                <div className="admin-table-head">
                  <span>User</span>
                  <span>Role</span>
                  <span>Posts</span>
                  <span>Status</span>
                  <span>Action</span>
                </div>

                {users.map((user) => (
                  <div className="admin-table-row" key={user.id}>
                    <strong>{user.username}</strong>

                    <span className={`role-pill ${user.role}`}>
                      {user.role.toUpperCase()}
                    </span>

                    <span>{user.posts}</span>
                    <span>{user.status}</span>

                    <button onClick={() => toggleRole(user.id)}>
                      Make {user.role === "admin" ? "User" : "Admin"}
                    </button>
                  </div>
                ))}
              </div>
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