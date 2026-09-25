import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function AccessGate({
  user,
  onAccessGranted,
  onLogout,
}) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] = useState("");

  async function redeem(event) {
    event.preventDefault();

    const clean = code.trim();

    if (!clean || submitting) return;

    setSubmitting(true);
    setError("");

    const { error: redeemError } =
      await supabase.rpc(
        "redeem_access_code",
        {
          submitted_code: clean,
        }
      );

    if (redeemError) {
      console.error(
        "Access code redemption failed:",
        redeemError
      );

      setError(redeemError.message);
      setSubmitting(false);
      return;
    }

    setCode("");
    setSubmitting(false);

    await onAccessGranted();
  }

  return (
    <div className="access-gate-page">
      <section className="access-gate-card">
        <div className="access-gate-brand">
          <strong>DWMY</strong>

          <span>a FRCTAL company</span>
        </div>

        <div className="access-gate-copy">
          <span className="eyebrow">
            PRIVATE BETA
          </span>

          <h1>Enter DWMY.</h1>

          <p>
            This account does not currently have
            access to the DWMY private beta.
          </p>
        </div>

        <form
          className="access-gate-form"
          onSubmit={redeem}
        >
          <label>
            Access code

            <input
              value={code}
              onChange={(event) =>
                setCode(event.target.value)
              }
              placeholder="Enter access code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={submitting}
              autoFocus
            />
          </label>

          {error && (
            <div className="access-gate-error">
              {error}
            </div>
          )}

          <button
            className="primary-button"
            type="submit"
            disabled={
              submitting || !code.trim()
            }
          >
            {submitting
              ? "Activating..."
              : "Activate Access"}
          </button>
        </form>

        <div className="access-gate-account">
          <span>
            Signed in as{" "}
            <strong>
              {user.display_name ||
                user.username ||
                user.email}
            </strong>
          </span>

          <button
            type="button"
            className="dwmy-text-button"
            onClick={onLogout}
          >
            Sign Out
          </button>
        </div>
      </section>
    </div>
  );
}