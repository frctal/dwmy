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
}) {
  const [heroSlide, setHeroSlide] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeroSlide((current) => (current + 1) % 2);
    }, 9000);

    return () => window.clearInterval(timer);
  }, []);

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
            </article>

            <article className="hero home-hero-slide community-coming-soon">
              <div className="hero-copy">
                <span className="eyebrow">Communities · Coming Soon</span>
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
                <small>COMING SOON</small>
              </div>
            </article>
          </div>
        </div>

        <button
          className="hero-carousel-arrow hero-carousel-prev"
          aria-label="Previous introduction"
          onClick={() => setHeroSlide((heroSlide + 1) % 2)}
        >
          ‹
        </button>
        <button
          className="hero-carousel-arrow hero-carousel-next"
          aria-label="Next introduction"
          onClick={() => setHeroSlide((heroSlide + 1) % 2)}
        >
          ›
        </button>

        <div className="hero-carousel-dots" aria-label="Introduction slides">
          {[0, 1].map((slide) => (
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

      <LiveChat user={user} />
    </>
  );
}