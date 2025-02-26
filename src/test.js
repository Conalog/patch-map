(async () => {
  const app = new PIXI.Application();
  await app.init({ background: '#1099bb' });
  document.body.appendChild(app.canvas);

  const texture = createTexture(app.renderer);

  for (let i = 0; i < 25; i++) {
    const bunny = new Sprite(texture);

    bunny.x = (i % 5) * 40;
    bunny.y = Math.floor(i / 5) * 40;
    container.addChild(bunny);
  }
})();
