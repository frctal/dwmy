import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function MarketDirectory({ openInstrument }) {
  const [sections, setSections] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadDirectory() {
      setLoading(true);
      const [sectionResult, groupResult] = await Promise.all([
        supabase
          .from("sections")
          .select(`
            id, section_type, slug, name, description, sort_order, is_active,
            instruments (
              id, section_id, group_id, symbol, slug, name, description, sort_order, is_active
            )
          `)
          .eq("section_type", "MARKET")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("market_groups")
          .select("id, section_id, name, slug, description, sort_order, is_active")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
      ]);

      if (!alive) return;
      const firstError = sectionResult.error || groupResult.error;
      if (firstError) {
        setError(firstError.message);
        setSections([]);
        setGroups([]);
      } else {
        setSections((sectionResult.data || []).map((section) => ({
          ...section,
          instruments: (section.instruments || [])
            .filter((instrument) => instrument.is_active)
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
        })));
        setGroups(groupResult.data || []);
      }
      setLoading(false);
    }

    loadDirectory();
    return () => { alive = false; };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  const visibleSections = useMemo(() => sections.map((section) => {
    const sectionGroups = groups.filter((group) => group.section_id === section.id);
    const grouped = sectionGroups.map((group) => ({
      ...group,
      instruments: section.instruments.filter((instrument) => instrument.group_id === group.id),
    })).filter((group) => group.instruments.length);

    const ungrouped = section.instruments.filter((instrument) => !instrument.group_id);
    const buckets = [...grouped, ...(ungrouped.length ? [{
      id: `ungrouped-${section.id}`,
      name: "Other",
      sort_order: 9999,
      instruments: ungrouped,
    }] : [])];

    if (!normalizedQuery) return { ...section, buckets };

    const filteredBuckets = buckets.map((bucket) => ({
      ...bucket,
      instruments: bucket.instruments.filter((instrument) =>
        `${instrument.symbol} ${instrument.name} ${section.name} ${bucket.name}`
          .toLowerCase()
          .includes(normalizedQuery)
      ),
    })).filter((bucket) => bucket.instruments.length);

    return { ...section, buckets: filteredBuckets };
  }).filter((section) => section.buckets.length), [sections, groups, normalizedQuery]);

  return (
    <section className="market-directory-page">
      <div className="directory-hero">
        <span className="eyebrow">DWMY Directory</span>
        <h1>Market Directory</h1>
        <p>The canonical DWMY market universe. Every instrument inherits the same Day / Week / Month / Year discussion clock.</p>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter symbols, markets, or groups..."
        />
      </div>

      {loading && <div className="market-directory-state">Loading market directory...</div>}
      {error && <div className="market-directory-state market-directory-error">{error}</div>}

      {!loading && !error && visibleSections.map((section) => (
        <section className="directory-section" key={section.id}>
          <div className="directory-section-heading">
            <div>
              <span className="type-label">MARKET</span>
              <h2>{section.name}</h2>
            </div>
            <p>{section.description}</p>
          </div>

          <div className="directory-groups">
            {section.buckets.map((group) => (
              <div className="directory-group" key={group.id}>
                <h3>{group.name}</h3>
                <div className="directory-instruments">
                  {group.instruments.map((instrument) => (
                    <button key={instrument.id} onClick={() => openInstrument(section, instrument)}>
                      <span>
                        <strong>{instrument.symbol}</strong>
                        <small>{instrument.name}</small>
                      </span>
                      <span>&gt;</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {!loading && !error && !visibleSections.length && (
        <div className="market-directory-state">No markets match that filter.</div>
      )}
    </section>
  );
}
