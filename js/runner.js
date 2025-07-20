/* runner.js
 * Handles the FRAME runner
 */

"use strict";

const FRAME_WIN_W = 64;
const FRAME_WIN_H = 64;

const FRAME_CANVAS_SCALE = 8;
const FRAME_CANVAS_W = FRAME_WIN_W * FRAME_CANVAS_SCALE;
const FRAME_CANVAS_H = FRAME_WIN_H * FRAME_CANVAS_SCALE;

/* The main FRAME VM class
 * Responsible for running FRAME programs
 */
class FrameVM {
  #canvas = null;
  #ctx = null;

  #registers = {};
  #stackPointer = 0;

  #program = null;

  constructor() {
    this.#initCanvas();
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
    this.#program = program;
  }

  /* Runs the VM */
  run() {
    this.reset();
  }

  /* Resets the VM */
  reset() {
    this.#initRegisters();
  }

  /* Stops the execution of the current program */
  stop() {
    if (this.#program === null) {
      return;
    }
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
  setStackPointer(to) {
    this.#stackPointer = to;
  }

  /* Returns the contents of the stack pointer */
  getStackPointer() {
    return this.#stackPointer;
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
  }
}

const frameVM = new FrameVM();

const runProgram = (program) => {
  frameVM.loadProgramAndRun(program);
};
