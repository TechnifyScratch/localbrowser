import { Icon } from '../components/Icon';

export function Onboarding({ onComplete }: { onComplete(): void }) {
  return <main className="onboarding">
    <div className="onboarding-mark"><img src="./local-mark.svg" alt="Local" /></div>
    <div className="onboarding-copy"><p className="eyebrow">LOCAL</p><h1>Local.</h1><h2>A browser that’s yours.</h2><p>No account. No analytics. No browsing data sent to us.</p><button className="primary" onClick={onComplete}>Start browsing <Icon name="arrow-right" size={17} /></button><small>Websites you visit still communicate with their own servers.</small></div>
  </main>;
}
