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
  openDirectory,
  entitlements = [],
}) {
  const [heroSlide, setHeroSlide] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeroSlide((current) => (current + 1) % 3);
    }, 9000);

    return () => window.clearInterval(timer);
  }, []);

  const [stats, setStats] = useState({
    assetClasses: 0,
    instruments: 0,
    discussions: 0,
    posts: 0,
  });

  useEffect(() => {
    async function loadStats() {
      const [
        assetClassesResult,
        instrumentsResult,
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
          .from("instruments")
          .select("*", {
            count: "exact",
            head: true,
          })
          .eq("is_active", true),

        supabase
          .from("discussions")
          .select("*", {
            count: "exact",
            head: true,
          })
          .eq("is_deleted", false)
          .eq("discussion_type", "MARKET_SEGMENT"),

        supabase
          .from("posts")
          .select("id, discussions!inner(id)", {
            count: "exact",
            head: true,
          })
          .eq("is_deleted", false)
          .eq("discussions.is_deleted", false)
          .eq("discussions.discussion_type", "MARKET_SEGMENT"),
      ]);

      setStats({
        assetClasses: assetClassesResult.count || 0,
        instruments: instrumentsResult.count || 0,
        discussions: discussionsResult.count || 0,
        posts: postsResult.count || 0,
      });
    }

    loadStats();
  }, []);

  return (
    <>
      <section className="home-hero-carousel">
        <div className="home-hero-viewport">
          <div
            className="home-hero-track"
            style={{ transform: `translateX(-${heroSlide * 100}%)` }}
          >
            <article className="hero home-hero-slide">
              <div className="hero-copy">
                <span className="eyebrow">Market discussion, organized by time</span>
                <h1>Every market. Every period. One permanent conversation.</h1>
                <p>
                  Discussions are organized around the market itself - from today's
                  price action to the larger weekly, monthly and yearly structure.
                </p>
              </div>

              <div className="hero-stat-grid">
                <div>
                  <strong>{stats.assetClasses}</strong>
                  <span>Asset classes</span>
                </div>
                <div>
                  <strong>{stats.instruments}</strong>
                  <span>Available instruments</span>
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
                <span className="eyebrow">Conversations · Beta</span>
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
                <small>BETA</small>
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

      <MarketBrowser
        openInstrument={openInstrument}
        openDirectory={openDirectory}
      />

      <div className="home-columns">
        <RecentDiscussions
          openDiscussion={openDiscussion}
        />

        <LatestPosts
          openDiscussion={openDiscussion}
        />
      </div>

      <LiveChat
        user={user}
        canParticipate={entitlements.includes("LIVE_CHAT")}
      />
    </>
  );
}