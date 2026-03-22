type DawStatusCardProps = {
  daw: string;
  connected: boolean;
  lastSeen?: string | null;
  detail?: string;
};

export function DawStatusCard({ daw, connected, lastSeen, detail }: DawStatusCardProps) {
  return (
    <article className={`daw-status-card ${connected ? "daw-status-card--connected" : "daw-status-card--disconnected"}`}>
      <div className="workflow-header">
        <span className="t-kicker">{daw}</span>
        <span className={`status-dot ${connected ? "status-dot--green" : "status-dot--red"}`} aria-hidden="true" />
      </div>
      <strong>{connected ? "Connected" : "Disconnected"}</strong>
      <p className="panel-note">{detail ?? (connected ? "Execution surface is available to the control room." : "No live execution handshake is reported right now.")}</p>
      {lastSeen ? <span className="t-caption">Last seen: {lastSeen}</span> : null}
    </article>
  );
}
