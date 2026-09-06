/* v23.9 - debug measurement UI fixes
 * Works with the existing v23.8 measurement engine without changing its
 * measurement data. Hides the mode modal while measuring and automatically
 * saves the generated ZIP when the measurement completes.
 */
(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  if (params.get('debug') !== 'on') return;

  function hideModal() {
    const modal = document.getElementById('modeModal');
    if (modal) modal.classList.add('hidden');
  }

  function watchMeasurement() {
    const title = document.querySelector('.measurementTitle');
    if (title) title.textContent = '物理挙動デバッグ v23.9';
    const status = document.getElementById('measurementStatus');
    const download = document.getElementById('measurementDownload');
    const button = document.getElementById('measurementButton');
    if (!status || !download || !button) return;

    let lastStatus = '';
    const observer = new MutationObserver(() => {
      const text = status.textContent || '';
      if (text !== lastStatus) {
        lastStatus = text;
        if (text.includes('計測開始') || text.includes('計測中')) hideModal();
        if (text.includes('計測完了') || text.includes('完了。')) {
          // v23.8 creates the Blob URL and download attribute at completion.
          // Use the run number as the archive name so extraction produces the
          // expected run-number folder on platforms that derive it from the ZIP name.
          const m = text.match(/run\\s+(\\d+)/i);
          if (m) download.download = `${m[1]}.zip`;
          download.textContent = m ? `run ${m[1]} の計測ZIPを保存` : '計測ZIPを保存';

          setTimeout(() => {
            if (download.href && !download.classList.contains('hidden')) {
              download.click();
            }
          }, 150);
        }
      }
    });
    observer.observe(status, {childList:true, characterData:true, subtree:true});

    // v23.8 replaces the measurement button asynchronously after image
    // discovery. Capture the click in the capture phase so the modal is
    // hidden before the measurement starts, without replacing its listener.
    document.addEventListener('click', (event) => {
      const target = event.target && event.target.closest
        ? event.target.closest('#measurementButton') : null;
      if (target) hideModal();
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchMeasurement);
  } else {
    watchMeasurement();
  }
})();
