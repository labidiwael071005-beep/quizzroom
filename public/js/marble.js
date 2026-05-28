// public/js/marble.js — Canvas marbré animé (partagé entre toutes les pages)
(function initMarble() {
  const canvas = document.getElementById('marble-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const COLORS = [
    'rgba(108,63,207,',
    'rgba(249,115,22,',
    'rgba(139,92,246,',
    'rgba(251,146,60,',
    'rgba(76,29,149,',
  ];

  const blobs = Array.from({ length: 7 }, (_, i) => ({
    x:   Math.random() * window.innerWidth,
    y:   Math.random() * window.innerHeight,
    vx:  (Math.random() - 0.5) * 0.5,
    vy:  (Math.random() - 0.5) * 0.5,
    r:   Math.random() * 250 + 120,
    col: COLORS[i % COLORS.length],
  }));

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    blobs.forEach(b => {
      b.x += b.vx;
      b.y += b.vy;
      if (b.x < -b.r || b.x > canvas.width  + b.r) b.vx *= -1;
      if (b.y < -b.r || b.y > canvas.height + b.r) b.vy *= -1;

      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, b.col + '0.22)');
      g.addColorStop(1, b.col + '0)');
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
})();