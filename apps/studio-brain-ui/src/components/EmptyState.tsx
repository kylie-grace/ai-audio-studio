type EmptyStateProps = {
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ title, detail, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon" aria-hidden="true">
        ○
      </span>
      <strong>{title}</strong>
      <p className="t-body empty-state__message">{detail}</p>
      {actionLabel && onAction ? (
        <button className="action-button btn" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
