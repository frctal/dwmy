import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Landing() {
  const [mode, setMode] = useState("landing");
  const [heroSlide, setHeroSlide] = useState(0);
  const [email, setEmail] = useState("");
  const [signupUsername, setSignupUsername] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
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

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeroSlide((current) => (current + 1) % 3);
    }, 9000);

    return () => window.clearInterval(timer);
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

  async function signUp(event) {
    event.preventDefault();
    resetStatus();

    const cleanEmail = email.trim();
    const cleanUsername = signupUsername.trim();

    if (!cleanEmail) {
      setError("Enter your email address.");
      return;
    }

    if (!/^[A-Za-z0-9_]{2,24}$/.test(cleanUsername)) {
      setError("Username must be 2-24 characters using only letters, numbers, or underscores.");
      return;
    }

    if (signupPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const emailRedirectTo = `${window.location.origin}${window.location.pathname}`;

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password: signupPassword,
        options: {
          emailRedirectTo,
          data: {
            username: cleanUsername,
          },
        },
      });

      if (signUpError) throw signUpError;

      if (data?.session) {
        setMessage("Account created. Entering DWMY...");
        return;
      }

      setSignupPassword("");
      setSignupConfirmPassword("");
      setMessage("Account created. Check your email to verify your address, then return to DWMY to continue setup.");
    } catch (err) {
      setError(err.message || "Unable to create your account.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    resetStatus();
    setBusy(true);

    try {
      const resolvedEmail = await resolveLoginEmail(loginIdentity);

      const { error: signInError } =
        await supabase.auth.signInWithPassword({
          email: resolvedEmail,
          password,
        });

      if (signInError) {
        throw new Error("Invalid email/username or password.");
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
              ? "Create your DWMY account."
              : mode === "forgot"
              ? "Reset your password."
              : mode === "recovery"
              ? "Set your new password."
              : "Sign in to DWMY."}
          </h1>

          <p>
            {mode === "signup"
              ? "Free accounts include Markets. Verify your email, complete setup, then enter DWMY."
              : mode === "forgot"
              ? "Enter the email address connected to your DWMY account."
              : mode === "recovery"
              ? "Choose a new password for your DWMY account."
              : "Enter your market network."}
          </p>

          {mode === "signup" ? (
            <form onSubmit={signUp}>
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

              <label>
                Username
                <input
                  value={signupUsername}
                  onChange={(e) => setSignupUsername(e.target.value)}
                  placeholder="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  minLength={2}
                  maxLength={24}
                  pattern="[A-Za-z0-9_]+"
                  required
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>

              <label>
                Confirm password
                <input
                  type="password"
                  value={signupConfirmPassword}
                  onChange={(e) => setSignupConfirmPassword(e.target.value)}
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
                {busy ? "Creating account..." : "Create Free Account"}
              </button>

              <div className="auth-switch">
                Already have an account?{" "}
                <button type="button" onClick={() => openMode("signin")}>
                  Sign in
                </button>
              </div>
            </form>
          ) : mode === "forgot" ? (
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

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                placeholder="............"
                autoComplete="current-password"
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
              {busy ? "Please wait..." : "Sign In"}
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

          {mode === "signin" && (
            <div className="auth-switch">
              New to DWMY?{" "}
              <button onClick={() => openMode("signup")}>
                Create a free account
              </button>
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
            Create Account
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

        <section className="home-hero-carousel">
          <div className="home-hero-viewport">
            <div
              className="home-hero-track"
              style={{ transform: `translateX(-${heroSlide * 100}%)` }}
            >
              <article className="hero home-hero-slide community-coming-soon">
                <div className="hero-copy">
                  <span className="eyebrow">Markets · Free</span>
                  <h1>Every market. Every period. One permanent conversation.</h1>
                  <p>
                    Discussions are organized around the market itself - from today's
                    price action to the larger weekly, monthly and yearly structure.
                  </p>
                  <strong className="community-hero-line">
                    Follow the market. Follow the structure. Keep the history.
                  </strong>
                </div>

                <div className="community-coming-soon-mark">
                  <span>FRCTAL / DWMY</span>
                  <strong>MARKETS</strong>
                  <small>FREE</small>
                </div>
              </article>

              <article className="hero home-hero-slide community-coming-soon">
                <div className="hero-copy">
                  <span className="eyebrow">Communities · Beta</span>
                  <h1>Build your community.</h1>
                  <p>
                    Create your own space on DWMY for traders, teams, friends, or
                    education. Choose the markets your community follows and discuss
                    them through the same Day / Week / Month / Year structure.
                  </p>
                  <strong className="community-hero-line">
                    Your members. Your markets. Your conversation.
                  </strong>
                </div>

                <div className="community-coming-soon-mark">
                  <span>FRCTAL / DWMY</span>
                  <strong>COMMUNITIES</strong>
                  <small>BETA</small>
                </div>
              </article>

              <article className="hero home-hero-slide community-coming-soon">
                <div className="hero-copy">
                  <span className="eyebrow">Conversations · PRO</span>
                  <h1>A forum for everything worth discussing.</h1>
                  <p>
                    Start persistent forum conversations beyond the market directory.
                    Discuss ideas, research, events, questions, and whatever matters to
                    the DWMY community without losing the thread.
                  </p>
                  <strong className="community-hero-line">
                    Start a topic. Build the discussion. Keep the conversation.
                  </strong>
                </div>

                <div className="community-coming-soon-mark">
                  <span>FRCTAL / DWMY</span>
                  <strong>CONVERSATIONS</strong>
                  <small>PRO</small>
                </div>
              </article>
            </div>
          </div>

          <button
            className="hero-carousel-arrow hero-carousel-prev"
            aria-label="Previous introduction"
            onClick={() => setHeroSlide((heroSlide + 2) % 3)}
          >
            ‹
          </button>
          <button
            className="hero-carousel-arrow hero-carousel-next"
            aria-label="Next introduction"
            onClick={() => setHeroSlide((heroSlide + 1) % 3)}
          >
            ›
          </button>

          <div className="hero-carousel-dots" aria-label="Introduction slides">
            {[0, 1, 2].map((slide) => (
              <button
                key={slide}
                className={heroSlide === slide ? "active" : ""}
                aria-label={`Show introduction ${slide + 1}`}
                onClick={() => setHeroSlide(slide)}
              />
            ))}
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
