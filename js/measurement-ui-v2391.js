/* v23.9.1 - measurement UI race/render fix
 * Keeps the v23.8 measurement engine and v23.9 physics correction intact.
 * Fixes:
 *  - v23.8 asynchronously changing the title back to "v23.8".
 *  - measurement pieces being invisible after the modal is hidden.
 */
(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  if (params.get('debug') !== 'on') return;

  let measuring = false;
  let measurementPieces = [];
  let renderStepInstalled = false;

  function hideModal() {
    const modal = document.getElementById('modeModal');
    if (modal) modal.classList.add('hidden');
  }

  function setTitle() {
    const title = document.querySelector('.measurementTitle');
    if (title) title.textContent = '物理挙動デバッグ v23.9.1';
    const status = document.getElementById('measurementStatus');
    if (status && !measuring && !status.textContent.includes('計測中') &&
        !status.textContent.includes('計測完了') &&
        !status.textContent.includes('完了。')) {
      if (status.textContent.includes('v23.8')) {
        status.textContent = status.textContent.replace(/v23\.8/g, 'v23.9.1');
      }
    }
  }

  function installPieceTracking() {
    if (typeof Piece === 'undefined' || typeof Piece.create !== 'function') return;
    if (Piece.create.__v2391Wrapped) return;

    const originalCreate = Piece.create;
    const wrapped = function(...args) {
      const piece = originalCreate.apply(this, args);
      if (measuring && piece && piece.body) {
        measurementPieces.push(piece);
      }
      return piece;
    };
    wrapped.__v2391Wrapped = true;
    Piece.create = wrapped;
  }

  function installMeasurementRenderer() {
    if (renderStepInstalled) return;
    if (typeof Physics === 'undefined' || typeof Physics.step !== 'function') return;
    if (typeof Renderer === 'undefined') return;

    const originalStep = Physics.step;
    Physics.step = function(dt) {
      originalStep(dt);
      if (!measuring) return;

      // The v23.8 measurement loop advances Matter.js directly and does not
      // call the normal game renderer. Draw the current measurement piece so
      // that hiding the modal does not expose a blank canvas.
      try {
        Renderer.clear();

        const ground = (Physics.world && Physics.world.bodies || [])
          .find(b => b && b.isStatic && b.label === 'ground');

        if (ground) {
          Renderer.drawGround(
            ground.position.y,
            0,
            Renderer.width * 0.82
          );
        }

        const current = measurementPieces.length
          ? measurementPieces[measurementPieces.length - 1]
          : null;

        if (current && current.body && Physics.world &&
            Physics.world.bodies.includes(current.body)) {
          Renderer.drawPiece(current, 0);
        }
      } catch (_) {
        // Diagnostic UI must never break the measurement loop.
      }
    };

    renderStepInstalled = true;
  }

  function watchMeasurement() {
    installPieceTracking();
    installMeasurementRenderer();

    const status = document.getElementById('measurementStatus');
    const download = document.getElementById('measurementDownload');
    const button = document.getElementById('measurementButton');
    if (!status || !download || !button) return;

    setTitle();

    let lastStatus = '';
    const observer = new MutationObserver(() => {
      setTitle();

      const text = status.textContent || '';
      if (text === lastStatus) return;
      lastStatus = text;

      if (text.includes('計測開始') || text.includes('計測中')) {
        measuring = true;
        measurementPieces = [];
        hideModal();
      }

      if (text.includes('計測完了') || text.includes('完了。')) {
        measuring = false;

        const m = text.match(/run\s+(\d+)/i);
        if (m) download.download = `${m[1]}.zip`;
        download.textContent = m ? `run ${m[1]} の計測ZIPを保存` : '計測ZIPを保存';

        setTimeout(() => {
          if (download.href && !download.classList.contains('hidden')) {
            download.click();
          }
        }, 150);
      }
    });

    observer.observe(status, {
      childList: true,
      characterData: true,
      subtree: true
    });

    // Capture the click before v23.8's listener runs.
    document.addEventListener('click', event => {
      const target = event.target && event.target.closest
        ? event.target.closest('#measurementButton')
        : null;
      if (target) {
        measuring = true;
        measurementPieces = [];
        hideModal();
      }
    }, true);

    // v23.8 replaces the measurement button after asset discovery. Retry
    // wrapping Piece.create/Physics.step after that asynchronous phase.
    const retry = setInterval(() => {
      installPieceTracking();
      installMeasurementRenderer();
      setTitle();

      const currentStatus = status.textContent || '';
      if (currentStatus.includes('計測完了') || currentStatus.includes('完了。')) {
        clearInterval(retry);
      }
    }, 100);

    window.addEventListener('beforeunload', () => clearInterval(retry), {once:true});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchMeasurement);
  } else {
    watchMeasurement();
  }
})();
