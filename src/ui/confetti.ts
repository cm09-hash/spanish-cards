/**
 * A short burst of confetti, drawn on a see-through canvas laid over the whole screen.
 * Home-made and tiny on purpose: no library needed.
 */
import { motionAllowed } from './motion';

const COLOURS = ['#2f6b5e', '#74c2ac', '#e0a03c', '#d9705f', '#5b8fd0', '#f2d06b'];
const PIECES = 110;
const DURATION_MS = 2800;

interface Piece {
  x: number;
  y: number;
  speedX: number;
  speedY: number;
  size: number;
  angle: number;
  spin: number;
  colour: string;
}

/**
 * Starts the confetti. Returns a function that stops it early and tidies up
 * (it also tidies up by itself when the burst is over).
 * With Reduce Motion on, nothing is shown.
 */
export function launchConfetti(): () => void {
  if (!motionAllowed()) return () => undefined;

  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);

  const width = window.innerWidth;
  const height = window.innerHeight;
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = width * scale;
  canvas.height = height * scale;
  const pen = canvas.getContext('2d');
  if (!pen) {
    canvas.remove();
    return () => undefined;
  }
  pen.scale(scale, scale);

  // Two bursts, thrown up and inwards from the lower corners of the screen.
  const pieces: Piece[] = Array.from({ length: PIECES }, (_, index) => {
    const fromLeft = index % 2 === 0;
    const angle = -(Math.PI / 180) * (40 + Math.random() * 45); // 40° to 85° above the horizon
    const power = height * (0.01 + Math.random() * 0.012);
    return {
      x: fromLeft ? -10 : width + 10,
      y: height * 0.75,
      speedX: Math.cos(angle) * power * (fromLeft ? 1 : -1),
      speedY: Math.sin(angle) * power,
      size: 6 + Math.random() * 6,
      angle: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.4,
      colour: COLOURS[index % COLOURS.length],
    };
  });

  const startedAt = performance.now();
  let frame = 0;
  let previous = startedAt;

  function draw(now: number): void {
    const elapsed = now - startedAt;
    const step = Math.min((now - previous) / 16.7, 3); // 1 = one frame at 60 per second
    previous = now;

    pen!.clearRect(0, 0, width, height);
    pen!.globalAlpha = Math.min(1, (DURATION_MS - elapsed) / 600); // fade out at the end
    for (const piece of pieces) {
      piece.speedY += 0.22 * step; // gravity
      piece.speedX *= 1 - 0.012 * step; // air
      piece.x += piece.speedX * step;
      piece.y += piece.speedY * step;
      piece.angle += piece.spin * step;

      pen!.save();
      pen!.translate(piece.x, piece.y);
      pen!.rotate(piece.angle);
      pen!.fillStyle = piece.colour;
      // Squashing the height over time makes the pieces look like they flutter.
      pen!.fillRect(-piece.size / 2, -piece.size / 4, piece.size, (piece.size / 2) * Math.cos(piece.angle * 2));
      pen!.restore();
    }

    if (elapsed < DURATION_MS) frame = requestAnimationFrame(draw);
    else canvas.remove();
  }
  frame = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(frame);
    canvas.remove();
  };
}
