(() => {
  // Keep existing home-screen installs supported without showing install prompts.
  window.addEventListener('beforeinstallprompt',event=>event.preventDefault());
  if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='127.0.0.1' || location.hostname==='localhost')) {
    navigator.serviceWorker.register('/admin/sw.js',{scope:'/admin/',updateViaCache:'none'}).catch(()=>{/* The online dashboard remains usable when installation is unavailable. */});
  }
})();
