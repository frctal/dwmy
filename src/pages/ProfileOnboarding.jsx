import { useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const COUNTRIES = [
  "United States",
  "Canada",
  "Mexico",
  "United Kingdom",
  "Ireland",
  "France",
  "Germany",
  "Spain",
  "Portugal",
  "Italy",
  "Netherlands",
  "Belgium",
  "Switzerland",
  "Austria",
  "Sweden",
  "Norway",
  "Denmark",
  "Finland",
  "Poland",
  "Czech Republic",
  "Greece",
  "Romania",
  "Ukraine",
  "Turkey",
  "Israel",
  "United Arab Emirates",
  "Saudi Arabia",
  "India",
  "Pakistan",
  "Bangladesh",
  "Singapore",
  "Malaysia",
  "Indonesia",
  "Philippines",
  "Thailand",
  "Vietnam",
  "China",
  "Hong Kong",
  "Taiwan",
  "Japan",
  "South Korea",
  "Australia",
  "New Zealand",
  "Brazil",
  "Argentina",
  "Chile",
  "Colombia",
  "Peru",
  "South Africa",
  "Nigeria",
  "Kenya",
  "Ghana",
  "Egypt",
  "Morocco",
  "Other",
];

const AVATARS = [
  ["Orbit", "#52d6a0", "#15231f", "circle"],
  ["Arc", "#8db8ff", "#172033", "arc"],
  ["Prism", "#c69cff", "#241a30", "diamond"],
  ["Vector", "#ffb86b", "#302218", "vector"],
  ["Node", "#7de3e8", "#14282a", "nodes"],
  ["Signal", "#ff8fa3", "#301a20", "signal"],
  ["Axis", "#d6df73", "#272914", "axis"],
  ["Ring", "#80bfff", "#152333", "rings"],
  ["Fractal", "#b9a1ff", "#201a31", "fractal"],
  ["Apex", "#ffcf70", "#302713", "apex"],
  ["Grid", "#7ce0b5", "#14271f", "grid"],
  ["Wave", "#80d4ff", "#142530", "wave"],
];

function avatarSvg(index, size = 160) {
  const [, fg, bg, shape] = AVATARS[index];
  const common = `fill="none" stroke="${fg}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"`;
  const shapes = {
    circle: `<circle cx="80" cy="80" r="43" ${common}/><circle cx="80" cy="80" r="10" fill="${fg}"/>`,
    arc: `<path d="M35 105 A52 52 0 0 1 125 55" ${common}/><path d="M48 121 L125 44" ${common}/>` ,
    diamond: `<path d="M80 28 L132 80 L80 132 L28 80 Z" ${common}/><path d="M80 51 L109 80 L80 109 L51 80 Z" ${common}/>` ,
    vector: `<path d="M35 116 L80 39 L125 116" ${common}/><path d="M53 89 H108" ${common}/>` ,
    nodes: `<path d="M42 105 L78 51 L119 101" ${common}/><circle cx="42" cy="105" r="9" fill="${fg}"/><circle cx="78" cy="51" r="9" fill="${fg}"/><circle cx="119" cy="101" r="9" fill="${fg}"/>`,
    signal: `<path d="M28 96 C47 96 48 55 65 55 C83 55 80 111 99 111 C115 111 116 72 132 72" ${common}/>` ,
    axis: `<path d="M32 80 H128 M80 32 V128" ${common}/><circle cx="104" cy="56" r="12" ${common}/>` ,
    rings: `<circle cx="80" cy="80" r="47" ${common}/><circle cx="80" cy="80" r="27" ${common}/><circle cx="80" cy="80" r="7" fill="${fg}"/>`,
    fractal: `<path d="M80 31 V68 M80 68 L47 101 M80 68 L113 101 M47 101 L31 126 M47 101 L63 126 M113 101 L97 126 M113 101 L129 126" ${common}/>` ,
    apex: `<path d="M31 117 L80 35 L129 117 Z" ${common}/><circle cx="80" cy="83" r="9" fill="${fg}"/>`,
    grid: `<path d="M43 43 H117 V117 H43 Z M43 80 H117 M80 43 V117" ${common}/>` ,
    wave: `<path d="M25 82 C39 45 56 45 70 82 C84 119 101 119 135 73" ${common}/>` ,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 160 160"><rect width="160" height="160" rx="80" fill="${bg}"/>${shapes[shape]}</svg>`;
}

function svgDataUrl(index) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(avatarSvg(index))}`;
}

async function presetAvatarPng(index, size = 512) {
  const svg = avatarSvg(index, size);
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Unable to render the selected avatar."));
      img.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to prepare the selected avatar.");

    context.drawImage(image, 0, 0, size, size);

    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Unable to create the selected avatar."));
        },
        "image/png"
      );
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function uploadPresetAvatar(userId, index) {
  const blob = await presetAvatarPng(index, 512);
  const path = `${userId}/avatar-preset-${Date.now()}.png`;

  const { error } = await supabase.storage.from("avatars").upload(path, blob, {
    contentType: "image/png",
    upsert: false,
  });

  if (error) throw error;
  return path;
}

export default function ProfileOnboarding({ user, onComplete }) {
  const [step, setStep] = useState(0);
  const [country, setCountry] = useState(user?.country || "");
  const [countryOpen, setCountryOpen] = useState(false);
  const [bio, setBio] = useState(user?.bio || "");
  const [signature, setSignature] = useState(user?.signature || "");
  const [avatarIndex, setAvatarIndex] = useState(null);
  const [profileSkipped, setProfileSkipped] = useState(false);
  const [trialStatus, setTrialStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const steps = useMemo(() => ["Welcome", "Profile", "Avatar", "Access"], []);

  async function goToAccess(skipped = false) {
    setError("");
    setProfileSkipped(skipped);
    setBusy(true);
    try {
      const { data, error: statusError } = await supabase.rpc("get_my_stripe_pro_trial_status");
      if (statusError) throw statusError;
      setTrialStatus(data?.[0] || { status: "NEVER_USED", started_at: null, expires_at: null });
      setStep(3);
    } catch (err) {
      setError(err.message || "Unable to check trial status.");
    } finally {
      setBusy(false);
    }
  }

  async function saveProfileAndContinue() {
    setError("");
    setBusy(true);
    let newAvatarPath = null;
    try {
      if (avatarIndex !== null) newAvatarPath = await uploadPresetAvatar(user.id, avatarIndex);
      const update = {
        country: country.trim() || null,
        bio: bio.trim() || null,
        signature: signature.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (newAvatarPath) update.avatar_path = newAvatarPath;
      const { error: updateError } = await supabase.from("profiles").update(update).eq("id", user.id);
      if (updateError) throw updateError;
      await goToAccess(false);
    } catch (err) {
      if (newAvatarPath) await supabase.storage.from("avatars").remove([newAvatarPath]);
      setError(err.message || "Unable to save your profile.");
    } finally {
      setBusy(false);
    }
  }

  async function completeOnboarding() {
    const { error: finishError } = await supabase.from("profiles").update({
      onboarding_completed_at: new Date().toISOString(),
      profile_setup_skipped: profileSkipped,
      updated_at: new Date().toISOString(),
    }).eq("id", user.id);

    if (finishError) throw finishError;
  }

  async function continueWithFree() {
    setError("");
    setBusy(true);
    try {
      await completeOnboarding();
      await onComplete?.();
    } catch (err) {
      setError(err.message || "Unable to finish onboarding.");
    } finally {
      setBusy(false);
    }
  }

  async function startStripeTrial(billingPeriod) {
    setError("");
    setBusy(true);
    try {
      await completeOnboarding();

      const returnUrl = `${window.location.origin}${window.location.pathname}`;
      const { data, error: checkoutError } = await supabase.functions.invoke(
        "create-pro-checkout",
        {
          body: {
            billing_period: billingPeriod,
            checkout_type: "trial",
            success_url: returnUrl,
            cancel_url: returnUrl,
          },
        },
      );

      if (checkoutError) throw checkoutError;
      if (!data?.checkout_url) throw new Error("Stripe did not return a Checkout URL.");

      window.location.assign(data.checkout_url);
    } catch (err) {
      setError(err.message || "Unable to start Stripe Checkout.");
      setBusy(false);
    }
  }

  const shell = { minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "var(--bg, #0b0e10)", color: "var(--text, #f5f7f6)" };
  const card = { width: "min(760px, 100%)", border: "1px solid var(--accent-border, rgba(82,214,160,.3))", borderRadius: 20, padding: "clamp(24px, 5vw, 48px)", background: "var(--panel, #111619)" };
  const input = { width: "100%", boxSizing: "border-box", padding: "12px 14px", marginTop: 6, marginBottom: 16, borderRadius: 10, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.04)", color: "inherit" };
  const button = { border: 0, borderRadius: 10, padding: "12px 18px", cursor: busy ? "wait" : "pointer", fontWeight: 700 };
  const primary = { ...button, background: "var(--accent, #52d6a0)", color: "#07110d" };
  const secondary = { ...button, background: "rgba(255,255,255,.08)", color: "inherit" };

  return <div style={shell}><section style={card}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 30, opacity: .72, fontSize: 13 }}>
      <strong>DWMY</strong><span>{steps[step]} · {step + 1}/{steps.length}</span>
    </div>

    {step === 0 && <>
      <span style={{ color: "var(--accent, #52d6a0)", fontWeight: 700 }}>WELCOME TO DWMY</span>
      <h1>Set up your account.</h1>
      <p>Your Free account includes Markets. You can set up your public profile now, then choose whether to start your 7-day PRO trial.</p>
      <p style={{ opacity: .72 }}>You must complete these steps to enter DWMY, but the optional profile details can be skipped.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 28 }}><button style={primary} disabled={busy} onClick={() => setStep(1)}>Continue</button></div>
    </>}

    {step === 1 && <>
      <span style={{ color: "var(--accent, #52d6a0)", fontWeight: 700 }}>PROFILE</span>
      <h1>Make DWMY yours.</h1>
      <label>Username<input style={input} value={`@${user.username}`} disabled /></label>
      <label>Country <span style={{ opacity: .55 }}>(optional)</span>
        <div style={{ position: "relative", marginTop: 6, marginBottom: 16 }}>
          <button type="button" style={{ ...input, margin: 0, textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }} onClick={() => setCountryOpen(open => !open)}>
            <span style={{ opacity: country ? 1 : .55 }}>{country || "Select country"}</span><span aria-hidden="true">⌄</span>
          </button>
          {countryOpen && <div style={{ position: "absolute", zIndex: 20, top: "calc(100% + 6px)", left: 0, right: 0, maxHeight: 240, overflowY: "auto", border: "1px solid rgba(255,255,255,.14)", borderRadius: 10, background: "var(--panel, #111619)", boxShadow: "0 16px 40px rgba(0,0,0,.35)", padding: 6 }}>
            <button type="button" onClick={() => { setCountry(""); setCountryOpen(false); }} style={{ width: "100%", border: 0, borderRadius: 7, padding: "10px 11px", textAlign: "left", background: "transparent", color: "inherit", cursor: "pointer", opacity: .65 }}>No country selected</button>
            {COUNTRIES.map(name => <button type="button" key={name} onClick={() => { setCountry(name); setCountryOpen(false); }} style={{ width: "100%", border: 0, borderRadius: 7, padding: "10px 11px", textAlign: "left", background: country === name ? "rgba(82,214,160,.12)" : "transparent", color: "inherit", cursor: "pointer" }}>{name}</button>)}
          </div>}
        </div>
      </label>
      <label>Bio <span style={{ opacity: .55 }}>(optional)</span><textarea style={{ ...input, minHeight: 100, resize: "vertical" }} maxLength={500} value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell the community about yourself." /></label>
      <label>Signature <span style={{ opacity: .55 }}>(optional)</span><input style={input} maxLength={200} value={signature} onChange={e => setSignature(e.target.value)} placeholder="Post signature" /></label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><button style={primary} disabled={busy} onClick={() => setStep(2)}>Continue</button><button style={secondary} disabled={busy} onClick={() => goToAccess(true)}>Skip profile setup</button></div>
    </>}

    {step === 2 && <>
      <span style={{ color: "var(--accent, #52d6a0)", fontWeight: 700 }}>AVATAR</span>
      <h1>Choose an identity.</h1>
      <p style={{ opacity: .72 }}>Optional. You can upload or change your avatar later in Settings.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(82px, 1fr))", gap: 12, margin: "24px 0" }}>
        {AVATARS.map(([name], index) => <button key={name} title={name} onClick={() => setAvatarIndex(index)} style={{ border: avatarIndex === index ? "2px solid var(--accent, #52d6a0)" : "2px solid transparent", borderRadius: 16, padding: 6, background: "rgba(255,255,255,.04)", cursor: "pointer" }}><img src={svgDataUrl(index)} alt={name} style={{ display: "block", width: "100%", aspectRatio: "1", borderRadius: "50%" }} /></button>)}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><button style={primary} disabled={busy} onClick={saveProfileAndContinue}>{busy ? "Saving..." : "Save profile"}</button><button style={secondary} disabled={busy} onClick={() => goToAccess(false)}>Skip avatar</button></div>
    </>}

    {step === 3 && <>
      <span style={{ color: "var(--accent, #52d6a0)", fontWeight: 700 }}>ACCESS</span>
      <h1>Choose how to enter DWMY.</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14, margin: "24px 0" }}>
        <div style={{ padding: 20, borderRadius: 14, border: "1px solid rgba(255,255,255,.12)" }}><strong>FREE</strong><h2>Markets</h2><p style={{ opacity: .72 }}>Keep your permanent Free access and enter DWMY now.</p><button style={secondary} disabled={busy} onClick={continueWithFree}>Continue with Free</button></div>
        <div style={{ padding: 20, borderRadius: 14, border: "1px solid var(--accent-border, rgba(82,214,160,.3))" }}>
          <strong style={{ color: "var(--accent, #52d6a0)" }}>PRO TRIAL</strong>
          <h2>Try DWMY PRO FREE for 7 days.</h2>
          <p style={{ opacity: .72 }}>Conversations, Live Chat participation, and Messaging. Communities remain Beta.</p>
          {trialStatus?.status === "NEVER_USED" ? <>
            <p style={{ opacity: .72 }}>Payment method required. Cancel before the trial ends to avoid being charged.</p>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ padding: 14, borderRadius: 10, background: "rgba(255,255,255,.04)" }}>
                <strong>Monthly</strong>
                <div style={{ margin: "4px 0 10px", opacity: .72 }}>7 days free · then $1.52/month</div>
                <button style={primary} disabled={busy} onClick={() => startStripeTrial("monthly")}>{busy ? "Opening Stripe..." : "Start Monthly Trial"}</button>
              </div>
              <div style={{ padding: 14, borderRadius: 10, background: "rgba(255,255,255,.04)" }}>
                <strong>Yearly</strong>
                <div style={{ margin: "4px 0 10px", opacity: .72 }}>7 days free · then $9.12/year</div>
                <button style={primary} disabled={busy} onClick={() => startStripeTrial("yearly")}>{busy ? "Opening Stripe..." : "Start Yearly Trial"}</button>
              </div>
            </div>
          </> : <p style={{ opacity: .72 }}>This account has already used its PRO trial.</p>}
        </div>
      </div>
    </>}

    {error && <p role="alert" style={{ marginTop: 20, color: "#ff9c9c" }}>{error}</p>}
  </section></div>;
}
