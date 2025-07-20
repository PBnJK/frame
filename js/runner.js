/* runner.js
 * Handles the FRAME runner
 */

"use strict";

const FRAME_WIN_W = 64;
const FRAME_WIN_H = 64;

const FRAME_CANVAS_SCALE = 8;
const FRAME_CANVAS_W = FRAME_WIN_W * FRAME_CANVAS_SCALE;
const FRAME_CANVAS_H = FRAME_WIN_H * FRAME_CANVAS_SCALE;

const MEMORY_SIZE = 0xffff + 1;

const RUN_INTERVAL = 100;

const START_ADDR = 0xfffe;

const Flag = {
  CONDITIONAL: Symbol("Conditional"),
  CARRY: Symbol("Carry"),
};

/* The main FRAME VM class
 * Responsible for running FRAME programs
 */
class FrameVM {
  #canvas;
  #ctx;

  #registers;
  #sp;
  #pc;

  #flags;

  #memory;

  #running;
  #runID;

  #instructions;

  constructor() {
    this.#initCanvas();
    this.#initMemory();
    this.#initInstructions();
    this.#initFlags();

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
    for (let i = 0; i < MEMORY_SIZE; i++) {
      this.setMemory(i, program[i]);
    }
  }

  /* Runs the VM */
  run() {
    this.setPC(this.getMemory16(START_ADDR));

    this.#running = true;
    this.#runID = setInterval(this.runCallback.bind(this), RUN_INTERVAL);
  }

  /* Executes a single instruction */
  runCallback() {
    this.#printState();

    const instruction = this.fetchNext();
    const [opcode, mode] = this.#parseInstruction(instruction);

    console.log("exec:", instruction, opcode, mode);

    const callback = this.#instructions[opcode];
    callback(mode);
  }

  /* Fetches the next byte */
  fetchNext() {
    const next = this.getMemory(this.#pc++);
    this.#pc &= 0xffff;

    return next;
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

  /* Sets a value in memory */
  setMemory(addr, to) {
    this.#memory[addr] = to;
  }

  /* Sets a 16-bit value in memory */
  setMemory16(addr, lo, hi) {
    this.#memory[addr++] = hi;
    this.#memory[addr] = lo;
  }

  /* Gets a value from memory */
  getMemory(addr) {
    return this.#memory[addr];
  }

  /* Gets a 16-bit value from memory */
  getMemory16(addr) {
    const hi = this.#memory[addr++];
    const lo = this.#memory[addr];
    return hi | (lo << 8);
  }

  /* Sets the register @r to the 8-bit value @to */
  setRegister(r, to) {
    this.#registers[r] = to & 0xff;
  }

  /* Returns the contents of register @r */
  getRegister(r) {
    return this.#registers[r];
  }

  /* Sets the stack pointer */
  setSP(to) {
    this.#sp = to & 0xff;
  }

  /* Returns the contents of the stack pointer */
  getSP() {
    return this.#sp;
  }

  /* Sets the program counter */
  setPC(to) {
    this.#pc = to & 0xffff;
  }

  /* Returns the contents of the program counter */
  getPC() {
    return this.#pc;
  }

  /* Sets a flag */
  setFlag(flag, to) {
    this.#flags.set(flag, to);
  }

  /* Returns the value of a flag */
  getFlag(flag) {
    return this.#flags.get(flag);
  }

  /* Pushes a value to the stack */
  pushToStack(to) {
    this.setMemory(this.getSP(), to);
    this.#sp++;
  }

  /* Pops a value from the stack */
  popFromStack() {
    this.#sp--;
    return this.getMemory(this.getSP());
  }

  /* Initializes the HTML canvas */
  #initCanvas() {
    this.#canvas = document.getElementById("runner-canvas");
    this.#canvas.width = FRAME_CANVAS_W;
    this.#canvas.height = FRAME_CANVAS_H;

    this.#ctx = this.#canvas.getContext("2d");
    this.#ctx.scale(FRAME_CANVAS_SCALE, FRAME_CANVAS_SCALE);
    this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
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
    this.#memory = new Uint8Array(MEMORY_SIZE);
  }

  /* Initializes the instruction callbacks */
  #initInstructions() {
    this.#instructions = {
      [Opcode.HLT]: () => {
        this.stop();
      },
      [Opcode.MOV]: (mode) => {
        if (mode === Mode.AB) {
          const [a, b] = this.#getArgsAB();
          this.setRegister(a, this.getRegister(b));
        } else {
          const [a, k] = this.#getArgsAK();
          this.setRegister(a, k);
        }
      },
      [Opcode.JMP]: (_) => {
        const k = this.#getArgsK();
        this.setPC(k);
      },
      [Opcode.JMPC]: (_) => {
        if (this.getFlag(Flag.CONDITIONAL) !== 0) {
          const k = this.#getArgsK();
          this.setPC(k);
        }
      },
      [Opcode.EQU]: (mode) => {
        if (mode === Mode.AB) {
          const [a, b] = this.#getArgsAB();
          const eq = this.getRegister(a) === this.getRegister(b) ? 1 : 0;
          this.setFlag(Flag.CONDITIONAL, eq);
        } else {
          const [a, k] = this.#getArgsAK();
          const eq = this.getRegister(a) === k ? 1 : 0;
          this.setFlag(Flag.CONDITIONAL, eq);
        }
      },
      [Opcode.NOT]: (mode) => {
        switch (mode) {
          case Mode.O: {
            const c = this.getFlag(Flag.CONDITIONAL);
            this.setFlag(Flag.CONDITIONAL, c === 0 ? 1 : 0);
            break;
          }
          case Mode.AB: {
            const [a, b] = this.#getArgsAB();
            const c = this.getRegister(b) === 0 ? 1 : 0;
            this.setRegister(a, c);
            break;
          }
          case Mode.AK: {
            const [a, k] = this.#getArgsAK();
            const c = k === 0 ? 1 : 0;
            this.setRegister(a, c);
            break;
          }
        }
      },
      [Opcode.ADD]: (mode) => {
        if (mode === Mode.ABC) {
          const [a, b, c] = this.#getArgsABC();
          const result = this.#addWithCarry(
            this.getRegister(b),
            this.getRegister(c),
          );
          this.setRegister(a, result);
        } else {
          const [a, b, k] = this.#getArgsABK();
          const result = this.#addWithCarry(this.getRegister(b), k);
          this.setRegister(a, result);
        }
      },
      [Opcode.CALL]: () => {
        const pc = this.getPC();

        const lo = pc & 0xff;
        this.pushToStack(lo);

        const hi = (pc >> 8) & 0xff;
        this.pushToStack(hi);

        const kk = this.#getArgsKK();
        this.setPC(kk);
      },
      [Opcode.RET]: () => {
        const hi = this.popFromStack();
        const lo = this.popFromStack();

        const returnAddress = lo | (hi << 8);
        console.log(hi, lo, returnAddress);
        this.setPC(returnAddress);
      },
    };

    Object.keys(this.#instructions).forEach((k) =>
      this.#instructions[k].bind(this),
    );
  }

  #addWithCarry(a, b) {
    const result = a + b;
    if (result >= 0x100) {
      this.setFlag(Flag.CARRY, 1);
    } else {
      this.setFlag(Flag.CARRY, 0);
    }

    return result & 0xff;
  }

  /* Initializes the flags */
  #initFlags() {
    this.#flags = new Map();

    this.setFlag(Flag.CONDITIONAL, 0);
    this.setFlag(Flag.CARRY, 0);
  }

  /* Prints the internal state of the VM */
  #printState() {
    console.log("# STATE START #");
    for (let i = 0; i < 8; i++) {
      console.log(`r${i}: ${this.getRegister(i)}`);
    }

    console.log(`sp: ${this.getSP()}`);
    console.log(`pc: ${this.getPC()}`);
    console.log("# STATE END #");
  }

  /* Breaks down an instruction into opcode, mode and arguments */
  #parseInstruction(i) {
    return [this.#getInstructionOpcode(i), this.#getInstructionMode(i)];
  }

  /* Gets the opcode of the instruction */
  #getInstructionOpcode(i) {
    return i & 0x1f;
  }

  /* Gets the mode of the instruction */
  #getInstructionMode(i) {
    return (i >> 5) & 0x7;
  }

  /* Gets register A from the arguments */
  #getArgsA() {
    const next = this.fetchNext();
    return next & 0x7;
  }

  /* Gets the argument for a K instruction */
  #getArgsK() {
    return this.fetchNext();
  }

  /* Gets the argument for a KK instruction */
  #getArgsKK() {
    const lo = this.fetchNext();
    const hi = this.fetchNext();

    return lo | (hi << 8);
  }

  /* Gets the arguments for an AB instruction */
  #getArgsAB() {
    const next = this.fetchNext();
    const a = next & 0x7;
    const b = (next >> 3) & 0x7;

    return [a, b];
  }

  /* Gets the arguments for an AK instruction */
  #getArgsAK() {
    const next = this.fetchNext();
    const a = next & 0x7;

    const k = this.fetchNext();
    return [a, k];
  }

  /* Gets the arguments for an ABC instruction */
  #getArgsABC() {
    const next = this.fetchNext();
    const a = next & 0x7;
    const b = (next >> 3) & 0x7;

    const next2 = this.fetchNext();
    const c = next2 & 0x7;
    return [a, b, c];
  }

  /* Gets the arguments for an ABK instruction */
  #getArgsABK() {
    const next = this.fetchNext();
    const a = next & 0x7;
    const b = (next >> 3) & 0x7;

    const k = this.fetchNext();
    return [a, b, k];
  }
}

const frameVM = new FrameVM();

const runProgram = (program) => {
  frameVM.loadProgramAndRun(program);
};

const stopProgram = () => {
  frameVM.stop();
};
