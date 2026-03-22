import { useState, type ReactNode } from "react";

type CollapsibleSectionProps = {
  title: string;
  defaultOpen?: boolean;
  badge?: number;
  children: ReactNode;
};

export function CollapsibleSection({ title, defaultOpen = false, badge = 0, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`collapsible-section ${open ? "is-open" : "is-closed"}`}>
      <button type="button" className="collapsible-section__header" onClick={() => setOpen((current) => !current)}>
        <div className="collapsible-section__title-group">
          <span className="collapsible-section__chevron" aria-hidden="true">{open ? "▲" : "▼"}</span>
          <h3 className="t-h3">{title}</h3>
        </div>
        {!open && badge > 0 ? <span className="badge badge--alert">{badge}</span> : null}
      </button>
      {open ? <div className="collapsible-section__body">{children}</div> : null}
    </section>
  );
}
