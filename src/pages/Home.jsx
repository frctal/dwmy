import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

import LiveChat from "../components/LiveChat";
import RecentDiscussions from "../components/RecentDiscussions";
import LatestPosts from "../components/LatestPosts";
import MarketBrowser from "../components/MarketBrowser";

export default function Home({
  user,
  openDiscussion,
  openInstrument,
}) {
  const [stats, setStats] = useState({
    markets: 0,
    discussions: 0,
    posts: 0,
  });

  useEffect(() => {
    async function loadStats() {
      const [
        marketsResult,
        discussionsResult,
        postsResult,
      ] = await Promise.all([
        supabase
          .from("sections")
          .select("*", {
            count: "exact",
            head: true,
          })
          .eq("section_type", "MARKET")
          .eq("is_active", true),

        supabase
          .from("discussions")
          .select("*", {
            count: "exact",
            head: true,
          })
          .eq("is_deleted", false),

        supabase
          .from("posts")
          .select("*", {
            count: "exact",
            head: true,
          })
          .eq("is_deleted", false),
      ]);

      setStats({
        markets: marketsResult.count || 0,
        discussions:
          discussionsResult.count || 0,
        posts: postsResult.count || 0,
      });
    }

    loadStats();
  }, []);

  return (
    <>
      <section className="hero">
        <div>
          <span className="eyebrow">
            Market discussion, organized by time
          </span>

          <h1>
            Every market. Every period.
            <br />
            One permanent conversation.
          </h1>

          <p>
            Discussions are organized around the
            market itself - from today's price action
            to the larger weekly, monthly and yearly
            structure.
          </p>
        </div>

        <div className="hero-stat-grid">
          <div>
            <strong>{stats.markets}</strong>
            <span>Active markets</span>
          </div>

          <div>
            <strong>{stats.discussions}</strong>
            <span>Discussions</span>
          </div>

          <div>
            <strong>{stats.posts}</strong>
            <span>Posts</span>
          </div>
        </div>
      </section>

      <MarketBrowser
        openInstrument={openInstrument}
      />

      <div className="home-columns">
        <RecentDiscussions
          openDiscussion={openDiscussion}
        />

        <LatestPosts
          openDiscussion={openDiscussion}
        />
      </div>

      <LiveChat user={user} />
    </>
  );
}