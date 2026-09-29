import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const ACCENT_PRESETS = [
  { name: "DWMY Green", value: "#52d6a0" },
  { name: "Blue", value: "#5b9cff" },
  { name: "Purple", value: "#a978ff" },
  { name: "Red", value: "#ff6675" },
  { name: "Orange", value: "#ff9b52" },
];


function extensionFor(file) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export default function Settings({
  user,
  entitlements = [],
  appearance = { mode: "dark", accent: "#52d6a0" },
  onAppearanceChange,
  onProfileUpdated,
}) {
  const fileInputRef = useRef(null);

  const [bio, setBio] = useState(user.bio || "");
  const [signature, setSignature] = useState(user.signature || "");
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [appearanceMode, setAppearanceMode] = useState(appearance.mode || "dark");
  const [accentColor, setAccentColor] = useState(
    appearance.accent || "#52d6a0"
  );

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const [billing, setBilling] = useState(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingError, setBillingError] = useState("");
  const [openingBillingPortal, setOpeningBillingPortal] = useState(false);
  const [billingPortalError, setBillingPortalError] = useState("");



  useEffect(() => {
    setBio(user.bio || "");
    setSignature(user.signature || "");
  }, [user.bio, user.signature]);

  useEffect(() => {
    let alive = true;

    async function loadAvatar() {
      if (!user.avatar_path) {
        if (alive) setAvatarUrl(null);
        return;
      }

      const { data, error } = await supabase.storage
        .from("avatars")
        .createSignedUrl(user.avatar_path, 60 * 60);

      if (!alive) return;

      if (error) {
        console.error("Avatar load failed:", error);
        setAvatarUrl(null);
        return;
      }

      setAvatarUrl(data?.signedUrl || null);
    }

    loadAvatar();

    return () => {
      alive = false;
    };
  }, [user.avatar_path]);

  useEffect(() => {
    let alive = true;

    async function loadBilling() {
      setBillingLoading(true);
      setBillingError("");

      const { data, error } = await supabase.rpc("get_my_billing_status");

      if (!alive) return;

      if (error) {
        console.error("Billing status load failed:", error);
        setBilling(null);
        setBillingError(error.message || "Unable to load billing status.");
        setBillingLoading(false);
        return;
      }

      setBilling(Array.isArray(data) && data.length > 0 ? data[0] : null);
      setBillingLoading(false);
    }

    loadBilling();

    return () => {
      alive = false;
    };
  }, [user.id]);

  useEffect(() => {
    setAppearanceMode(appearance.mode || "dark");
    setAccentColor(appearance.accent || "#52d6a0");
  }, [appearance.mode, appearance.accent]);

  function changeAppearanceMode(mode) {
    setAppearanceMode(mode);
    onAppearanceChange?.({
      mode,
      accent: accentColor,
    });
  }

  function changeAccentColor(color) {
    setAccentColor(color);
    onAppearanceChange?.({
      mode: appearanceMode,
      accent: color,
    });
  }

  function resetAppearance() {
    setAppearanceMode("dark");
    setAccentColor("#52d6a0");
    onAppearanceChange?.({
      mode: "dark",
      accent: "#52d6a0",
    });
  }

  async function refreshIdentity() {
    if (onProfileUpdated) {
      await onProfileUpdated();
    }
  }

  async function saveProfile(event) {
    event.preventDefault();

    setProfileMessage("");
    setProfileError("");
    setSavingProfile(true);

    const cleanBio = bio.trim();
    const cleanSignature = signature.trim();

    const { error } = await supabase
      .from("profiles")
      .update({
        bio: cleanBio || null,
        signature: cleanSignature || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    setSavingProfile(false);

    if (error) {
      console.error("Profile save failed:", error);
      setProfileError(error.message || "Unable to save profile.");
      return;
    }

    setBio(cleanBio);
    setSignature(cleanSignature);
    await refreshIdentity();
    setProfileMessage("Profile saved.");
  }

  async function uploadAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setProfileMessage("");
    setProfileError("");

    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      setProfileError("Use a JPG, PNG, or WebP image.");
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setProfileError("Profile pictures must be 5 MB or smaller.");
      return;
    }

    setSavingProfile(true);

    const ext = extensionFor(file);
    const objectPath = `${user.id}/avatar-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(objectPath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) {
      console.error("Avatar upload failed:", uploadError);
      setSavingProfile(false);
      setProfileError(uploadError.message || "Unable to upload profile picture.");
      return;
    }

    const oldPath = user.avatar_path || null;

    const { error: profileUpdateError } = await supabase
      .from("profiles")
      .update({
        avatar_path: objectPath,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (profileUpdateError) {
      console.error("Avatar profile update failed:", profileUpdateError);
      await supabase.storage.from("avatars").remove([objectPath]);
      setSavingProfile(false);
      setProfileError(
        profileUpdateError.message || "Unable to save profile picture."
      );
      return;
    }

    if (oldPath && oldPath !== objectPath) {
      const { error: removeOldError } = await supabase.storage
        .from("avatars")
        .remove([oldPath]);

      if (removeOldError) {
        console.warn("Old avatar cleanup failed:", removeOldError);
      }
    }

    await refreshIdentity();
    setSavingProfile(false);
    setProfileMessage("Profile picture updated.");
  }

  async function removeAvatar() {
    if (!user.avatar_path || savingProfile) return;

    setProfileMessage("");
    setProfileError("");
    setSavingProfile(true);

    const oldPath = user.avatar_path;

    const { error: profileUpdateError } = await supabase
      .from("profiles")
      .update({
        avatar_path: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (profileUpdateError) {
      console.error("Avatar removal failed:", profileUpdateError);
      setSavingProfile(false);
      setProfileError(
        profileUpdateError.message || "Unable to remove profile picture."
      );
      return;
    }

    const { error: storageError } = await supabase.storage
      .from("avatars")
      .remove([oldPath]);

    if (storageError) {
      console.warn("Avatar file cleanup failed:", storageError);
    }

    setAvatarUrl(null);
    await refreshIdentity();
    setSavingProfile(false);
    setProfileMessage("Profile picture removed.");
  }

  async function changePassword(event) {
    event.preventDefault();

    setPasswordMessage("");
    setPasswordError("");

    if (newPassword.length < 8) {
      setPasswordError("Use at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("The passwords do not match.");
      return;
    }

    setSavingPassword(true);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setSavingPassword(false);

    if (error) {
      console.error("Password update failed:", error);
      setPasswordError(error.message || "Unable to change password.");
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setPasswordMessage("Password changed.");
  }

  async function openBillingPortal() {
    if (openingBillingPortal) return;

    setBillingPortalError("");
    setOpeningBillingPortal(true);

    const { data, error } = await supabase.functions.invoke(
      "create-billing-portal",
      {
        body: {
          return_url: window.location.href,
        },
      },
    );

    if (error) {
      console.error("Billing portal failed:", error);
      setBillingPortalError(
        error.message || "Unable to open billing management.",
      );
      setOpeningBillingPortal(false);
      return;
    }

    if (!data?.portal_url) {
      console.error("Billing portal returned no URL:", data);
      setBillingPortalError("Stripe did not return a billing portal URL.");
      setOpeningBillingPortal(false);
      return;
    }

    window.location.assign(data.portal_url);
  }

  const hasProEntitlements =
    entitlements.includes("CONVERSATIONS") &&
    entitlements.includes("LIVE_CHAT") &&
    entitlements.includes("MESSAGING");

  const billingStatus = billing?.subscription_status || null;
  const billingIsActive =
    billingStatus === "active" || billingStatus === "trialing";
  const currentPlan = billingIsActive && hasProEntitlements ? "DWMY PRO" : "DWMY Free";

  function formatBillingDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  const roleLabel =
    user.role === "admin"
      ? "ADMIN"
      : user.role === "moderator"
        ? "MODERATOR"
        : "MEMBER";

  return (
    <section className="settings-page">
      <div className="settings-heading">
        <span className="eyebrow">DWMY ACCOUNT</span>
        <h1>Settings</h1>
        <p>Manage your profile, security, and DWMY access.</p>
      </div>

      <section className="settings-card">
        <div className="settings-card-heading">
          <div>
            <span className="eyebrow">PROFILE</span>
            <h2>Your DWMY identity</h2>
          </div>
          <span className="settings-username">@{user.username}</span>
        </div>

        <div className="settings-avatar-row">
          <div className="settings-avatar">
            {avatarUrl ? (
              <img src={avatarUrl} alt={`${user.username} profile`} />
            ) : (
              <span>{user.username?.[0]?.toUpperCase() || "U"}</span>
            )}
          </div>

          <div className="settings-avatar-actions">
            <strong>Profile picture</strong>
            <span>JPG, PNG, or WebP. Maximum 5 MB.</span>

            <div>
              <button
                type="button"
                className="secondary-button"
                disabled={savingProfile}
                onClick={() => fileInputRef.current?.click()}
              >
                {avatarUrl ? "Change photo" : "Upload photo"}
              </button>

              {user.avatar_path && (
                <button
                  type="button"
                  className="settings-text-button"
                  disabled={savingProfile}
                  onClick={removeAvatar}
                >
                  Remove
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              className="settings-file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={uploadAvatar}
            />
          </div>
        </div>

        <form className="settings-form" onSubmit={saveProfile}>
          <label>
            <span>Username</span>
            <input value={`@${user.username}`} disabled />
            <small>Your DWMY username is fixed.</small>
          </label>

          <label>
            <span>Bio</span>
            <textarea
              value={bio}
              maxLength={500}
              rows={4}
              onChange={(event) => setBio(event.target.value)}
              placeholder="A little about you..."
            />
            <small>{bio.length} / 500</small>
          </label>

          <label>
            <span>Signature</span>
            <textarea
              value={signature}
              maxLength={200}
              rows={3}
              onChange={(event) => setSignature(event.target.value)}
              placeholder="A short signature for your DWMY profile."
            />
            <small>{signature.length} / 200</small>
          </label>

          {profileError && (
            <div className="settings-status error">{profileError}</div>
          )}
          {profileMessage && (
            <div className="settings-status success">{profileMessage}</div>
          )}

          <div className="settings-form-actions">
            <button className="primary-button" disabled={savingProfile}>
              {savingProfile ? "Saving..." : "Save profile"}
            </button>
          </div>
        </form>
      </section>

      <section className="settings-card appearance-settings-card">
        <div className="settings-card-heading">
          <div>
            <span className="eyebrow">APPEARANCE</span>
            <h2>Your DWMY theme</h2>
          </div>
          <span className="settings-appearance-summary">
            {appearanceMode === "light" ? "Light" : "Dark"} · {accentColor.toUpperCase()}
          </span>
        </div>

        <p className="settings-appearance-copy">
          Choose the base DWMY appearance, then apply your accent color on top.
          Preset and seasonal themes can override these choices later without
          replacing your saved personal appearance.
        </p>

        <div className="appearance-setting-group">
          <div className="appearance-setting-label">
            <strong>Base theme</strong>
            <span>Controls the background, panels, borders, and text.</span>
          </div>

          <div className="appearance-mode-grid">
            {["dark", "light"].map((mode) => (
              <button
                type="button"
                key={mode}
                className={`appearance-mode-card ${
                  appearanceMode === mode ? "active" : ""
                }`}
                onClick={() => changeAppearanceMode(mode)}
              >
                <span className={`appearance-mode-preview ${mode}`}>
                  <i />
                  <i />
                  <i />
                </span>
                <strong>{mode === "dark" ? "Dark" : "Light"}</strong>
              </button>
            ))}
          </div>
        </div>

        <div className="appearance-setting-group">
          <div className="appearance-setting-label">
            <strong>Accent color</strong>
            <span>
              Used for active controls, labels, highlights, and DWMY identity.
            </span>
          </div>

          <div className="appearance-accent-grid">
            {ACCENT_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.value}
                className={`appearance-accent-choice ${
                  accentColor.toLowerCase() === preset.value ? "active" : ""
                }`}
                onClick={() => changeAccentColor(preset.value)}
                title={preset.name}
              >
                <span
                  className="appearance-accent-swatch"
                  style={{ background: preset.value }}
                />
                <span>{preset.name}</span>
              </button>
            ))}

            <label className="appearance-accent-choice appearance-custom-color">
              <input
                type="color"
                value={accentColor}
                onChange={(event) => changeAccentColor(event.target.value)}
                aria-label="Choose custom accent color"
              />
              <span className="appearance-accent-swatch custom">
                <i style={{ background: accentColor }} />
              </span>
              <span>Custom</span>
            </label>
          </div>
        </div>

        <div className="appearance-settings-footer">
          <div>
            <span
              className="appearance-current-swatch"
              style={{ background: accentColor }}
            />
            <span>
              {appearanceMode === "light" ? "Light" : "Dark"} ·{" "}
              {accentColor.toUpperCase()}
            </span>
          </div>

          <button
            type="button"
            className="settings-text-button"
            onClick={resetAppearance}
          >
            Reset to DWMY default
          </button>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card-heading">
          <div>
            <span className="eyebrow">ACCOUNT & SECURITY</span>
            <h2>Sign-in</h2>
          </div>
        </div>

        <div className="settings-readonly-row">
          <span>Email</span>
          <strong>{user.email}</strong>
        </div>

        <form className="settings-form password-form" onSubmit={changePassword}>
          <label>
            <span>New password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="New password"
            />
          </label>

          <label>
            <span>Confirm new password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm new password"
            />
          </label>

          {passwordError && (
            <div className="settings-status error">{passwordError}</div>
          )}
          {passwordMessage && (
            <div className="settings-status success">{passwordMessage}</div>
          )}

          <div className="settings-form-actions">
            <button
              className="secondary-button"
              disabled={savingPassword || !newPassword || !confirmPassword}
            >
              {savingPassword ? "Changing..." : "Change password"}
            </button>
          </div>
        </form>
      </section>

      <section className="settings-card">
        <div className="settings-card-heading">
          <div>
            <span className="eyebrow">PLAN & BILLING</span>
            <h2>DWMY membership</h2>
          </div>
          <span className="settings-username">{currentPlan}</span>
        </div>

        {billingError && (
          <div className="settings-status error">{billingError}</div>
        )}

        <div className="settings-membership-grid">
          <div>
            <span>Current plan</span>
            <strong>{billingLoading ? "Loading..." : currentPlan}</strong>
          </div>
          <div>
            <span>Role</span>
            <strong>{roleLabel}</strong>
          </div>
          <div>
            <span>Markets</span>
            <strong>{entitlements.includes("MARKETS") ? "Included" : "Not available"}</strong>
          </div>
          <div>
            <span>PRO status</span>
            <strong>
              {billingLoading
                ? "Loading..."
                : billingIsActive
                  ? billingStatus === "trialing"
                    ? "Trialing"
                    : "Active"
                  : billingStatus === "canceled"
                    ? "Canceled"
                    : "Not subscribed"}
            </strong>
          </div>

          {billing && (
            <>
              <div>
                <span>Billing</span>
                <strong>
                  {billing.billing_period === "yearly"
                    ? "Yearly"
                    : billing.billing_period === "monthly"
                      ? "Monthly"
                      : "—"}
                </strong>
              </div>
              <div>
                <span>
                  {billingIsActive && billing.cancel_at_period_end
                    ? "Access until"
                    : billingIsActive
                      ? "Renews"
                      : "Last period ended"}
                </span>
                <strong>{formatBillingDate(billing.current_period_end)}</strong>
              </div>
            </>
          )}

          <div>
            <span>Entitlements</span>
            <strong>
              {entitlements.length > 0 ? entitlements.join(" · ") : "None"}
            </strong>
          </div>
          <div>
            <span>PRO includes</span>
            <strong>Conversations · Live Chat · Messaging</strong>
          </div>
        </div>

        {!billingLoading && !billingIsActive && (
          <p className="settings-appearance-copy">
            DWMY Free includes Markets. PRO adds Conversations, Live Chat, and Messaging.
          </p>
        )}

        {!billingLoading && billingIsActive && billing.cancel_at_period_end && (
          <div className="settings-status">
            Your PRO subscription is canceled and remains available through{" "}
            {formatBillingDate(billing.current_period_end)}.
          </div>
        )}

        {billingPortalError && (
          <div className="settings-status error">{billingPortalError}</div>
        )}

        {!billingLoading && billing && (
          <div className="settings-form-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={openingBillingPortal}
              onClick={openBillingPortal}
            >
              {openingBillingPortal ? "Opening Stripe..." : "Manage billing"}
            </button>
          </div>
        )}
      </section>
    </section>
  );
}
