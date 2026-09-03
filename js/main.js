/* Entry point */
(async function () {
  const canvas=document.getElementById('gameCanvas');
  Renderer.init(canvas);
  Physics.init(Renderer.width, Renderer.height);
  Physics.world = Physics.engine.world;
  await Game.init();
  Input.init(Game);
  let last=performance.now();
  function loop(now){
    const dt=Math.min(33,now-last); last=now;
    Physics.update(dt); Game.update(dt/1000); Renderer.draw(Game);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
