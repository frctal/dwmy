import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function joinLabel(policy) {
  if (policy === "OPEN") return "Open";
  if (policy === "APPROVAL") return "Approval required";
  return "Invite only";
}

function CommunityCard({
  community,
  membership,
  request,
  busy,
  onJoin,
  onOpen,
}) {
  const isMember = membership?.status === "ACTIVE";
  const pending = request?.status === "PENDING";

  return (
    <article className="community-card">
      <div className="community-card-top">
        <div className="community-mark">
          {community.name?.[0]?.toUpperCase() || "C"}
        </div>

        <div className="community-card-title">
          <span className="community-kicker">
            {community.discovery === "UNLISTED" ? "UNLISTED" : "COMMUNITY"}
          </span>
          <h3>{community.name}</h3>
          <small>/{community.slug}</small>
        </div>

        {membership?.role && (
          <span className={`community-role ${membership.role.toLowerCase()}`}>
            {membership.role}
          </span>
        )}
      </div>

      <p>
        {community.description?.trim() ||
          "No community description has been added yet."}
      </p>

      <div className="community-card-meta">
        <span>{joinLabel(community.join_policy)}</span>
        <span>{community.discovery === "LISTED" ? "Listed" : "Unlisted"}</span>
      </div>

      <div className="community-card-actions">
        {isMember ? (
          <button
            type="button"
            className="primary-button"
            onClick={() => onOpen(community)}
          >
            Open Community
          </button>
        ) : pending ? (
          <button type="button" className="community-secondary-button" disabled>
            Request Pending
          </button>
        ) : community.join_policy === "INVITE_ONLY" ? (
          <button type="button" className="community-secondary-button" disabled>
            Invite Only
          </button>
        ) : (
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => onJoin(community)}
          >
            {busy
              ? "Working..."
              : community.join_policy === "OPEN"
                ? "Join Community"
                : "Request to Join"}
          </button>
        )}
      </div>
    </article>
  );
}

export default function Communities({
  user,
  openDiscussion,
  returnContext,
  onReturnContextConsumed,
}) {
  const [tab, setTab] = useState("discover");
  const [communities, setCommunities] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [selectedCommunity, setSelectedCommunity] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [canManageStructure, setCanManageStructure] = useState(false);
  const [showStructureManager, setShowStructureManager] = useState(false);
  const [structureBusy, setStructureBusy] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    slug: "",
    description: "",
    parentId: "",
    sortOrder: 0,
  });
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [communityDiscussions, setCommunityDiscussions] = useState([]);
  const [discussionLoading, setDiscussionLoading] = useState(false);
  const [discussionCreating, setDiscussionCreating] = useState(false);
  const [discussionTitle, setDiscussionTitle] = useState("");
  const [showDiscussionCreate, setShowDiscussionCreate] = useState(false);
  const [canCreateDiscussion, setCanCreateDiscussion] = useState(false);
  const [restoringContext, setRestoringContext] = useState(false);
  const [communityView, setCommunityView] = useState("forum");
  const [communityMembers, setCommunityMembers] = useState([]);
  const [communityInvitations, setCommunityInvitations] = useState([]);
  const [communityJoinRequests, setCommunityJoinRequests] = useState([]);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [membershipBusy, setMembershipBusy] = useState(false);
  const [canManageMembers, setCanManageMembers] = useState(false);
  const [canRemoveMembers, setCanRemoveMembers] = useState(false);
  const [canInviteMembers, setCanInviteMembers] = useState(false);
  const [canManageJoinRequests, setCanManageJoinRequests] = useState(false);
  const [showInvitationHistory, setShowInvitationHistory] = useState(false);
  const [revokeInvitationBusyId, setRevokeInvitationBusyId] = useState(null);
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [myCommunityInvitations, setMyCommunityInvitations] = useState([]);
  const [invitationBusyId, setInvitationBusyId] = useState(null);

  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    discovery: "LISTED",
    joinPolicy: "APPROVAL",
  });

  useEffect(() => {
    loadDashboard();
  }, [user?.id]);

  useEffect(() => {
    if (
      !returnContext?.communityId ||
      !returnContext?.categoryId ||
      restoringContext
    ) {
      return;
    }

    restoreCommunityContext(returnContext);
  }, [returnContext, communities, memberships]);

  async function loadDashboard() {
    if (!user?.id) return;

    setLoading(true);
    setError("");

    const [communityResult, memberResult, requestResult, invitationResult] =
      await Promise.all([
        supabase
          .from("communities")
          .select(
            "id, owner_user_id, name, slug, description, discovery, join_policy, is_active, created_at"
          )
          .eq("is_active", true)
          .order("created_at", { ascending: false }),

        supabase
          .from("community_members")
          .select("community_id, user_id, role, status, joined_at")
          .eq("user_id", user.id)
          .eq("status", "ACTIVE"),

        supabase
          .from("community_join_requests")
          .select("id, community_id, user_id, status, created_at")
          .eq("user_id", user.id)
          .eq("status", "PENDING"),

        supabase
          .from("community_invitations")
          .select(
            "id, community_id, inviter_user_id, invitee_user_id, invitee_email, status, expires_at, created_at"
          )
          .eq("invitee_user_id", user.id)
          .eq("status", "PENDING")
          .order("created_at", { ascending: false }),
      ]);

    if (communityResult.error) {
      console.error("Community directory load failed:", communityResult.error);
      setError(communityResult.error.message);
    }

    if (memberResult.error) {
      console.error("Community membership load failed:", memberResult.error);
      setError((current) => current || memberResult.error.message);
    }

    if (requestResult.error) {
      console.error("Community join-request load failed:", requestResult.error);
      setError((current) => current || requestResult.error.message);
    }

    if (invitationResult.error) {
      console.error("Community invitation inbox load failed:", invitationResult.error);
      setError((current) => current || invitationResult.error.message);
    }

    const activeMembershipIds = new Set(
      (memberResult.data || []).map((membership) => membership.community_id)
    );

    setCommunities(communityResult.data || []);
    setMemberships(memberResult.data || []);
    setJoinRequests(requestResult.data || []);
    setMyCommunityInvitations(
      (invitationResult.data || []).filter(
        (invitation) => !activeMembershipIds.has(invitation.community_id)
      )
    );
    setLoading(false);
  }

  const membershipByCommunity = useMemo(
    () =>
      Object.fromEntries(
        memberships.map((membership) => [
          membership.community_id,
          membership,
        ])
      ),
    [memberships]
  );

  const requestByCommunity = useMemo(
    () =>
      Object.fromEntries(
        joinRequests.map((request) => [request.community_id, request])
      ),
    [joinRequests]
  );

  const myCommunities = useMemo(
    () =>
      communities.filter(
        (community) =>
          membershipByCommunity[community.id]?.status === "ACTIVE"
      ),
    [communities, membershipByCommunity]
  );

  const discoverCommunities = useMemo(
    () =>
      communities.filter(
        (community) => community.discovery === "LISTED"
      ),
    [communities]
  );

  async function restoreCommunityContext(context) {
    if (restoringContext) return;

    const community = communities.find(
      (candidate) => candidate.id === context.communityId
    );
    if (!community) return;

    setRestoringContext(true);
    await openCommunity(community);

    const loadedCategories = await loadCommunityCategories(community.id);
    const category = loadedCategories.find(
      (candidate) => candidate.id === context.categoryId
    );

    if (category?.is_active) {
      await openCategoryForCommunity(community, category);
    }

    onReturnContextConsumed?.();
    setRestoringContext(false);
  }

  async function joinCommunity(community) {
    setBusyId(community.id);
    setError("");
    setNotice("");

    const { data, error: joinError } = await supabase.rpc(
      "join_or_request_community",
      {
        target_community_id: community.id,
        request_message: null,
      }
    );

    if (joinError) {
      console.error("Community join failed:", joinError);
      setError(joinError.message);
      setBusyId(null);
      return;
    }

    const result = Array.isArray(data) ? data[0]?.result : data?.result;

    if (result === "JOINED" || result === "ALREADY_MEMBER") {
      setNotice(`You are now a member of ${community.name}.`);
    } else {
      setNotice(`Your request to join ${community.name} was submitted.`);
    }

    await loadDashboard();
    setBusyId(null);
  }

  async function respondToCommunityInvitation(invitation, response) {
    setInvitationBusyId(invitation.id);
    setError("");
    setNotice("");

    const { error: responseError } = await supabase.rpc(
      "respond_to_community_invitation",
      {
        target_invitation_id: invitation.id,
        response,
      }
    );

    if (responseError) {
      console.error("Community invitation response failed:", responseError);
      setError(responseError.message);
      setInvitationBusyId(null);
      return;
    }

    setNotice(
      response === "ACCEPT"
        ? "Community invitation accepted."
        : "Community invitation declined."
    );

    await loadDashboard();
    setInvitationBusyId(null);
  }

  async function loadCommunityCategories(communityId) {
    const { data, error: categoryError } = await supabase
      .from("community_categories")
      .select(
        "id, community_id, parent_category_id, name, slug, description, sort_order, is_active"
      )
      .eq("community_id", communityId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });

    if (categoryError) {
      console.error("Community categories load failed:", categoryError);
      setError(categoryError.message);
      setCategories([]);
      return [];
    }

    setCategories(data || []);
    return data || [];
  }

  async function openCommunity(community) {
    setSelectedCommunity(community);
    setCommunityLoading(true);
    setError("");
    setNotice("");
    setShowStructureManager(false);
    setCommunityView("forum");
    setEditingCategoryId(null);
    setSelectedCategory(null);
    setCommunityDiscussions([]);
    setDiscussionTitle("");

    const [, permissionResult, createDiscussionPermission, discussionResult] = await Promise.all([
      loadCommunityCategories(community.id),
      supabase.rpc("has_community_permission", {
        target_community_id: community.id,
        requested_permission: "MANAGE_STRUCTURE",
      }),
      supabase.rpc("has_community_permission", {
        target_community_id: community.id,
        requested_permission: "CREATE_DISCUSSION",
      }),
      supabase
        .from("discussions")
        .select(
          "id, discussion_type, community_id, community_category_id, title, created_by, is_locked, is_pinned, created_at, updated_at, last_activity_at, reply_count, is_deleted"
        )
        .eq("discussion_type", "COMMUNITY")
        .eq("community_id", community.id)
        .eq("is_deleted", false)
        .order("is_pinned", { ascending: false })
        .order("last_activity_at", { ascending: false }),
    ]);

    if (permissionResult.error) {
      console.error("Community permission load failed:", permissionResult.error);
      setCanManageStructure(false);
    } else {
      setCanManageStructure(Boolean(permissionResult.data));
    }

    if (createDiscussionPermission.error) {
      console.error(
        "Community discussion permission load failed:",
        createDiscussionPermission.error
      );
      setCanCreateDiscussion(false);
    } else {
      setCanCreateDiscussion(Boolean(createDiscussionPermission.data));
    }

    if (discussionResult.error) {
      console.error("Community conversations load failed:", discussionResult.error);
      setCommunityDiscussions([]);
    } else {
      setCommunityDiscussions(discussionResult.data || []);
    }

    setCommunityLoading(false);
    window.scrollTo(0, 0);
  }

  async function loadCommunityMembership(community = selectedCommunity) {
    if (!community) return;

    setMembershipLoading(true);
    setError("");

    const membership = membershipByCommunity[community.id];
    const mayReadInvitations =
      membership?.role === "OWNER" || membership?.role === "ADMIN";

    const [
      memberResult,
      manageRolesResult,
      manageSettingsResult,
      removeMembersResult,
      inviteMembersResult,
    ] = await Promise.all([
      supabase
        .from("community_members")
        .select("community_id, user_id, role, status, joined_at, updated_at")
        .eq("community_id", community.id)
        .eq("status", "ACTIVE")
        .order("joined_at", { ascending: true }),
      supabase.rpc("has_community_permission", {
        target_community_id: community.id,
        requested_permission: "MANAGE_MEMBER_ROLES",
      }),
      supabase.rpc("has_community_permission", {
        target_community_id: community.id,
        requested_permission: "MANAGE_SETTINGS",
      }),
      supabase.rpc("has_community_permission", {
        target_community_id: community.id,
        requested_permission: "REMOVE_MEMBER",
      }),
      supabase.rpc("has_community_permission", {
        target_community_id: community.id,
        requested_permission: "INVITE_MEMBER",
      }),
    ]);

    if (memberResult.error) {
      setError(memberResult.error.message);
      setCommunityMembers([]);
    } else {
      const rows = memberResult.data || [];
      const ids = rows.map((row) => row.user_id);
      let profileById = {};

      if (ids.length > 0) {
        const { data: profiles, error: profileError } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_path")
          .in("id", ids);

        if (profileError) {
          console.error("Community member profiles failed:", profileError);
        } else {
          profileById = Object.fromEntries(
            (profiles || []).map((profile) => [profile.id, profile])
          );
        }
      }

      setCommunityMembers(
        rows.map((row) => ({
          ...row,
          profile: profileById[row.user_id] || null,
        }))
      );
    }

    setCanManageMembers(
      !manageRolesResult.error && Boolean(manageRolesResult.data)
    );
    setCanManageJoinRequests(
      !manageSettingsResult.error && Boolean(manageSettingsResult.data)
    );
    setCanRemoveMembers(
      !removeMembersResult.error && Boolean(removeMembersResult.data)
    );
    setCanInviteMembers(
      !inviteMembersResult.error && Boolean(inviteMembersResult.data)
    );

    if (mayReadInvitations || (!inviteMembersResult.error && inviteMembersResult.data)) {
      const { data, error: invitationError } = await supabase
        .from("community_invitations")
        .select(
          "id, community_id, inviter_user_id, invitee_user_id, invitee_email, status, expires_at, responded_at, created_at"
        )
        .eq("community_id", community.id)
        .order("created_at", { ascending: false });

      if (invitationError) {
        console.error("Community invitations failed:", invitationError);
        setCommunityInvitations([]);
      } else {
        const rows = data || [];
        const inviteeIds = [...new Set(
          rows.map((row) => row.invitee_user_id).filter(Boolean)
        )];
        let profileById = {};

        if (inviteeIds.length > 0) {
          const { data: profiles, error: profileError } = await supabase
            .from("profiles")
            .select("id, username, display_name")
            .in("id", inviteeIds);

          if (profileError) {
            console.error("Community invitation profiles failed:", profileError);
          } else {
            profileById = Object.fromEntries(
              (profiles || []).map((profile) => [profile.id, profile])
            );
          }
        }

        setCommunityInvitations(
          rows.map((row) => ({
            ...row,
            inviteeProfile: row.invitee_user_id
              ? profileById[row.invitee_user_id] || null
              : null,
          }))
        );
      }
    } else {
      setCommunityInvitations([]);
    }

    if (!manageSettingsResult.error && manageSettingsResult.data) {
      const { data, error: requestError } = await supabase
        .from("community_join_requests")
        .select(
          "id, community_id, user_id, status, message, reviewed_by, created_at, responded_at"
        )
        .eq("community_id", community.id)
        .order("created_at", { ascending: false });

      if (requestError) {
        console.error("Community join requests failed:", requestError);
        setCommunityJoinRequests([]);
      } else {
        const rows = data || [];
        const ids = [...new Set(rows.map((row) => row.user_id))];
        let profileById = {};

        if (ids.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, username, display_name")
            .in("id", ids);

          profileById = Object.fromEntries(
            (profiles || []).map((profile) => [profile.id, profile])
          );
        }

        setCommunityJoinRequests(
          rows.map((row) => ({
            ...row,
            profile: profileById[row.user_id] || null,
          }))
        );
      }
    } else {
      setCommunityJoinRequests([]);
    }

    setMembershipLoading(false);
  }

  async function openMembers() {
    setCommunityView("members");
    setShowStructureManager(false);
    setNotice("");
    setError("");
    await loadCommunityMembership();
    window.scrollTo(0, 0);
  }

  async function inviteExistingUser(event) {
    event.preventDefault();
    if (!selectedCommunity) return;

    const username = inviteUsername.trim().replace(/^@/, "");
    if (!username) return;

    setMembershipBusy(true);
    setError("");
    setNotice("");

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .ilike("username", username)
      .maybeSingle();

    if (profileError || !profile) {
      setError(profileError?.message || `No DWMY user named @${username} was found.`);
      setMembershipBusy(false);
      return;
    }

    const { error: inviteError } = await supabase.rpc(
      "invite_community_user",
      {
        target_community_id: selectedCommunity.id,
        target_user_id: profile.id,
      }
    );

    if (inviteError) {
      setError(inviteError.message);
    } else {
      setInviteUsername("");
      setNotice(`Invitation sent to @${profile.username}.`);
      await loadCommunityMembership();
    }

    setMembershipBusy(false);
  }

  async function inviteByEmail(event) {
    event.preventDefault();
    if (!selectedCommunity) return;

    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;

    setMembershipBusy(true);
    setError("");
    setNotice("");

    const { error: inviteError } = await supabase.rpc(
      "invite_community_email",
      {
        target_community_id: selectedCommunity.id,
        target_email: email,
      }
    );

    if (inviteError) {
      setError(inviteError.message);
    } else {
      setInviteEmail("");
      setNotice(
        `Community invitation created for ${email}. DWMY registration and platform access remain separate requirements.`
      );
      await loadCommunityMembership();
    }

    setMembershipBusy(false);
  }

  async function revokeCommunityInvitation(invitation) {
    if (!selectedCommunity || !invitation?.id) return;

    setRevokeInvitationBusyId(invitation.id);
    setError("");
    setNotice("");

    const { error: revokeError } = await supabase.rpc(
      "revoke_community_invitation",
      { target_invitation_id: invitation.id }
    );

    if (revokeError) {
      setError(revokeError.message);
    } else {
      setNotice("Invitation revoked.");
      await loadCommunityMembership();
    }

    setRevokeInvitationBusyId(null);
  }

  async function reviewJoinRequest(request, decision) {
    setMembershipBusy(true);
    setError("");
    setNotice("");

    const { error: reviewError } = await supabase.rpc(
      "review_community_join_request",
      {
        target_join_request_id: request.id,
        decision,
      }
    );

    if (reviewError) {
      setError(reviewError.message);
    } else {
      setNotice(
        decision === "APPROVE"
          ? "Join request approved."
          : "Join request declined."
      );
      await loadCommunityMembership();
    }

    setMembershipBusy(false);
  }

  async function removeCommunityMember(member) {
    const memberName =
      member.profile?.display_name ||
      member.profile?.username ||
      "this member";

    if (!window.confirm(`Remove ${memberName} from this Community?`)) return;

    setMembershipBusy(true);
    setError("");
    setNotice("");

    const { error: removeError } = await supabase.rpc(
      "remove_community_member",
      {
        target_community_id: selectedCommunity.id,
        target_user_id: member.user_id,
      }
    );

    if (removeError) {
      setError(removeError.message);
    } else {
      setNotice(`${memberName} was removed from the Community.`);
      await loadDashboard();
      await loadCommunityMembership(selectedCommunity);
    }

    setMembershipBusy(false);
  }

  async function leaveCommunity() {
    const communityName = selectedCommunity?.name || "this Community";
    if (
      !window.confirm(
        `Leave ${communityName}? You will lose access to its member-only discussions until you join again.`
      )
    ) return;

    setMembershipBusy(true);
    setError("");
    setNotice("");

    const { error: leaveError } = await supabase.rpc("leave_community", {
      target_community_id: selectedCommunity.id,
    });

    if (leaveError) {
      setError(leaveError.message);
      setMembershipBusy(false);
      return;
    }

    setSelectedCommunity(null);
    setSelectedCategory(null);
    setCategories([]);
    setCommunityMembers([]);
    setCommunityInvitations([]);
    setCommunityJoinRequests([]);
    setCommunityView("forum");
    await loadDashboard();
    setNotice(`You left ${communityName}.`);
    setMembershipBusy(false);
    window.scrollTo(0, 0);
  }

  async function changeMemberRole(member, newRole) {
    if (!selectedCommunity || member.user_id === user?.id) return;

    setMembershipBusy(true);
    setError("");
    setNotice("");

    const { error: roleError } = await supabase.rpc(
      "set_community_member_role",
      {
        target_community_id: selectedCommunity.id,
        target_user_id: member.user_id,
        new_role: newRole,
      }
    );

    if (roleError) {
      setError(roleError.message);
    } else {
      setNotice("Community role updated.");
      await loadCommunityMembership();
    }

    setMembershipBusy(false);
  }

  function resetCategoryForm(parentId = "") {
    setEditingCategoryId(null);
    setCategoryForm({
      name: "",
      slug: "",
      description: "",
      parentId: parentId ? String(parentId) : "",
      sortOrder: 0,
    });
  }

  function startEditCategory(category) {
    setEditingCategoryId(category.id);
    setCategoryForm({
      name: category.name,
      slug: category.slug,
      description: category.description || "",
      parentId: category.parent_category_id
        ? String(category.parent_category_id)
        : "",
      sortOrder: category.sort_order || 0,
    });
    setShowStructureManager(true);
    window.scrollTo(0, 0);
  }

  async function saveCategory(event) {
    event.preventDefault();
    if (!selectedCommunity) return;

    const name = categoryForm.name.trim();
    const slug = slugify(categoryForm.slug || categoryForm.name);
    const parentId = categoryForm.parentId
      ? Number(categoryForm.parentId)
      : null;
    const sortOrder = Math.max(0, Number(categoryForm.sortOrder) || 0);

    if (!name || !slug) {
      setError("Category name and a valid slug are required.");
      return;
    }

    setStructureBusy(true);
    setError("");
    setNotice("");

    if (editingCategoryId) {
      const current = categories.find(
        (category) => category.id === editingCategoryId
      );

      const { error: updateError } = await supabase.rpc(
        "update_community_category",
        {
          target_category_id: editingCategoryId,
          category_name: name,
          category_slug: slug,
          category_description: categoryForm.description.trim() || null,
        }
      );

      if (updateError) {
        setError(updateError.message);
        setStructureBusy(false);
        return;
      }

      const oldParent = current?.parent_category_id ?? null;
      if (oldParent !== parentId) {
        const { error: moveError } = await supabase.rpc(
          "move_community_category",
          {
            target_category_id: editingCategoryId,
            target_parent_category_id: parentId,
          }
        );

        if (moveError) {
          setError(moveError.message);
          setStructureBusy(false);
          await loadCommunityCategories(selectedCommunity.id);
          return;
        }
      }

      if ((current?.sort_order || 0) !== sortOrder) {
        const { error: sortError } = await supabase.rpc(
          "set_community_category_sort_order",
          {
            target_category_id: editingCategoryId,
            new_sort_order: sortOrder,
          }
        );

        if (sortError) {
          setError(sortError.message);
          setStructureBusy(false);
          await loadCommunityCategories(selectedCommunity.id);
          return;
        }
      }

      setNotice(`${name} was updated.`);
    } else {
      const { error: createError } = await supabase.rpc(
        "create_community_category",
        {
          target_community_id: selectedCommunity.id,
          category_name: name,
          category_slug: slug,
          category_description: categoryForm.description.trim() || null,
          target_parent_category_id: parentId,
          category_sort_order: sortOrder,
        }
      );

      if (createError) {
        setError(createError.message);
        setStructureBusy(false);
        return;
      }

      setNotice(`${name} was created.`);
    }

    await loadCommunityCategories(selectedCommunity.id);
    resetCategoryForm();
    setStructureBusy(false);
  }

  async function archiveCategory(category) {
    if (!selectedCommunity) return;

    const action = category.is_active ? "archive" : "restore";
    if (
      category.is_active &&
      !window.confirm(
        `Archive "${category.name}"? Any nested subcategories will also be archived.`
      )
    ) {
      return;
    }

    setStructureBusy(true);
    setError("");
    setNotice("");

    const { error: activeError } = await supabase.rpc(
      "set_community_category_active",
      {
        target_category_id: category.id,
        active: !category.is_active,
      }
    );

    if (activeError) {
      setError(activeError.message);
    } else {
      setNotice(`${category.name} was ${action}d.`);
      await loadCommunityCategories(selectedCommunity.id);
    }

    setStructureBusy(false);
  }

  async function nudgeCategory(category, delta) {
    if (!selectedCommunity) return;

    const nextOrder = Math.max(0, (category.sort_order || 0) + delta);

    setStructureBusy(true);
    setError("");
    setNotice("");

    const { error: sortError } = await supabase.rpc(
      "set_community_category_sort_order",
      {
        target_category_id: category.id,
        new_sort_order: nextOrder,
      }
    );

    if (sortError) {
      setError(sortError.message);
    } else {
      await loadCommunityCategories(selectedCommunity.id);
    }

    setStructureBusy(false);
  }

  function categoryTrail(category) {
    if (!category) return [];

    const byId = Object.fromEntries(
      categories.map((candidate) => [candidate.id, candidate])
    );
    const trail = [];
    const seen = new Set();
    let current = category;

    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      trail.unshift(current);
      current = current.parent_category_id
        ? byId[current.parent_category_id]
        : null;
    }

    return trail;
  }

  async function openCategoryForCommunity(community, category) {
    if (!community || !category?.is_active) return;

    setSelectedCategory(category);
    setDiscussionLoading(true);
    setError("");
    setNotice("");
    setDiscussionTitle("");
    setShowDiscussionCreate(false);

    const { data, error: discussionError } = await supabase
      .from("discussions")
      .select(
        "id, discussion_type, community_id, community_category_id, title, created_by, is_locked, is_pinned, created_at, updated_at, last_activity_at, reply_count, is_deleted"
      )
      .eq("discussion_type", "COMMUNITY")
      .eq("community_id", community.id)
      .eq("community_category_id", category.id)
      .eq("is_deleted", false)
      .order("is_pinned", { ascending: false })
      .order("last_activity_at", { ascending: false });

    if (discussionError) {
      console.error("Community discussions load failed:", discussionError);
      setError(discussionError.message);
      setCommunityDiscussions([]);
    } else {
      setCommunityDiscussions(data || []);
    }

    setDiscussionLoading(false);
    window.scrollTo(0, 0);
  }

  async function openCategory(category) {
    return openCategoryForCommunity(selectedCommunity, category);
  }

  async function createCommunityDiscussion(event) {
    event.preventDefault();
    if (!selectedCommunity) return;

    const title = discussionTitle.trim();
    if (!title) {
      setError("Discussion title is required.");
      return;
    }

    setDiscussionCreating(true);
    setError("");
    setNotice("");

    const { error: createError } = await supabase.rpc(
      "create_community_discussion",
      {
        target_community_id: selectedCommunity.id,
        target_category_id: selectedCategory?.id ?? null,
        discussion_title: title,
      }
    );

    if (createError) {
      console.error("Community discussion creation failed:", createError);
      setError(createError.message);
      setDiscussionCreating(false);
      return;
    }

    setDiscussionTitle("");
    setShowDiscussionCreate(false);
    setNotice(`${title} was created.`);
    if (selectedCategory) {
      await openCategory(selectedCategory);
    } else {
      await openCommunity(selectedCommunity);
    }
    setNotice(`${title} was created.`);
    setDiscussionCreating(false);
  }

  async function createCommunity(event) {
    event.preventDefault();

    const name = form.name.trim();
    const slug = slugify(form.slug || form.name);

    if (!name || !slug) {
      setError("Community name and a valid slug are required.");
      return;
    }

    setCreating(true);
    setError("");
    setNotice("");

    const legacyVisibility =
      form.discovery === "LISTED" ? "PUBLIC" : "PRIVATE";

    const { data: communityId, error: createError } = await supabase.rpc(
      "create_community",
      {
        community_name: name,
        community_slug: slug,
        community_description: form.description.trim() || null,
        community_visibility: legacyVisibility,
        community_join_policy: form.joinPolicy,
      }
    );

    if (createError) {
      console.error("Community creation failed:", createError);
      setError(createError.message);
      setCreating(false);
      return;
    }

    const { error: settingsError } = await supabase.rpc(
      "set_community_membership_settings",
      {
        target_community_id: communityId,
        new_discovery: form.discovery,
        new_join_policy: form.joinPolicy,
      }
    );

    if (settingsError) {
      console.error("Community settings initialization failed:", settingsError);
      setError(
        `Community created, but its membership settings need attention: ${settingsError.message}`
      );
    } else {
      setNotice(`${name} was created.`);
    }

    setForm({
      name: "",
      slug: "",
      description: "",
      discovery: "LISTED",
      joinPolicy: "APPROVAL",
    });
    setShowCreate(false);

    await loadDashboard();
    setCreating(false);

    const { data: createdCommunity } = await supabase
      .from("communities")
      .select(
        "id, owner_user_id, name, slug, description, discovery, join_policy, is_active, created_at"
      )
      .eq("id", communityId)
      .maybeSingle();

    if (createdCommunity) {
      await openCommunity(createdCommunity);
    }
  }

  if (selectedCommunity && selectedCategory) {
    const trail = categoryTrail(selectedCategory);

    return (
      <section className="communities-page">
        <div className="community-breadcrumb">
          <button
            type="button"
            onClick={() => {
              setSelectedCommunity(null);
              setSelectedCategory(null);
              setCategories([]);
              setCommunityDiscussions([]);
              setCanManageStructure(false);
              setCanCreateDiscussion(false);
              window.scrollTo(0, 0);
            }}
          >
            Communities
          </button>
          <span>&gt;</span>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory(null);
              setCommunityDiscussions([]);
              setNotice("");
              setError("");
              window.scrollTo(0, 0);
            }}
          >
            {selectedCommunity.name}
          </button>

          {trail.map((category, index) => (
            <span key={category.id} style={{ display: "contents" }}>
              <span>&gt;</span>
              {index === trail.length - 1 ? (
                <span>{category.name}</span>
              ) : (
                <button type="button" onClick={() => openCategory(category)}>
                  {category.name}
                </button>
              )}
            </span>
          ))}
        </div>

        <div className="community-detail-hero">
          <div className="community-detail-mark">
            {selectedCategory.name?.[0]?.toUpperCase() || "C"}
          </div>
          <div>
            <span className="eyebrow">COMMUNITY CATEGORY</span>
            <h1>{selectedCategory.name}</h1>
            <p>{selectedCategory.description || "Community conversations"}</p>
            <div className="community-detail-meta">
              <span>{selectedCommunity.name}</span>
              <span>{communityDiscussions.length} active</span>
            </div>
          </div>
        </div>

        {notice && <div className="community-message success">{notice}</div>}
        {error && <div className="community-message error">{error}</div>}

        <section className="community-section community-conversations-section">
          <div className="community-section-heading community-conversations-heading">
            <div>
              <span className="eyebrow">{selectedCategory.name.toUpperCase()}</span>
              <h2>Conversations</h2>
              <p className="community-section-copy">
                Conversations filed under {selectedCategory.name} in {selectedCommunity.name}.
              </p>
            </div>
            <div className="community-heading-actions">
              <span className="community-result-count">{communityDiscussions.length} active</span>
              {canCreateDiscussion && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setShowDiscussionCreate((value) => !value);
                    setDiscussionTitle("");
                    setError("");
                  }}
                >
                  {showDiscussionCreate ? "Close" : "+ New Conversation"}
                </button>
              )}
            </div>
          </div>

          {canCreateDiscussion && showDiscussionCreate && (
            <form
              className="community-create-panel community-create-panel-compact"
              onSubmit={createCommunityDiscussion}
            >
              <div className="community-create-heading community-create-heading-compact">
                <div>
                  <span className="eyebrow">NEW CONVERSATION</span>
                  <h2>Start a Conversation</h2>
                </div>
                <span>{selectedCategory.name}</span>
              </div>

              <div className="community-form-grid community-form-grid-compact">
                <label className="community-form-wide">
                  <span>Title</span>
                  <input
                    autoFocus
                    value={discussionTitle}
                    maxLength={200}
                    onChange={(event) => setDiscussionTitle(event.target.value)}
                    placeholder="Conversation title"
                  />
                </label>
              </div>

              <div className="community-create-footer community-create-footer-compact">
                <small>Conversation in {selectedCategory.name}.</small>
                <div className="community-create-actions">
                  <button
                    type="button"
                    className="community-secondary-button"
                    onClick={() => {
                      setShowDiscussionCreate(false);
                      setDiscussionTitle("");
                      setError("");
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="primary-button" disabled={discussionCreating}>
                    {discussionCreating ? "Creating..." : "Create Conversation"}
                  </button>
                </div>
              </div>
            </form>
          )}

          {discussionLoading ? (
            <div className="community-empty">Loading conversations...</div>
          ) : communityDiscussions.length === 0 ? (
            <div className="community-empty">
              <strong>No conversations yet.</strong>
              <span>{canCreateDiscussion ? "Start the first conversation in this category." : "There are no conversations in this category yet."}</span>
            </div>
          ) : (
            <div className="community-conversation-list">
              {communityDiscussions.map((discussion) => (
                <button
                  type="button"
                  className="community-conversation-card"
                  key={discussion.id}
                  onClick={() =>
                    openDiscussion?.(
                      {
                        id: discussion.id,
                        discussionType: discussion.discussion_type,
                        sectionId: null,
                        section: selectedCommunity.name,
                        instrumentId: null,
                        instrument: discussion.title,
                        instrumentName: selectedCategory.name,
                        segmentType: null,
                        segmentStart: null,
                        segmentEnd: null,
                        communityId: discussion.community_id,
                        communityCategoryId: discussion.community_category_id,
                        title: discussion.title,
                        locked: discussion.is_locked || false,
                        replies: discussion.reply_count || 0,
                        lastActivityAt: discussion.last_activity_at,
                      },
                      { communityId: selectedCommunity.id, categoryId: selectedCategory.id }
                    )
                  }
                >
                  <div className="community-conversation-main">
                    <strong>{discussion.title}</strong>
                    <div className="community-conversation-context">
                      <span>COMMUNITY</span>
                      <span>{selectedCategory.name}</span>
                      {discussion.is_pinned && <span>PINNED</span>}
                      {discussion.is_locked && <span>LOCKED</span>}
                    </div>
                  </div>
                  <div className="community-conversation-stat">
                    <strong>{discussion.reply_count || 0}</strong>
                    <span>{discussion.reply_count === 1 ? "post" : "posts"}</span>
                  </div>
                  <div className="community-conversation-activity">
                    <strong>{discussion.is_locked ? "Locked" : "Active"}</strong>
                    <span>Open conversation →</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </section>
    );
  }

  if (selectedCommunity) {
    const membership = membershipByCommunity[selectedCommunity.id];
    const activeCategories = categories.filter((category) => category.is_active);
    const rootCategories = activeCategories.filter(
      (category) => category.parent_category_id == null
    );
    const archivedCategories = categories.filter(
      (category) => !category.is_active
    );

    const parentOptions = activeCategories.filter(
      (category) => category.id !== editingCategoryId
    );
    const canManageCommunity =
      membership?.role === "OWNER" ||
      membership?.role === "ADMIN" ||
      canManageStructure;

    return (
      <section className="communities-page">
        <div className="community-breadcrumb">
          <button
            type="button"
            onClick={() => {
              setSelectedCommunity(null);
              setSelectedCategory(null);
              setCategories([]);
              setCommunityDiscussions([]);
              setShowStructureManager(false);
              setCanManageStructure(false);
              setCanCreateDiscussion(false);
              window.scrollTo(0, 0);
            }}
          >
            Communities
          </button>
          <span>&gt;</span>
          <span>{selectedCommunity.name}</span>
        </div>

        <div className="community-detail-hero community-detail-hero-managed">
          <div className="community-detail-mark">
            {selectedCommunity.name?.[0]?.toUpperCase() || "C"}
          </div>

          <div className="community-detail-copy">
            <span className="eyebrow">DWMY COMMUNITY</span>
            <h1>{selectedCommunity.name}</h1>
            <p>
              {selectedCommunity.description ||
                "No community description has been added yet."}
            </p>
            <div className="community-detail-meta">
              <span>{membership?.role || "MEMBER"}</span>
              <span>{joinLabel(selectedCommunity.join_policy)}</span>
              <span>
                {selectedCommunity.discovery === "LISTED"
                  ? "Listed"
                  : "Unlisted"}
              </span>
            </div>
          </div>

          {canManageCommunity && (
            <button
              type="button"
              className="community-secondary-button community-manage-button"
              onClick={async () => {
                setShowStructureManager(false);
                if (communityView === "manage") {
                  setCommunityView("forum");
                } else {
                  setCommunityView("manage");
                  await loadCommunityMembership(selectedCommunity);
                  window.scrollTo(0, 0);
                }
              }}
            >
              {communityView === "manage" ? "Close Management" : "Manage Community"}
            </button>
          )}
        </div>

        {notice && <div className="community-message success">{notice}</div>}
        {error && <div className="community-message error">{error}</div>}

        {communityView === "manage" && (
          <section className="community-section community-management">
            <div className="community-section-heading">
              <div>
                <span className="eyebrow">COMMUNITY ADMIN</span>
                <h2>Manage Community</h2>
                <p className="community-section-copy">
                  Manage the people and structure behind {selectedCommunity.name}.
                </p>
              </div>
            </div>

            <div className="community-management-grid">
              <button
                type="button"
                className="community-management-card"
                onClick={openMembers}
              >
                <span className="eyebrow">MEMBERSHIP</span>
                <strong>Members & Invitations</strong>
                <p>Members, roles, invitations, and membership requests.</p>
                <span className="community-management-arrow">→</span>
              </button>

              {canManageStructure && (
                <button
                  type="button"
                  className="community-management-card"
                  onClick={() => {
                    resetCategoryForm();
                    setShowStructureManager(true);
                    setCommunityView("forum");
                    window.scrollTo(0, 0);
                  }}
                >
                  <span className="eyebrow">ORGANIZATION</span>
                  <strong>Conversation Structure</strong>
                  <p>Create, edit, order, archive, and restore conversation categories.</p>
                  <span className="community-management-arrow">→</span>
                </button>
              )}

              <div className="community-management-card community-management-card-future">
                <span className="eyebrow">COMING LATER</span>
                <strong>Community Settings</strong>
                <p>Branding, markets, live chat, moderation, and page layout will live here.</p>
              </div>
            </div>
          </section>
        )}

        {communityView === "members" && (
          <section className="community-section">
            <button
              type="button"
              className="community-inline-back"
              onClick={() => {
                setCommunityView("manage");
                window.scrollTo(0, 0);
              }}
            >
              ← Manage Community
            </button>
            <div className="community-section-heading">
              <div>
                <span className="eyebrow">COMMUNITY MEMBERSHIP</span>
                <h2>Members</h2>
              </div>
              <span className="community-result-count">
                {communityMembers.length} active
              </span>
            </div>

            {membershipLoading ? (
              <div className="community-empty">Loading members...</div>
            ) : (
              <>
                <div className="community-category-list">
                  {communityMembers.map((member) => {
                    const profile = member.profile;
                    const name =
                      profile?.display_name ||
                      (profile?.username ? `@${profile.username}` : member.user_id);

                    return (
                      <article
                        className="community-category"
                        key={`member-${member.user_id}`}
                      >
                        <div>
                          <strong>{name}</strong>
                          <p>
                            {profile?.username && profile?.display_name
                              ? `@${profile.username} · `
                              : ""}
                            {member.role} · joined{" "}
                            {new Date(member.joined_at).toLocaleDateString()}
                          </p>
                        </div>

                        <div className="community-card-actions">
                          {canManageMembers &&
                            member.role !== "OWNER" &&
                            member.user_id !== user?.id && (
                              <label>
                                <span>Community role</span>
                                <select
                                  value={member.role}
                                  disabled={membershipBusy}
                                  onChange={(event) =>
                                    changeMemberRole(member, event.target.value)
                                  }
                                >
                                  <option value="MEMBER">Member</option>
                                  <option value="MODERATOR">Moderator</option>
                                  <option value="ADMIN">Admin</option>
                                </select>
                              </label>
                            )}

                          {canRemoveMembers &&
                            member.role !== "OWNER" &&
                            member.user_id !== user?.id && (
                              <button
                                type="button"
                                className="community-secondary-button"
                                disabled={membershipBusy}
                                onClick={() => removeCommunityMember(member)}
                              >
                                Remove Member
                              </button>
                            )}
                        </div>
                      </article>
                    );
                  })}
                </div>

                {membership && membership.role !== "OWNER" && (
                  <section
                    className="community-create-panel"
                    style={{ marginTop: 22 }}
                  >
                    <div className="community-create-heading">
                      <div>
                        <span className="eyebrow">YOUR MEMBERSHIP</span>
                        <h2>Leave Community</h2>
                      </div>
                    </div>
                    <p>
                      Leaving ends your active membership. Your membership history
                      is preserved, and you can join again later if the Community
                      policy allows it.
                    </p>
                    <button
                      type="button"
                      className="community-secondary-button"
                      disabled={membershipBusy}
                      onClick={leaveCommunity}
                    >
                      Leave Community
                    </button>
                  </section>
                )}

                {(canInviteMembers ||
                  membership?.role === "OWNER" ||
                  membership?.role === "ADMIN") && (
                  <section className="community-create-panel" style={{ marginTop: 22 }}>
                    <div className="community-create-heading">
                      <div>
                        <span className="eyebrow">INVITATIONS</span>
                        <h2>Invite Members</h2>
                      </div>
                    </div>

                    {canInviteMembers && (
                      <>
                    <form onSubmit={inviteExistingUser}>
                      <div className="community-form-grid">
                        <label>
                          <span>Existing DWMY username</span>
                          <input
                            value={inviteUsername}
                            onChange={(event) =>
                              setInviteUsername(event.target.value)
                            }
                            placeholder="downtownscalps"
                          />
                        </label>
                      </div>
                      <div className="community-create-footer">
                        <small>
                          Invites an existing authenticated DWMY account.
                        </small>
                        <button
                          type="submit"
                          className="primary-button"
                          disabled={membershipBusy}
                        >
                          Invite User
                        </button>
                      </div>
                    </form>

                    <form onSubmit={inviteByEmail} style={{ marginTop: 18 }}>
                      <div className="community-form-grid">
                        <label>
                          <span>Email</span>
                          <input
                            type="email"
                            value={inviteEmail}
                            onChange={(event) => setInviteEmail(event.target.value)}
                            placeholder="person@example.com"
                          />
                        </label>
                      </div>
                      <div className="community-create-footer">
                        <small>
                          Community invitation only. It does not grant DWMY
                          registration, an access code, or platform entitlement.
                        </small>
                        <button
                          type="submit"
                          className="primary-button"
                          disabled={membershipBusy}
                        >
                          Create Email Invite
                        </button>
                      </div>
                    </form>
                      </>
                    )}

                    {communityInvitations.some(
                      (invitation) => invitation.status === "PENDING"
                    ) && (
                      <div style={{ marginTop: 22 }}>
                        <span className="eyebrow">OPEN INVITATIONS</span>
                        <div className="community-category-list">
                          {communityInvitations
                            .filter((invitation) => invitation.status === "PENDING")
                            .map((invitation) => (
                              <article
                                className="community-category"
                                key={`invite-${invitation.id}`}
                              >
                                <div>
                                  <strong>
                                    {invitation.invitee_email ||
                                      (invitation.inviteeProfile?.username
                                        ? `@${invitation.inviteeProfile.username}`
                                        : invitation.inviteeProfile?.display_name) ||
                                      "DWMY user"}
                                  </strong>
                                  <p>
                                    PENDING · expires{" "}
                                    {new Date(invitation.expires_at).toLocaleDateString()}
                                  </p>
                                </div>
                                {canInviteMembers && (
                                  <button
                                    type="button"
                                    className="community-secondary-button"
                                    disabled={revokeInvitationBusyId === invitation.id}
                                    onClick={() => revokeCommunityInvitation(invitation)}
                                  >
                                    {revokeInvitationBusyId === invitation.id
                                      ? "Revoking..."
                                      : "Revoke"}
                                  </button>
                                )}
                              </article>
                            ))}
                        </div>
                      </div>
                    )}

                    {(membership?.role === "OWNER" || membership?.role === "ADMIN") &&
                      communityInvitations.some(
                        (invitation) => invitation.status !== "PENDING"
                      ) && (
                        <div style={{ marginTop: 22 }}>
                          <button
                            type="button"
                            className="community-secondary-button"
                            onClick={() =>
                              setShowInvitationHistory((current) => !current)
                            }
                          >
                            {showInvitationHistory ? "▾" : "▸"} Invitation History ({
                              communityInvitations.filter(
                                (invitation) => invitation.status !== "PENDING"
                              ).length
                            })
                          </button>

                          {showInvitationHistory && (
                            <div className="community-category-list" style={{ marginTop: 12 }}>
                              {communityInvitations
                                .filter((invitation) => invitation.status !== "PENDING")
                                .map((invitation) => (
                                  <article
                                    className="community-category"
                                    key={`invite-history-${invitation.id}`}
                                  >
                                    <div>
                                      <strong>
                                        {invitation.invitee_email ||
                                          (invitation.inviteeProfile?.username
                                            ? `@${invitation.inviteeProfile.username}`
                                            : invitation.inviteeProfile?.display_name) ||
                                          "DWMY user"}
                                      </strong>
                                      <p>
                                        {invitation.status} ·{" "}
                                        {new Date(
                                          invitation.responded_at || invitation.created_at
                                        ).toLocaleDateString()}
                                      </p>
                                    </div>
                                  </article>
                                ))}
                            </div>
                          )}
                        </div>
                      )}
                  </section>
                )}

                {canManageJoinRequests && (
                  <section className="community-create-panel" style={{ marginTop: 22 }}>
                    <div className="community-create-heading">
                      <div>
                        <span className="eyebrow">JOIN REQUESTS</span>
                        <h2>Membership Requests</h2>
                      </div>
                      <span>
                        {
                          communityJoinRequests.filter(
                            (request) => request.status === "PENDING"
                          ).length
                        } pending
                      </span>
                    </div>

                    {communityJoinRequests.filter(
                      (request) => request.status === "PENDING"
                    ).length === 0 ? (
                      <div className="community-empty">
                        No pending join requests.
                      </div>
                    ) : (
                      <div className="community-category-list">
                        {communityJoinRequests
                          .filter((request) => request.status === "PENDING")
                          .map((request) => (
                            <article
                              className="community-category"
                              key={`request-${request.id}`}
                            >
                              <div>
                                <strong>
                                  {request.profile?.display_name ||
                                    (request.profile?.username
                                      ? `@${request.profile.username}`
                                      : request.user_id)}
                                </strong>
                                <p>
                                  {request.message || "No message supplied."}
                                </p>
                              </div>
                              <div className="community-card-actions">
                                <button
                                  type="button"
                                  className="primary-button"
                                  disabled={membershipBusy}
                                  onClick={() =>
                                    reviewJoinRequest(request, "APPROVE")
                                  }
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="community-secondary-button"
                                  disabled={membershipBusy}
                                  onClick={() =>
                                    reviewJoinRequest(request, "DECLINE")
                                  }
                                >
                                  Decline
                                </button>
                              </div>
                            </article>
                          ))}
                      </div>
                    )}
                  </section>
                )}
              </>
            )}
          </section>
        )}

        {communityView === "forum" && showStructureManager && canManageStructure && (
          <section className="community-create-panel">
            <button
              type="button"
              className="community-inline-back"
              onClick={() => {
                setShowStructureManager(false);
                setCommunityView("manage");
                window.scrollTo(0, 0);
              }}
            >
              ← Manage Community
            </button>
            <div className="community-create-heading">
              <div>
                <span className="eyebrow">COMMUNITY ADMIN</span>
                <h2>
                  {editingCategoryId ? "Edit Structure" : "Add to Structure"}
                </h2>
              </div>
              <span>Permission: MANAGE_STRUCTURE</span>
            </div>

            <form onSubmit={saveCategory}>
              <div className="community-form-grid">
                <label>
                  <span>Name</span>
                  <input
                    value={categoryForm.name}
                    maxLength={100}
                    onChange={(event) =>
                      setCategoryForm((current) => ({
                        ...current,
                        name: event.target.value,
                        slug:
                          current.slug === slugify(current.name) ||
                          current.slug === ""
                            ? slugify(event.target.value)
                            : current.slug,
                      }))
                    }
                    placeholder="Strategies"
                  />
                </label>

                <label>
                  <span>URL name</span>
                  <input
                    value={categoryForm.slug}
                    maxLength={80}
                    onChange={(event) =>
                      setCategoryForm((current) => ({
                        ...current,
                        slug: slugify(event.target.value),
                      }))
                    }
                    placeholder="strategies"
                  />
                </label>

                <label className="community-form-wide">
                  <span>Description</span>
                  <textarea
                    value={categoryForm.description}
                    onChange={(event) =>
                      setCategoryForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="What belongs in this section?"
                  />
                </label>

                <label>
                  <span>Parent</span>
                  <select
                    value={categoryForm.parentId}
                    onChange={(event) =>
                      setCategoryForm((current) => ({
                        ...current,
                        parentId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Root category</option>
                    {parentOptions.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Sort order</span>
                  <input
                    type="number"
                    min="0"
                    value={categoryForm.sortOrder}
                    onChange={(event) =>
                      setCategoryForm((current) => ({
                        ...current,
                        sortOrder: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <div className="community-create-footer">
                <small>
                  Root categories and nested subcategories use the same structure.
                </small>
                <div style={{ display: "flex", gap: 8 }}>
                  {editingCategoryId && (
                    <button
                      type="button"
                      className="community-secondary-button"
                      onClick={() => resetCategoryForm()}
                    >
                      Cancel Edit
                    </button>
                  )}
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={structureBusy}
                  >
                    {structureBusy
                      ? "Saving..."
                      : editingCategoryId
                        ? "Save Changes"
                        : "Create Category"}
                  </button>
                </div>
              </div>
            </form>

            {(categories.length > 0) && (
              <div style={{ marginTop: 22 }}>
                <div className="community-section-heading">
                  <div>
                    <span className="eyebrow">STRUCTURE MAP</span>
                    <h2>Manage Categories</h2>
                  </div>
                </div>

                <div className="community-category-list">
                  {categories.map((category) => {
                    const parent = categories.find(
                      (candidate) => candidate.id === category.parent_category_id
                    );

                    return (
                      <article
                        className="community-category"
                        key={`manage-${category.id}`}
                        style={{ opacity: category.is_active ? 1 : 0.55 }}
                      >
                        <div>
                          <strong>
                            {parent ? `${parent.name} > ` : ""}
                            {category.name}
                          </strong>
                          <p>
                            /{category.slug} · order {category.sort_order || 0}
                            {!category.is_active ? " · ARCHIVED" : ""}
                          </p>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 7,
                            marginTop: 12,
                          }}
                        >
                          {category.is_active && (
                            <>
                              <button
                                type="button"
                                className="community-secondary-button"
                                disabled={structureBusy}
                                onClick={() => startEditCategory(category)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="community-secondary-button"
                                disabled={structureBusy}
                                onClick={() => {
                                  resetCategoryForm(category.id);
                                  setShowStructureManager(true);
                                }}
                              >
                                + Subcategory
                              </button>
                              <button
                                type="button"
                                className="community-secondary-button"
                                disabled={structureBusy}
                                onClick={() => nudgeCategory(category, -10)}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="community-secondary-button"
                                disabled={structureBusy}
                                onClick={() => nudgeCategory(category, 10)}
                              >
                                ↓
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            className="community-secondary-button"
                            disabled={structureBusy}
                            onClick={() => archiveCategory(category)}
                          >
                            {category.is_active ? "Archive" : "Restore"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {communityView === "forum" && (
          <>
            {activeCategories.length > 0 ? (
              <section className="community-section community-browse-section">
                <div className="community-section-heading">
                  <div>
                    <span className="eyebrow">BROWSE</span>
                    <h2>Conversation Categories</h2>
                    <p className="community-section-copy">
                      Choose a category to browse and start conversations.
                    </p>
                  </div>
                  {canManageStructure && (
                    <span className="community-result-count">
                      {activeCategories.length} active
                      {archivedCategories.length > 0
                        ? ` · ${archivedCategories.length} archived`
                        : ""}
                    </span>
                  )}
                </div>

                <div className="community-navigation-grid">
                  {rootCategories.map((category) => {
                    const children = activeCategories.filter(
                      (candidate) => candidate.parent_category_id === category.id
                    );

                    return (
                      <article className="community-navigation-card" key={category.id}>
                        <button
                          type="button"
                          className="community-navigation-primary"
                          onClick={() => openCategory(category)}
                        >
                          <div>
                            <span className="community-navigation-kicker">CATEGORY</span>
                            <strong>{category.name}</strong>
                            <p>{category.description || "Community conversations"}</p>
                          </div>
                          <span className="community-navigation-arrow">→</span>
                        </button>

                        {children.length > 0 && (
                          <div className="community-navigation-children">
                            {children.map((child) => (
                              <button
                                type="button"
                                key={child.id}
                                onClick={() => openCategory(child)}
                              >
                                <div>
                                  <span>SUBCATEGORY</span>
                                  <strong>{child.name}</strong>
                                </div>
                                <span>→</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : (
              <section className="community-section community-conversations-section">
                <div className="community-section-heading community-conversations-heading">
                  <div>
                    <span className="eyebrow">COMMUNITY CONVERSATIONS</span>
                    <h2>Conversations</h2>
                    <p className="community-section-copy">
                      Conversations inside {selectedCommunity.name}.
                    </p>
                  </div>
                  <div className="community-heading-actions">
                    <span className="community-result-count">
                      {communityDiscussions.filter((discussion) => discussion.community_category_id == null).length} active
                    </span>
                    {canCreateDiscussion && (
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => {
                          setShowDiscussionCreate((value) => !value);
                          setDiscussionTitle("");
                          setError("");
                        }}
                      >
                        {showDiscussionCreate ? "Close" : "+ New Conversation"}
                      </button>
                    )}
                  </div>
                </div>

                {canCreateDiscussion && showDiscussionCreate && (
                  <form
                    className="community-create-panel community-create-panel-compact"
                    onSubmit={createCommunityDiscussion}
                  >
                    <div className="community-create-heading community-create-heading-compact">
                      <div>
                        <span className="eyebrow">NEW CONVERSATION</span>
                        <h2>Start a Conversation</h2>
                      </div>
                    </div>
                    <div className="community-form-grid community-form-grid-compact">
                      <label className="community-form-wide">
                        <span>Title</span>
                        <input
                          autoFocus
                          value={discussionTitle}
                          maxLength={200}
                          onChange={(event) => setDiscussionTitle(event.target.value)}
                          placeholder="Conversation title"
                        />
                      </label>
                    </div>
                    <div className="community-create-footer community-create-footer-compact">
                      <small>Conversation in {selectedCommunity.name}.</small>
                      <div className="community-create-actions">
                        <button
                          type="button"
                          className="community-secondary-button"
                          onClick={() => {
                            setShowDiscussionCreate(false);
                            setDiscussionTitle("");
                            setError("");
                          }}
                        >
                          Cancel
                        </button>
                        <button type="submit" className="primary-button" disabled={discussionCreating}>
                          {discussionCreating ? "Creating..." : "Create Conversation"}
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {communityLoading ? (
                  <div className="community-empty">Loading conversations...</div>
                ) : communityDiscussions.filter((discussion) => discussion.community_category_id == null).length === 0 ? (
                  <div className="community-empty">
                    <strong>No conversations yet.</strong>
                    <span>{canCreateDiscussion ? "Start the first conversation in this Community." : "This Community does not have any conversations yet."}</span>
                  </div>
                ) : (
                  <div className="community-conversation-list">
                    {communityDiscussions
                      .filter((discussion) => discussion.community_category_id == null)
                      .map((discussion) => (
                        <button
                          type="button"
                          className="community-conversation-card"
                          key={discussion.id}
                          onClick={() =>
                            openDiscussion?.(
                              {
                                id: discussion.id,
                                discussionType: discussion.discussion_type,
                                sectionId: null,
                                section: selectedCommunity.name,
                                instrumentId: null,
                                instrument: discussion.title,
                                instrumentName: selectedCommunity.name,
                                segmentType: null,
                                segmentStart: null,
                                segmentEnd: null,
                                communityId: discussion.community_id,
                                communityCategoryId: null,
                                title: discussion.title,
                                locked: discussion.is_locked || false,
                                replies: discussion.reply_count || 0,
                                lastActivityAt: discussion.last_activity_at,
                              },
                              { communityId: selectedCommunity.id, categoryId: null }
                            )
                          }
                        >
                          <div className="community-conversation-main">
                            <strong>{discussion.title}</strong>
                            <div className="community-conversation-context">
                              <span>COMMUNITY</span>
                              {discussion.is_pinned && <span>PINNED</span>}
                              {discussion.is_locked && <span>LOCKED</span>}
                            </div>
                          </div>
                          <div className="community-conversation-stat">
                            <strong>{discussion.reply_count || 0}</strong>
                            <span>{discussion.reply_count === 1 ? "post" : "posts"}</span>
                          </div>
                          <div className="community-conversation-activity">
                            <strong>{discussion.is_locked ? "Locked" : "Active"}</strong>
                            <span>Open conversation →</span>
                          </div>
                        </button>
                      ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </section>
    );
  }

  const visibleCommunities =
    tab === "mine" ? myCommunities : discoverCommunities;

  return (
    <section className="communities-page">
      <div className="communities-hero">
        <div>
          <span className="eyebrow">DWMY COMMUNITIES</span>
          <h1>Communities</h1>
          <p>
            Member-run spaces inside DWMY. Discover listed Communities, join
            open groups, request access, or build a space around your own
            discussion structure.
          </p>
        </div>

        <button
          type="button"
          className="primary-button communities-create-button"
          onClick={() => setShowCreate((value) => !value)}
        >
          {showCreate ? "Close" : "Create Community"}
        </button>
      </div>

      <div className="communities-tabs">
        <button
          type="button"
          className={tab === "discover" ? "active" : ""}
          onClick={() => setTab("discover")}
        >
          Discover
        </button>
        <button
          type="button"
          className={tab === "mine" ? "active" : ""}
          onClick={() => setTab("mine")}
        >
          My Communities
          {myCommunities.length > 0 && (
            <span>{myCommunities.length}</span>
          )}
        </button>
      </div>

      {showCreate && (
        <form className="community-create-panel" onSubmit={createCommunity}>
          <div className="community-create-heading">
            <div>
              <span className="eyebrow">NEW COMMUNITY</span>
              <h2>Create a Community</h2>
            </div>
            <span>Membership-based from day one.</span>
          </div>

          <div className="community-form-grid">
            <label>
              <span>Name</span>
              <input
                value={form.name}
                maxLength={100}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                    slug:
                      current.slug === slugify(current.name) ||
                      current.slug === ""
                        ? slugify(event.target.value)
                        : current.slug,
                  }))
                }
                placeholder="FX Scalpers"
              />
            </label>

            <label>
              <span>URL name</span>
              <input
                value={form.slug}
                maxLength={80}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    slug: slugify(event.target.value),
                  }))
                }
                placeholder="fx-scalpers"
              />
            </label>

            <label className="community-form-wide">
              <span>Description</span>
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="What is this Community for?"
              />
            </label>

            <label>
              <span>Discovery</span>
              <select
                value={form.discovery}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    discovery: event.target.value,
                  }))
                }
              >
                <option value="LISTED">Listed</option>
                <option value="UNLISTED">Unlisted</option>
              </select>
            </label>

            <label>
              <span>Joining</span>
              <select
                value={form.joinPolicy}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    joinPolicy: event.target.value,
                  }))
                }
              >
                <option value="APPROVAL">Approval required</option>
                <option value="OPEN">Open</option>
                <option value="INVITE_ONLY">Invite only</option>
              </select>
            </label>
          </div>

          <div className="community-create-footer">
            <small>
              Payment, Pro access, referrals and paid membership are not tied
              to this Community.
            </small>
            <button
              type="submit"
              className="primary-button"
              disabled={creating}
            >
              {creating ? "Creating..." : "Create Community"}
            </button>
          </div>
        </form>
      )}

      {notice && <div className="community-message success">{notice}</div>}
      {error && <div className="community-message error">{error}</div>}

      {myCommunityInvitations.length > 0 && (
        <section className="community-create-panel">
          <div className="community-create-heading">
            <div>
              <span className="eyebrow">COMMUNITY INVITATIONS</span>
              <h2>Invited to Join</h2>
            </div>
            <span>{myCommunityInvitations.length} pending</span>
          </div>

          <div className="community-category-list">
            {myCommunityInvitations.map((invitation) => {
              const community = communities.find(
                (candidate) => candidate.id === invitation.community_id
              );

              return (
                <article
                  className="community-category"
                  key={`my-invitation-${invitation.id}`}
                >
                  <div>
                    <strong>
                      {community?.name || `Community #${invitation.community_id}`}
                    </strong>
                    <p>
                      Community invitation · expires{" "}
                      {new Date(invitation.expires_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="community-card-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={invitationBusyId === invitation.id}
                      onClick={() =>
                        respondToCommunityInvitation(invitation, "ACCEPT")
                      }
                    >
                      {invitationBusyId === invitation.id ? "Working..." : "Accept"}
                    </button>
                    <button
                      type="button"
                      className="community-secondary-button"
                      disabled={invitationBusyId === invitation.id}
                      onClick={() =>
                        respondToCommunityInvitation(invitation, "DECLINE")
                      }
                    >
                      Decline
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <div className="community-section-heading">
        <div>
          <span className="eyebrow">
            {tab === "mine" ? "YOUR SPACES" : "DIRECTORY"}
          </span>
          <h2>
            {tab === "mine" ? "My Communities" : "Discover Communities"}
          </h2>
        </div>

        <span className="community-result-count">
          {visibleCommunities.length}{" "}
          {visibleCommunities.length === 1 ? "Community" : "Communities"}
        </span>
      </div>

      {loading ? (
        <div className="community-empty">Loading Communities...</div>
      ) : visibleCommunities.length === 0 ? (
        <div className="community-empty">
          <strong>
            {tab === "mine"
              ? "You haven't joined a Community yet."
              : "No listed Communities yet."}
          </strong>
          <span>
            {tab === "mine"
              ? "Discover one or create your own."
              : "The directory will populate as Communities are listed."}
          </span>
        </div>
      ) : (
        <div className="community-grid">
          {visibleCommunities.map((community) => (
            <CommunityCard
              key={community.id}
              community={community}
              membership={membershipByCommunity[community.id]}
              request={requestByCommunity[community.id]}
              busy={busyId === community.id}
              onJoin={joinCommunity}
              onOpen={openCommunity}
            />
          ))}
        </div>
      )}
    </section>
  );
}
