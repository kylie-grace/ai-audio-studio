type AlertBannerProps = {
  tone: "info" | "warn" | "bad" | "ok";
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function AlertBanner({ tone, title, detail, actionLabel, onAction }: AlertBannerProps) {
  return (
    <div className={`alert-banner ${tone}`}>
      <div className="alert-banner-body">
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      {actionLabel && onAction ? (
        <button className="action-button" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
