/* Consent-gated Google Tag Manager bootstrap, executed in the document head. */
(() => {
  const gtmMeta = document.querySelector('meta[name="watair-gtm"]');
  const gtmId = gtmMeta?.content || '';
  const validGtm = /^GTM-[A-Z0-9]{4,20}$/.test(gtmId);
  if (!validGtm || gtmMeta.dataset.disabled === 'true') return;
  const storageKey = 'watair_cookie_consent_gtm_v1_' + gtmId;
  let gtmLoaded = false;
  const applyGtm = choice => {
    if (!validGtm || gtmMeta?.dataset.disabled === 'true') return;
    const allowed = choice?.analytics === true && choice?.marketing === true;
    if (!allowed && gtmLoaded) {
      // Stop subsequent tags by reloading without the container after saving the new choice.
      (function(){ window.dataLayer.push(arguments); })('consent','update',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
      window.location.reload();
      return;
    }
    if (!allowed || gtmLoaded) return;
    gtmLoaded = true;
    window.dataLayer = window.dataLayer || [];
    function gtag(){ window.dataLayer.push(arguments); }
    gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
    gtag('consent','update',{analytics_storage:'granted',ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted'});
    window.dataLayer.push({'gtm.start':Date.now(),event:'gtm.js'});
    const script = document.createElement('script');
    script.async = true;
    script.src = gtmMeta.dataset.src;
    document.head.appendChild(script);
  };

  window.addEventListener('watair:consent', event => applyGtm(event.detail));
  try {
    applyGtm(JSON.parse(localStorage.getItem(storageKey) || 'null'));
  } catch {}
})();
