import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function MarketBrowser({ openInstrument }) {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadMarkets() {
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("sections")
        .select(`
          id,
          section_type,
          slug,
          name,
          description,
          sort_order,
          is_active,
          instruments (
            id,
            section_id,
            symbol,
            slug,
            name,
            description,
            sort_order,
            is_active
          )
        `)
        .eq("section_type", "MARKET")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (!alive) return;

      if (error) {
        console.error("Market directory load failed:", error);
        setError(error.message);
        setSections([]);
      } else {
        const normalized = (data || []).map((section) => ({
          ...section,
          instruments: (section.instruments || [])
            .filter((instrument) => instrument.is_active)
            .sort(
              (a, b) =>
                (a.sort_order || 0) -
                (b.sort_order || 0)
            ),
        }));

        setSections(normalized);
      }

      setLoading(false);
    }

    loadMarkets();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="browse-section">
      <div className="section-title-row">
        <div>
          <span className="eyebrow">Directory</span>
          <h2>Browse Markets</h2>
        </div>
      </div>

      {loading && (
        <div className="market-directory-state">
          Loading DWMY markets...
        </div>
      )}

      {error && (
        <div className="market-directory-state market-directory-error">
          Unable to load markets: {error}
        </div>
      )}

      {!loading && !error && (
        <div className="section-grid">
          {sections.map((section) => (
            <div className="market-card" key={section.id}>
              <div className="market-card-heading">
                <div>
                  <span className="type-label">MARKET</span>
                  <h3>{section.name}</h3>
                </div>

                <span className="arrow">-&gt;</span>
              </div>

              <p className="market-description">
                {section.description}
              </p>

              <div className="instrument-list">
                {section.instruments.map((instrument) => (
                  <button
                    key={instrument.id}
                    onClick={() =>
                      openInstrument(section, instrument)
                    }
                  >
                    <span>
                      <strong>{instrument.symbol}</strong>

                      {instrument.name !== instrument.symbol && (
                        <small>{instrument.name}</small>
                      )}
                    </span>

                    <span>&gt;</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
