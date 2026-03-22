type EmptyStateProps = {
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ title, detail, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="empty-state-card">
      <span className="empty-state-icon" aria-hidden="true">
        ○
      </span>
      <strong>{title}</strong>
      <p>{detail}</p>
      {actionLabel && onAction ? (
        <button className="action-button" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
