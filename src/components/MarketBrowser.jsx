import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function MarketBrowser({ openInstrument, openDirectory }) {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadDiscovery() {
      setLoading(true);
      setError("");

      const { data, error } = await supabase.rpc("get_market_discovery", {
        market_limit: 6,
        trader_limit: 3,
        lookback_days: 7,
      });

      if (!alive) return;

      if (error) {
        console.error("Market discovery load failed:", error);
        setError(error.message);
        setMarkets([]);
      } else {
        setMarkets(Array.isArray(data) ? data : []);
      }

      setLoading(false);
    }

    loadDiscovery();
    return () => { alive = false; };
  }, []);

  return (
    <section className="browse-section">
      <div className="section-title-row market-discovery-title">
        <div>
          <span className="eyebrow">Discovery</span>
          <h2>Most Active Markets</h2>
          <p>Markets ranked by DWMY contributions during the last 7 days.</p>
        </div>
        <button className="directory-link-button" onClick={openDirectory}>
          Full Market Directory
        </button>
      </div>

      {loading && <div className="market-directory-state">Measuring market activity...</div>}
      {error && (
        <div className="market-directory-state market-directory-error">
          Unable to load market activity: {error}
        </div>
      )}

      {!loading && !error && (
        <div className="section-grid active-market-grid">
          {markets.map((market) => (
            <div className="market-card active-market-card" key={market.instrument_id}>
              <button
                className="active-market-open"
                onClick={() => openInstrument(market.section, market.instrument)}
              >
                <span>
                  <small>{market.section?.name}{market.group_name ? ` · ${market.group_name}` : ""}</small>
                  <strong>{market.instrument?.symbol}</strong>
                  {market.instrument?.name !== market.instrument?.symbol && (
                    <em>{market.instrument?.name}</em>
                  )}
                </span>
                <span className="arrow">-&gt;</span>
              </button>

              <div className="market-activity-stats">
                <div><strong>{market.contribution_count}</strong><span>Contributions</span></div>
                <div><strong>{market.trader_count}</strong><span>Traders</span></div>
              </div>

              <div className="top-traders">
                <div className="top-traders-heading">
                  <span>Top Traders</span>
                  <small>7D CONTRIBUTIONS</small>
                </div>

                {(market.top_traders || []).length ? (
                  market.top_traders.map((trader, index) => (
                    <div className="top-trader-row" key={trader.user_id}>
                      <span><b>{index + 1}</b>{trader.display_name || trader.username}</span>
                      <strong>{trader.contributions}</strong>
                    </div>
                  ))
                ) : (
                  <div className="top-trader-empty">No contributions yet.</div>
                )}
              </div>

              <div className="market-latest-activity">
                {market.latest_activity_at
                  ? `Last contribution ${new Date(market.latest_activity_at).toLocaleString()}`
                  : "Waiting for the first contribution"}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
