/* runner.js
 *
 * Handles the FRAME runner
 */

const FRAME_WIN_W = 64;
const FRAME_WIN_H = 64;

const FRAME_CANVAS_SCALE = 8;
const FRAME_CANVAS_W = FRAME_WIN_W * FRAME_CANVAS_SCALE;
const FRAME_CANVAS_H = FRAME_WIN_H * FRAME_CANVAS_SCALE;

let canvas = null;
let ctx = null;

const runnerInitCanvas = () => {
  canvas = document.getElementById("runner-canvas");
  canvas.width = FRAME_CANVAS_W;
  canvas.height = FRAME_CANVAS_H;

  ctx = canvas.getContext("2d");
  ctx.scale(FRAME_CANVAS_SCALE, FRAME_CANVAS_SCALE);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "green";
  ctx.fillRect(8, 8, 8, 8);
};

const runnerInit = () => {
  runnerInitCanvas();
};

runnerInit();
