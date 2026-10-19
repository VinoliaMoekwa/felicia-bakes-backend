(() => {
  const dialog=document.getElementById('installDialog');
  const install=document.getElementById('installApp');
  let installPrompt=null;
  document.querySelectorAll('[data-install-help]').forEach(button=>button.addEventListener('click',()=>dialog.showModal()));
  document.getElementById('closeInstall').addEventListener('click',()=>dialog.close());
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;install.hidden=false;});
  install.addEventListener('click',async()=>{if(!installPrompt)return;const prompt=installPrompt;installPrompt=null;install.hidden=true;await prompt.prompt();await prompt.userChoice;});
  window.addEventListener('appinstalled',()=>{installPrompt=null;install.hidden=true;if(dialog.open)dialog.close();});
  if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='127.0.0.1' || location.hostname==='localhost')) {
    navigator.serviceWorker.register('/admin/sw.js',{scope:'/admin/',updateViaCache:'none'}).catch(()=>{/* The online dashboard remains usable when installation is unavailable. */});
  }
})();
