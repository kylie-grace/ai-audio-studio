type TabItem = {
  id: string;
  label: string;
  summary: string;
  accent: string;
};

type PrimaryTabStripProps = {
  tabs: TabItem[];
  activeTab: string;
  onSelect: (tabId: string) => void;
  badgeCounts?: Record<string, number>;
};

export function PrimaryTabStrip({ tabs, activeTab, onSelect, badgeCounts = {} }: PrimaryTabStripProps) {
  return (
    <nav className="tab-strip" aria-label="Primary control surfaces">
      {tabs.map((tab) => {
        const badgeCount = badgeCounts[tab.id] ?? 0;
        return (
          <button
            key={tab.id}
            type="button"
            className={`tab-button ${tab.accent} ${activeTab === tab.id ? "is-active" : ""}`}
            onClick={() => onSelect(tab.id)}
          >
            <span className="tab-label-row">
              <span className="tab-label">{tab.label}</span>
              {badgeCount > 0 ? <span className="count-badge">{badgeCount > 99 ? "99+" : badgeCount}</span> : null}
            </span>
            <span className="tab-summary">{tab.summary}</span>
          </button>
        );
      })}
    </nav>
  );
}
