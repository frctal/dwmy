import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Landing() {
  const [mode, setMode] = useState("landing");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function resetStatus() {
    setMessage("");
    setError("");
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
        const { error: signInError } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

        if (signInError) throw signInError;
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
            {mode === "signup" ? "Join DWMY" : "Welcome back"}
          </span>

          <h1>
            {mode === "signup"
              ? "Create your account."
              : "Sign in to DWMY."}
          </h1>

          <p>
            {mode === "signup"
              ? "Your market conversations, organized across time."
              : "Enter your market network."}
          </p>

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

