/* runner.js
 * Handles the FRAME runner
 */

"use strict";

const FRAME_WIN_W = 64;
const FRAME_WIN_H = 64;

const FRAME_CANVAS_SCALE = 8;
const FRAME_CANVAS_W = FRAME_WIN_W * FRAME_CANVAS_SCALE;
const FRAME_CANVAS_H = FRAME_WIN_H * FRAME_CANVAS_SCALE;

const MEMORY_SIZE = 0xffff;

const ROM_START_ADDR = 0x0000;
const ROM_END_ADDR = 0xefff;

const RUN_INTERVAL = 100;

/* The main FRAME VM class
 * Responsible for running FRAME programs
 */
class FrameVM {
  #canvas;
  #ctx;

  #registers;
  #sp;
  #pc;

  #memory;

  #running;
  #runID;

  constructor() {
    this.#initCanvas();
    this.#initMemory();

    this.#registers = {};
    this.reset();
  }

  /* Loads a program into the VM and immediately runs it */
  loadProgramAndRun(program) {
    this.loadProgram(program);
    this.run();
  }

  /* Loads a program into the VM */
  loadProgram(program) {
    this.stop();
    this.reset();
    for (let i = ROM_START_ADDR; i < program.length && i < ROM_END_ADDR; i++) {
      this.#memory[i] = program[i];
    }
  }

  /* Runs the VM */
  run() {
    this.#running = true;
    this.#runID = setInterval(this.runCallback.bind(this), RUN_INTERVAL);
  }

  runCallback() {
    const op = this.#memory[this.#pc++];
    console.log(op);
  }

  /* Resets the VM */
  reset() {
    this.stop();
    this.#initRegisters();

    for (let i = 0; i < MEMORY_SIZE; i++) {
      this.#memory[i] = 0;
    }
  }

  /* Stops the execution of the current program */
  stop() {
    if (!this.#running) {
      return;
    }

    clearInterval(this.#runID);
    this.#runID = -1;

    this.#running = false;
  }

  /* Sets the register @r to the 8-bit value @to */
  setRegister(r, to) {
    this.#registers[r] = to;
  }

  /* Returns the contents of register @r */
  getRegister(r) {
    return this.#registers[r];
  }

  /* Sets the stack pointer to the 8-bit value @to */
  setSP(to) {
    this.#sp = to;
  }

  /* Returns the contents of the stack pointer */
  getSP() {
    return this.#sp;
  }

  /* Sets the program counter to the 8-bit value @to */
  setPC(to) {
    this.#pc = to;
  }

  /* Returns the contents of the program counter */
  getPC() {
    return this.#pc;
  }

  /* Initializes the HTML canvas */
  #initCanvas() {
    this.#canvas = document.getElementById("runner-canvas");
    this.#canvas.width = FRAME_CANVAS_W;
    this.#canvas.height = FRAME_CANVAS_H;

    this.#ctx = this.#canvas.getContext("2d");
    this.#ctx.scale(FRAME_CANVAS_SCALE, FRAME_CANVAS_SCALE);
    this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);

    this.#ctx.fillStyle = "green";
    this.#ctx.fillRect(8, 8, 8, 8);
  }

  /* Initializes the VM registers */
  #initRegisters() {
    for (let r = 0; r < 8; r++) {
      this.setRegister(r, 0);
    }

    this.setSP(0);
    this.setPC(0);
  }

  /* Initializes the VM memory */
  #initMemory() {
    this.#memory = new Uint32Array(MEMORY_SIZE);
  }
}

const frameVM = new FrameVM();

const runProgram = (program) => {
  frameVM.loadProgramAndRun(program);
};

const stopProgram = () => {
  frameVM.stop();
};
