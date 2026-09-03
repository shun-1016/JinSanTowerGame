/* v19 - bootstrap */
(async()=>{
  try{
    await Game.init();
    Input.bind(Game);

    let last=performance.now();
    function loop(now){
      const dt=Math.min(0.033,(now-last)/1000);
      last=now;
      Game.update(dt);
      Game.render();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }catch(e){
    console.error("JinSanTowerGame v19:",e);
  }
})();
