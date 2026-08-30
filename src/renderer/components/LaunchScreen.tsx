interface Props { started: boolean; onComplete(): void; }

export function LaunchScreen({ started, onComplete }: Props) {
  return <div className={`launch-screen ${started ? 'running' : 'waiting'}`} role="status" aria-label="Local is opening" onAnimationEnd={(event) => { if (event.target === event.currentTarget) onComplete(); }}>
    <div className="launch-stage">
      <span className="launch-aura" aria-hidden="true" />
      <div className="launch-wordmark" aria-label="Local.">
        <span className="launch-wordmark-black" aria-hidden="true">Local.</span>
        <span className="launch-wordmark-gradient" aria-hidden="true">Local.</span>
      </div>
      <p>Where your information is actually secure</p>
    </div>
  </div>;
}
