import { useEffect, useRef } from 'react';
import { reduceMotion } from '../../lib/motion.js';

const PARTICLE_COUNT = 46;
const LINK_DISTANCE = 130;
const SPEED = 0.18;

/**
 * Ambient drifting-dot canvas — the literal technique the reference site
 * uses (a full-viewport canvas of slowly-moving points, lightly linked when
 * close together), not just an approximation via CSS blur.
 *
 * Deliberately reserved for public, first-impression pages only (mounted
 * from `AmbientBackground`'s `hero` variant): a persistent `requestAnimationFrame`
 * loop is real, continuous CPU/GPU cost, worth paying once on a landing page
 * a visitor looks at for a few seconds — not on a staff dashboard someone
 * keeps open, scrolling a data table, for hours.
 *
 * Renders one static frame and stops when `prefers-reduced-motion` is set,
 * rather than not rendering at all — the ambient dots are still part of the
 * page's visual texture, they just don't move.
 */
export default function ParticleCanvas({ className }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let frame = null;
    let cancelled = false;

    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * SPEED,
      vy: (Math.random() - 0.5) * SPEED,
    }));

    function resize() {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);

      const points = particles.map((p) => ({ x: p.x * width, y: p.y * height }));

      ctx.strokeStyle = 'rgba(79, 110, 247, 0.12)';
      ctx.lineWidth = 1;
      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          const dx = points[i].x - points[j].x;
          const dy = points[i].y - points[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist < LINK_DISTANCE) {
            ctx.globalAlpha = 1 - dist / LINK_DISTANCE;
            ctx.beginPath();
            ctx.moveTo(points[i].x, points[i].y);
            ctx.lineTo(points[j].x, points[j].y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = 'rgba(79, 110, 247, 0.45)';
      for (const point of points) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function step() {
      if (cancelled) return;
      for (const p of particles) {
        p.x += p.vx / width;
        p.y += p.vy / height;
        if (p.x < 0 || p.x > 1) p.vx *= -1;
        if (p.y < 0 || p.y > 1) p.vy *= -1;
        p.x = Math.min(1, Math.max(0, p.x));
        p.y = Math.min(1, Math.max(0, p.y));
      }
      draw();
      frame = requestAnimationFrame(step);
    }

    resize();
    draw();
    if (!reduceMotion) frame = requestAnimationFrame(step);

    const onResize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      resize();
      draw();
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className || 'absolute inset-0 h-full w-full'}
    />
  );
}
