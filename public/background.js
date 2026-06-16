export function startMeshBackground(canvas, options = {}) {
  if (!canvas) return () => {};

  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const config = {
    pointCount: options.pointCount ?? 44,
    maxDistance: options.maxDistance ?? 160,
    background: options.background ?? '#09060f',
    pointColor: options.pointColor ?? 'rgba(130, 196, 255, 0.9)',
    lineRgb: options.lineRgb ?? '110, 205, 255',
    glowColor: options.glowColor ?? 'rgba(95, 170, 255, 0.09)'
  };

  let rafId = 0;
  let width = 0;
  let height = 0;
  let points = [];
  let lastTime = 0;

  function resize() {
    width = canvas.width = Math.floor(window.innerWidth * window.devicePixelRatio);
    height = canvas.height = Math.floor(window.innerHeight * window.devicePixelRatio);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    points = Array.from({ length: config.pointCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.12 * window.devicePixelRatio,
      vy: (Math.random() - 0.5) * 0.12 * window.devicePixelRatio,
      radius: 1 + Math.random() * 1.8
    }));
  }

  function drawPoint(point) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function frame(now) {
    const delta = Math.min(32, now - lastTime || 16);
    lastTime = now;

    ctx.fillStyle = config.background;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      0,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.65
    );
    glow.addColorStop(0, config.glowColor);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    for (const point of points) {
      point.x += point.vx * delta;
      point.y += point.vy * delta;

      if (point.x < -40 || point.x > width + 40) point.vx *= -1;
      if (point.y < -40 || point.y > height + 40) point.vy *= -1;

      point.x = Math.max(-40, Math.min(width + 40, point.x));
      point.y = Math.max(-40, Math.min(height + 40, point.y));
    }

    ctx.lineWidth = 1 * window.devicePixelRatio;
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i];
        const b = points[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist > config.maxDistance * window.devicePixelRatio) continue;

        const alpha = 1 - dist / (config.maxDistance * window.devicePixelRatio);
        ctx.strokeStyle = `rgba(${config.lineRgb}, ${(alpha * 0.24).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    ctx.fillStyle = config.pointColor;
    for (const point of points) {
      drawPoint(point);
    }

    rafId = window.requestAnimationFrame(frame);
  }

  resize();
  rafId = window.requestAnimationFrame(frame);
  window.addEventListener('resize', resize);

  return () => {
    window.cancelAnimationFrame(rafId);
    window.removeEventListener('resize', resize);
  };
}
