// T0 — scaffold only. No game code.
// The done-condition for T0 is that `npm run dev` serves a page that renders.
// T1 replaces this with the fixed-timestep loop.

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app not found');

const canvas = document.createElement('canvas');
canvas.width = 1280;
canvas.height = 720;
app.appendChild(canvas);

const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2d context unavailable');

ctx.fillStyle = '#22262d';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = '#7d8794';
ctx.font = '20px system-ui, sans-serif';
ctx.textAlign = 'center';
ctx.fillText('D4Drive — T0 scaffold', canvas.width / 2, canvas.height / 2);
