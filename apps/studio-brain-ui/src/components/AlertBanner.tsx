type AlertBannerProps = {
  tone: "info" | "warn" | "bad" | "ok";
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
  dismissLabel?: string;
  onDismiss?: () => void;
};

export function AlertBanner({ tone, title, detail, actionLabel, onAction, dismissLabel = "dismiss", onDismiss }: AlertBannerProps) {
  return (
    <div className={`alert-banner ${tone}`}>
      <div className="alert-banner-body">
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      <div className="alert-banner-actions">
        {actionLabel && onAction ? (
          <button className="action-button ghost" type="button" onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
        {onDismiss ? (
          <button className="alert-banner-dismiss" type="button" onClick={onDismiss} aria-label={dismissLabel}>
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}
