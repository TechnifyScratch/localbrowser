const adBlockEnabled = process.argv.includes('--local-adblock=1');

if (adBlockEnabled && isYouTube(location.hostname)) installYouTubeAdCleanup();

function isYouTube(hostname: string): boolean {
  return hostname === 'youtube.com' || hostname.endsWith('.youtube.com') || hostname === 'youtu.be';
}

function installYouTubeAdCleanup(): void {
  const marker = '__localYouTubeAdCleanup';
  const page = window as unknown as Record<string, unknown>;
  if (page[marker]) return;
  page[marker] = true;

  const adSelectors = [
    '#masthead-ad', '#player-ads', '.video-ads', '.ytp-ad-overlay-container',
    '.ytp-ad-message-container', '.ytp-ad-player-overlay',
    'ytd-ad-slot-renderer', 'ytd-display-ad-renderer', 'ytd-in-feed-ad-layout-renderer',
    'ytd-promoted-sparkles-web-renderer', 'ytd-promoted-video-renderer',
    'ytd-player-legacy-desktop-watch-ads-renderer', 'ytm-promoted-sparkles-web-renderer',
  ];
  const skipSelectors = [
    '.ytp-ad-skip-button-modern', '.ytp-ad-skip-button', '.ytp-skip-ad-button',
    'button[id^="skip-button"]', '.ytp-ad-skip-button-container button',
  ];

  const clean = () => {
    for (const selector of adSelectors) document.querySelectorAll<HTMLElement>(selector).forEach((element) => element.remove());
    for (const selector of skipSelectors) document.querySelectorAll<HTMLButtonElement>(selector).forEach((button) => button.click());
    const player = document.querySelector('.html5-video-player.ad-showing');
    const video = player?.querySelector('video');
    if (video && Number.isFinite(video.duration) && video.duration > 0) video.currentTime = video.duration;
  };

  const start = () => {
    const style = document.createElement('style');
    style.id = 'local-youtube-ad-cleanup';
    style.textContent = `${adSelectors.join(',')} { display: none !important; visibility: hidden !important; }`;
    (document.head || document.documentElement).append(style);
    clean();
    new MutationObserver(clean).observe(document.documentElement, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
    window.setInterval(clean, 750);
  };

  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
}
