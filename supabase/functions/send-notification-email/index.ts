import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("DWMY_NOTIFICATION_WEBHOOK_SECRET")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  if (!WEBHOOK_SECRET || req.headers.get("x-dwmy-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const payload = await req.json();
    const notificationId = payload?.record?.id ?? payload?.notification_id;
    if (!notificationId) return new Response("Missing notification id", { status: 400 });

    const { data: n, error: nError } = await supabase
      .from("notifications")
      .select("id,recipient_user_id,actor_user_id,notification_type,discussion_id,post_id,message_conversation_id,message_id,created_at")
      .eq("id", notificationId)
      .single();

    if (nError || !n) return new Response("Notification not found", { status: 404 });

    const type = String(n.notification_type || "").toUpperCase();
    if (!["REPLY", "MENTION", "DIRECT_MESSAGE"].includes(type)) {
      return new Response("Ignored", { status: 200 });
    }

    const { error: claimError } = await supabase
      .from("notification_email_deliveries")
      .insert({ notification_id: n.id, status: "PROCESSING" });

    if (claimError) {
      if (claimError.code === "23505") return new Response("Already processed", { status: 200 });
      throw claimError;
    }

    const { data: recipient, error: recipientError } =
      await supabase.auth.admin.getUserById(n.recipient_user_id);

    if (recipientError || !recipient?.user?.email) {
      await supabase.from("notification_email_deliveries").update({
        status: "FAILED",
        error_message: recipientError?.message || "Recipient has no email",
        completed_at: new Date().toISOString(),
      }).eq("notification_id", n.id);
      return new Response("Recipient email unavailable", { status: 200 });
    }

    let actorName = "A DWMY member";
    if (n.actor_user_id) {
      const { data: actor } = await supabase
        .from("profiles")
        .select("username,display_name")
        .eq("id", n.actor_user_id)
        .maybeSingle();
      actorName = actor?.display_name || actor?.username || actorName;
    }

    let subject = "New DWMY notification";
    let heading = "You have a new notification on DWMY.";
    if (type === "REPLY") {
      subject = `DWMY — ${actorName} replied to you`;
      heading = `${actorName} replied to your post.`;
    } else if (type === "MENTION") {
      subject = `DWMY — ${actorName} mentioned you`;
      heading = `${actorName} mentioned you.`;
    } else if (type === "DIRECT_MESSAGE") {
      subject = `DWMY — New message from ${actorName}`;
      heading = `${actorName} sent you a direct message.`;
    }

    let detail = "";
    if (n.post_id) {
      const { data: post } = await supabase.from("posts").select("body").eq("id", n.post_id).maybeSingle();
      if (post?.body) detail = post.body.replace(/\s+/g, " ").trim().slice(0, 180);
    } else if (n.message_id) {
      const { data: dm } = await supabase.from("direct_messages").select("body").eq("id", n.message_id).maybeSingle();
      if (dm?.body) detail = dm.body.replace(/\s+/g, " ").trim().slice(0, 180);
    }

    const appUrl = "https://frctal.github.io/dwmy/";
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px;color:#111827">
      <div style="font-size:28px;font-weight:800">DWMY</div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:28px">a FRCTAL company</div>
      <h2 style="font-size:20px">${escapeHtml(heading)}</h2>
      ${detail ? `<div style="padding:14px 16px;background:#f3f4f6;border-radius:8px;margin:16px 0">${escapeHtml(detail)}</div>` : ""}
      <a href="${appUrl}" style="display:inline-block;margin-top:12px;padding:11px 18px;background:#111827;color:#fff;text-decoration:none;border-radius:6px">Open DWMY</a>
    </div>`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "DWMY <onboarding@resend.dev>",
        to: [recipient.user.email],
        subject,
        html,
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      await supabase.from("notification_email_deliveries").update({
        status: "FAILED",
        error_message: JSON.stringify(result).slice(0, 1000),
        completed_at: new Date().toISOString(),
      }).eq("notification_id", n.id);
      return new Response(JSON.stringify(result), { status: 502 });
    }

    await supabase.from("notification_email_deliveries").update({
      status: "SENT",
      provider_message_id: result?.id || null,
      completed_at: new Date().toISOString(),
    }).eq("notification_id", n.id);

    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});