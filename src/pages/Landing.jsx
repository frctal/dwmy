import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Landing() {
  const [mode, setMode] = useState("landing");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [loginIdentity, setLoginIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function resetStatus() {
    setMessage("");
    setError("");
  }

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        resetStatus();
        setMode("recovery");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function resolveLoginEmail(identity) {
    const clean = identity.trim();

    if (clean.includes("@")) {
      return clean;
    }

    const { data, error: resolveError } = await supabase.rpc(
      "resolve_login_email",
      {
        submitted_username: clean,
      }
    );

    if (resolveError) throw resolveError;

    if (!data) {
      throw new Error("Invalid email/username or password.");
    }

    return data;
  }

  async function requestPasswordReset(event) {
    event.preventDefault();
    resetStatus();

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setError("Enter the email address for your DWMY account.");
      return;
    }

    setBusy(true);

    try {
      const redirectTo = `${window.location.origin}${window.location.pathname}`;

      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo,
        });

      if (resetError) throw resetError;

      setMessage(
        "If that email belongs to a DWMY account, a password reset link has been sent."
      );
    } catch (err) {
      setError(err.message || "Password reset request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function updateRecoveredPassword(event) {
    event.preventDefault();
    resetStatus();

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password updated. You can continue into DWMY.");
    } catch (err) {
      setError(err.message || "Password update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    resetStatus();
    setBusy(true);

    try {
      if (mode === "signup") {
        const cleanUsername = username.trim();

        const { data, error: signUpError } =
          await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
              data: {
                username: cleanUsername,
                display_name: cleanUsername,
              },
            },
          });

        if (signUpError) throw signUpError;

        if (data.session) {
          setMessage("Account created. Entering DWMY...");
        } else {
          setMessage(
            "Account created. Check your email to confirm your DWMY account."
          );
        }
      } else {
        const resolvedEmail = await resolveLoginEmail(loginIdentity);

        const { error: signInError } =
          await supabase.auth.signInWithPassword({
            email: resolvedEmail,
            password,
          });

        if (signInError) {
          throw new Error("Invalid email/username or password.");
        }
      }
    } catch (err) {
      setError(err.message || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  function openMode(nextMode) {
    resetStatus();
    setMode(nextMode);
  }

  if (mode !== "landing") {
    return (
      <div className="auth-page">
        <button
          className="auth-brand"
          onClick={() => openMode("landing")}
        >
          DWMY
          <small>a FRCTAL company</small>
        </button>

        <div className="auth-card">
          <span className="eyebrow">
            {mode === "signup"
              ? "Join DWMY"
              : mode === "forgot"
              ? "Account recovery"
              : mode === "recovery"
              ? "Choose a new password"
              : "Welcome back"}
          </span>

          <h1>
            {mode === "signup"
              ? "Create your account."
              : mode === "forgot"
              ? "Reset your password."
              : mode === "recovery"
              ? "Set your new password."
              : "Sign in to DWMY."}
          </h1>

          <p>
            {mode === "signup"
              ? "Your market conversations, organized across time."
              : mode === "forgot"
              ? "Enter the email address connected to your DWMY account."
              : mode === "recovery"
              ? "Choose a new password for your DWMY account."
              : "Enter your market network."}
          </p>

          {mode === "forgot" ? (
            <form onSubmit={requestPasswordReset}>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </label>

              {error && <div className="auth-error">{error}</div>}
              {message && <div className="auth-success">{message}</div>}

              <button
                className="auth-submit"
                type="submit"
                disabled={busy}
              >
                {busy ? "Please wait..." : "Send Reset Link"}
              </button>
            </form>
          ) : mode === "recovery" ? (
            <form onSubmit={updateRecoveredPassword}>
              <label>
                New password
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>

              <label>
                Confirm new password
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>

              {error && <div className="auth-error">{error}</div>}
              {message && <div className="auth-success">{message}</div>}

              <button
                className="auth-submit"
                type="submit"
                disabled={busy}
              >
                {busy ? "Updating..." : "Update Password"}
              </button>
            </form>
          ) : (
          <form onSubmit={submit}>
            {mode === "signup" && (
              <label>
                Username
                <input
                  value={username}
                  onChange={(e) =>
                    setUsername(e.target.value)
                  }
                  placeholder="Choose a username"
                  minLength={2}
                  maxLength={24}
                  pattern="[A-Za-z0-9_]+"
                  required
                />
              </label>
            )}

            {mode === "signup" ? (
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </label>
            ) : (
              <label>
                Email or username
                <input
                  value={loginIdentity}
                  onChange={(e) =>
                    setLoginIdentity(e.target.value)
                  }
                  placeholder="Email or username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                />
              </label>
            )}

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                placeholder="............"
                autoComplete={
                  mode === "signup"
                    ? "new-password"
                    : "current-password"
                }
                minLength={6}
                required
              />
            </label>

            {error && (
              <div className="auth-error">
                {error}
              </div>
            )}

            {message && (
              <div className="auth-success">
                {message}
              </div>
            )}

            <button
              className="auth-submit"
              type="submit"
              disabled={busy}
            >
              {busy
                ? "Please wait..."
                : mode === "signup"
                ? "Create Account"
                : "Sign In"}
            </button>
          </form>
          )}

          {mode === "signin" && (
            <div className="auth-switch">
              <button onClick={() => openMode("forgot")}>
                Forgot password?
              </button>
            </div>
          )}

          {mode !== "recovery" && (
          <div className="auth-switch">
            {mode === "signup" ? (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => openMode("signin")}
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                Need an account?{" "}
                <button
                  onClick={() => openMode("signup")}
                >
                  Create one
                </button>
              </>
            )}
          </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <div className="landing-logo">
          DWMY
          <small>a FRCTAL company</small>
        </div>

        <div>
          <button
            className="landing-signin"
            onClick={() => openMode("signin")}
          >
            Sign In
          </button>

          <button
            className="landing-join-small"
            onClick={() => openMode("signup")}
          >
            Join DWMY
          </button>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <span className="landing-kicker">
            MARKET CONVERSATIONS / STRUCTURED BY TIME
          </span>

          <h1>DWMY</h1>

          <div className="dwmy-expansion">
            <div><strong>D</strong><span>DAY</span></div>
            <i></i>
            <div><strong>W</strong><span>WEEK</span></div>
            <i></i>
            <div><strong>M</strong><span>MONTH</span></div>
            <i></i>
            <div><strong>Y</strong><span>YEAR</span></div>
          </div>

          <h2>Markets across time.</h2>

          <p>
            A market community built around the structure of the
            market itself. Follow conversations from today's price
            action through weekly, monthly and yearly context.
          </p>

          <div className="landing-actions">
            <button
              className="landing-primary"
              onClick={() => openMode("signup")}
            >
              Create Account
            </button>

            <button
              className="landing-secondary"
              onClick={() => openMode("signin")}
            >
              Sign In
            </button>
          </div>

          <div className="landing-markets">
            <span>FX</span>
            <span>Equities</span>
            <span>Conversations</span>
            <span>Research</span>
            <span>Live</span>
          </div>
        </section>

        <section className="landing-structure">
          <div className="structure-intro">
            <span className="eyebrow">
              One continuous archive
            </span>

            <h2>
              Today's conversation becomes tomorrow's
              market history.
            </h2>

            <p>
              Every market period has a canonical location.
              No duplicate threads. No conversations
              disappearing into an endless feed.
            </p>
          </div>

          <div className="structure-demo">
            <div className="structure-root">
              <span>FX</span>
              <strong>EUR/USD</strong>
            </div>

            <div className="structure-level level-year">
              <span>YEAR</span>
              <strong>2026</strong>
            </div>

            <div className="structure-level level-month">
              <span>MONTH</span>
              <strong>September</strong>
            </div>

            <div className="structure-level level-week">
              <span>WEEK</span>
              <strong>September 21</strong>
            </div>

            <div className="structure-level level-day">
              <span>DAY</span>
              <strong>September 25</strong>
              <small>24 replies / active now</small>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <strong>DWMY</strong>
        <span>a FRCTAL company</span>
      </footer>
    </div>
  );
}
