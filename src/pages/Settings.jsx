import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function extensionFor(file) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export default function Settings({
  user,
  entitlements = [],
  onProfileUpdated,
}) {
  const fileInputRef = useRef(null);

  const [displayName, setDisplayName] = useState(user.display_name || "");
  const [bio, setBio] = useState(user.bio || "");
  const [signature, setSignature] = useState(user.signature || "");
  const [avatarUrl, setAvatarUrl] = useState(null);

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    setDisplayName(user.display_name || "");
    setBio(user.bio || "");
    setSignature(user.signature || "");
  }, [user.display_name, user.bio, user.signature]);

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

    const cleanDisplayName = displayName.trim();
    const cleanBio = bio.trim();
    const cleanSignature = signature.trim();

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: cleanDisplayName || null,
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

    setDisplayName(cleanDisplayName);
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
            <span>Display name</span>
            <input
              value={displayName}
              maxLength={80}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Display name"
            />
            <small>{displayName.length} / 80</small>
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
            <span className="eyebrow">MEMBERSHIP</span>
            <h2>DWMY access</h2>
          </div>
        </div>

        <div className="settings-membership-grid">
          <div>
            <span>Access</span>
            <strong>
              {entitlements.length > 0 ? "Private Beta" : "No platform access"}
            </strong>
          </div>
          <div>
            <span>Role</span>
            <strong>{roleLabel}</strong>
          </div>
          <div>
            <span>Entitlements</span>
            <strong>
              {entitlements.length > 0
                ? entitlements.join(" · ")
                : "None"}
            </strong>
          </div>
          <div>
            <span>Subscription</span>
            <strong>Coming later</strong>
          </div>
        </div>
      </section>
    </section>
  );
}
