/* runner.js
 * Handles the FRAME runner
 */

"use strict";

const Syscall = {};

const FRAME_WIN_W = 64;
const FRAME_WIN_H = 64;

const FRAME_CANVAS_SCALE = 8;
const FRAME_CANVAS_W = FRAME_WIN_W * FRAME_CANVAS_SCALE;
const FRAME_CANVAS_H = FRAME_WIN_H * FRAME_CANVAS_SCALE;

const MEMORY_SIZE = 0xffff + 1;

const RUN_INTERVAL = 16.777; /* Roughly 60FPS */
const CYCLES_PER_FRAME = 240;
const CYCLES_PER_INTERRUPT = Math.floor(CYCLES_PER_FRAME * 4);

const KERNEL_START_ADDR = 0xe000;
const INPUT_DATA_ADDR = 0xe700;
const TXT_CURSOR_POS = 0xe7bf;
const TXT_DATA_ADDR = 0xe7c0;
const FONT_START_ADDR = 0xe800;
const SCREEN_DATA_ADDR = 0xec00;

const INT_START_ADDR = 0xfffc;
const ROM_START_ADDR = 0xfffe;

const REG_COUNT = 16;
const SP = REG_COUNT + 1;

/* Kernel assembly code */
const KERNEL_SRC = `# The FRAME Kernel
# pedrob
#
# Register usage
#   $0-$7  Never used, user only
#   $8-$b  Subroutine arguments
#   $c-$d  Subroutine return values
#   $e-$f  General use, user should avoid

.addr 0xe000

# == TEXT MODE ==

# Moves the cursor X position
#   $8 : Position to move to
#
# Uses register $e
@ktxt_move_x
  mov $e, %e7bf      # Get cursor position
  and $e, 0b11111000 # Mask out X position
  and $8, 0b111      # Mask X position
  or $e, $8          # Set X position
  mov %e7bf, $e      # Save cursor position
  ret

# Moves the cursor Y position
#   $8 : Position to move to
#
# Uses register $e
@ktxt_move_y
  mov $e, %e7bf      # Get cursor position
  and $e, 0b11000111 # Mask out cursor Y position
  and $8, 0b111      # Mask the new Y position
  lsh $8, 3          # Shift the new Y position into place
  or $e, $8          # Update cursor Y position
  mov %e7bf, $e      # Save cursor position
  ret

# Clears the screen, leaving the cursor at the top-left
#
# Uses register $e
@ktxt_clear
  sei $0                  # Critical section (no interrupts)
  mov %e7bf, $0           # Set the cursor to the top-left
  push $8                 # Save register $8 on the stack
  mov $8, ' '             # Load $8 with the space character
  @_ktxt_clear_loop
    call @ktxt_putch      # Draw the character
    equ $e, $0            # Has cursor looped back to start?
    brf @_ktxt_clear_loop # If it hasn't, loop
  pop $8                  # Restore register $8
  sei                     # Exit critical section
  ret

# Prints a null-terminated string to the screen
#   $8 : LSB of the text address
#   $9 : MSB of the text address
#
# Uses register $e
@ktxt_print
  sei $0                  # Critical section (no interrupts)
  mov $e, $0              # Start at index 0
  mov 0xfe, $8            # Save LSB to %00fe
  mov 0xff, $9            # Save MSB to %00ff
  @_ktxt_print_loop
    mov $8, (0xfe), $e    # Get character
    equ $8, $0            # Is null-terminator?
    brt @_ktxt_print_f    # If so, exit
    push $e               # Saves the index
    call @ktxt_putch      # Draw the character
    pop $e                # Restores the index
    inc $e                # Advances the index
    jmp @_ktxt_print_loop # Loop
  @_ktxt_print_f
    sei                   # Exit critical section
    ret

# Prints a character to the screen, advancing the cursor
# $8 : ASCII character the be printed
@ktxt_putch
  sei $0            # Critical section (no interrupts)
  mov $e, %e7bf     # Load cursor position
  mov %e7c0, $e, $8 # Put the character on the buffer
  inc $e            # Advance the cursor
  and $e, 0b111111  # Mask the cursor so it wraps around
  mov %e7bf, $e     # Save the cursor position
  sei               # Exit critical section
  ret
`;

// prettier-ignore
const FONT_DATA = [
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* NUL */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* SOH */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* STX */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* ETX */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* EOT */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* ENQ */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* ACK */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* BEL */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* BS */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* HT */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* LF */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* VT */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* FF */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* CR */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* SO */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* SI */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* DLE */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* DC1 */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* DC2 */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* DC3 */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* DC4 */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* NAK */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* SYN */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* ETB */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* CAN */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* EM */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* SUB */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* ESC */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* FS */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* GS */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* RS */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* US */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* SP */
  0x00, 0x18, 0x18, 0x18, 0x18, 0x00, 0x18, 0x00, /* ! */
  0x00, 0x50, 0x50, 0x50, 0x00, 0x00, 0x00, 0x00, /* " */
  0x00, 0x24, 0x7e, 0x24, 0x24, 0x7e, 0x24, 0x00, /* # */
  0x00, 0x08, 0x1e, 0x3c, 0x0a, 0x3c, 0x08, 0x00, /* $ */
  0x00, 0x62, 0x64, 0x08, 0x10, 0x26, 0x46, 0x00, /* % */
  0x00, 0x10, 0x28, 0x10, 0x2a, 0x2c, 0x16, 0x00, /* & */
  0x00, 0x40, 0x40, 0x40, 0x00, 0x00, 0x00, 0x00, /* ' */
  0x00, 0x18, 0x30, 0x30, 0x30, 0x30, 0x18, 0x00, /* ( */
  0x00, 0x18, 0x0c, 0x0c, 0x0c, 0x0c, 0x18, 0x00, /* ) */
  0x00, 0x08, 0x3e, 0x1c, 0x22, 0x00, 0x00, 0x00, /* * */
  0x00, 0x08, 0x08, 0x3e, 0x08, 0x08, 0x00, 0x00, /* + */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x30, 0x30, 0x60, /* , */
  0x00, 0x00, 0x00, 0x3c, 0x00, 0x00, 0x00, 0x00, /* - */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x60, 0x60, 0x00, /* . */
  0x00, 0x06, 0x0c, 0x18, 0x30, 0x60, 0xc0, 0x00, /* / */
  0x00, 0x3c, 0x66, 0x76, 0x6e, 0x66, 0x3c, 0x00, /* 0 */
  0x00, 0x18, 0x38, 0x18, 0x18, 0x18, 0x3c, 0x00, /* 1 */
  0x00, 0x3c, 0x66, 0x0c, 0x18, 0x30, 0x7e, 0x00, /* 2 */
  0x00, 0x3c, 0x66, 0x0c, 0x06, 0x66, 0x3c, 0x00, /* 3 */
  0x00, 0x0c, 0x1c, 0x2c, 0x4c, 0x7e, 0x0c, 0x00, /* 4 */
  0x00, 0x7c, 0x60, 0x7c, 0x06, 0x66, 0x3c, 0x00, /* 5 */
  0x00, 0x3c, 0x60, 0x7c, 0x66, 0x66, 0x3c, 0x00, /* 6 */
  0x00, 0x7e, 0x66, 0x0c, 0x18, 0x18, 0x18, 0x00, /* 7 */
  0x00, 0x3c, 0x66, 0x3c, 0x66, 0x66, 0x3c, 0x00, /* 8 */
  0x00, 0x3c, 0x66, 0x66, 0x3e, 0x06, 0x3c, 0x00, /* 9 */
  0x00, 0x00, 0x60, 0x60, 0x00, 0x60, 0x60, 0x00, /* : */
  0x00, 0x00, 0x60, 0x60, 0x00, 0x60, 0x60, 0xc0, /* ; */
  0x00, 0x18, 0x30, 0x60, 0x30, 0x18, 0x00, 0x00, /* < */
  0x00, 0x00, 0x78, 0x00, 0x78, 0x00, 0x00, 0x00, /* = */
  0x00, 0x60, 0x30, 0x18, 0x30, 0x60, 0x00, 0x00, /* > */
  0x00, 0x3c, 0x66, 0x0c, 0x18, 0x00, 0x18, 0x00, /* ? */
  0x00, 0x3c, 0x66, 0x6e, 0x6e, 0x60, 0x3c, 0x00, /* @ */
  0x00, 0x3c, 0x66, 0x66, 0x7e, 0x66, 0x66, 0x00, /* A */
  0x00, 0x7c, 0x66, 0x7c, 0x66, 0x66, 0x7c, 0x00, /* B */
  0x00, 0x3c, 0x66, 0x60, 0x60, 0x66, 0x3c, 0x00, /* C */
  0x00, 0x7c, 0x66, 0x66, 0x66, 0x66, 0x7c, 0x00, /* D */
  0x00, 0x7e, 0x60, 0x7c, 0x60, 0x60, 0x7e, 0x00, /* E */
  0x00, 0x7e, 0x60, 0x7c, 0x60, 0x60, 0x60, 0x00, /* F */
  0x00, 0x3c, 0x66, 0x60, 0x6e, 0x66, 0x3c, 0x00, /* G */
  0x00, 0x66, 0x66, 0x7e, 0x66, 0x66, 0x66, 0x00, /* H */
  0x00, 0x7e, 0x18, 0x18, 0x18, 0x18, 0x7e, 0x00, /* I */
  0x00, 0x06, 0x06, 0x06, 0x06, 0x66, 0x3c, 0x00, /* J */
  0x00, 0x66, 0x66, 0x6c, 0x78, 0x6c, 0x66, 0x00, /* K */
  0x00, 0x60, 0x60, 0x60, 0x60, 0x60, 0x7e, 0x00, /* L */
  0x00, 0xc6, 0xee, 0xfe, 0xd6, 0xc6, 0xc6, 0x00, /* M */
  0x00, 0x66, 0x66, 0x76, 0x7e, 0x6e, 0x66, 0x00, /* N */
  0x00, 0x3c, 0x66, 0x66, 0x66, 0x66, 0x3c, 0x00, /* O */
  0x00, 0x7c, 0x66, 0x66, 0x7c, 0x60, 0x60, 0x00, /* P */
  0x00, 0x3c, 0x66, 0x66, 0x66, 0x6c, 0x36, 0x00, /* Q */
  0x00, 0x7c, 0x66, 0x66, 0x7c, 0x66, 0x66, 0x00, /* R */
  0x00, 0x3c, 0x66, 0x30, 0x0c, 0x66, 0x3c, 0x00, /* S */
  0x00, 0x7e, 0x18, 0x18, 0x18, 0x18, 0x18, 0x00, /* T */
  0x00, 0x66, 0x66, 0x66, 0x66, 0x66, 0x3c, 0x00, /* U */
  0x00, 0x66, 0x66, 0x66, 0x7e, 0x3c, 0x18, 0x00, /* V */
  0x00, 0xc6, 0xc6, 0xd6, 0xfe, 0xee, 0xc6, 0x00, /* W */
  0x00, 0xc6, 0x6c, 0x38, 0x38, 0x6c, 0xc6, 0x00, /* X */
  0x00, 0x66, 0x66, 0x66, 0x3c, 0x18, 0x18, 0x00, /* Y */
  0x00, 0x7e, 0x0c, 0x18, 0x30, 0x60, 0x7e, 0x00, /* Z */
  0x00, 0x38, 0x30, 0x30, 0x30, 0x30, 0x38, 0x00, /* [ */
  0x00, 0xc0, 0x60, 0x30, 0x18, 0x0c, 0x06, 0x00, /* \ */
  0x00, 0x38, 0x18, 0x18, 0x18, 0x18, 0x38, 0x00, /* ] */
  0x00, 0x18, 0x3c, 0x66, 0x00, 0x00, 0x00, 0x00, /* ^ */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7c, 0x00, /* _ */
  0x00, 0x60, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, /* ` */
  0x00, 0x00, 0x3c, 0x06, 0x3e, 0x66, 0x3e, 0x00, /* a */
  0x00, 0x60, 0x7c, 0x66, 0x66, 0x66, 0x7c, 0x00, /* b */
  0x00, 0x00, 0x3c, 0x66, 0x60, 0x66, 0x3c, 0x00, /* c */
  0x00, 0x06, 0x3e, 0x66, 0x66, 0x66, 0x3e, 0x00, /* d */
  0x00, 0x00, 0x3c, 0x66, 0x7e, 0x60, 0x3c, 0x00, /* e */
  0x00, 0x1c, 0x30, 0x7c, 0x30, 0x30, 0x30, 0x00, /* f */
  0x00, 0x00, 0x3e, 0x66, 0x66, 0x3e, 0x06, 0x7c, /* g */
  0x00, 0x60, 0x7c, 0x66, 0x66, 0x66, 0x66, 0x00, /* h */
  0x00, 0x18, 0x00, 0x38, 0x18, 0x18, 0x3c, 0x00, /* i */
  0x00, 0x18, 0x00, 0x38, 0x18, 0x18, 0x18, 0x30, /* j */
  0x00, 0x60, 0x66, 0x6c, 0x78, 0x6c, 0x66, 0x00, /* k */
  0x00, 0x18, 0x18, 0x18, 0x18, 0x18, 0x0c, 0x00, /* l */
  0x00, 0x00, 0xec, 0xfe, 0xd6, 0xc6, 0xc6, 0x00, /* m */
  0x00, 0x00, 0x7c, 0x66, 0x66, 0x66, 0x66, 0x00, /* n */
  0x00, 0x00, 0x3c, 0x66, 0x66, 0x66, 0x3c, 0x00, /* o */
  0x00, 0x00, 0x7c, 0x66, 0x66, 0x66, 0x7c, 0x60, /* p */
  0x00, 0x00, 0x3e, 0x66, 0x66, 0x66, 0x3e, 0x06, /* q */
  0x00, 0x00, 0x6c, 0x76, 0x60, 0x60, 0x60, 0x00, /* r */
  0x00, 0x00, 0x3e, 0x60, 0x3c, 0x06, 0x7c, 0x00, /* s */
  0x00, 0x18, 0x3c, 0x18, 0x18, 0x18, 0x0c, 0x00, /* t */
  0x00, 0x00, 0x66, 0x66, 0x66, 0x66, 0x3e, 0x00, /* u */
  0x00, 0x00, 0x66, 0x66, 0x7e, 0x3c, 0x18, 0x00, /* v */
  0x00, 0x00, 0xc6, 0xc6, 0xd6, 0xfe, 0xec, 0x00, /* w */
  0x00, 0x00, 0x66, 0x3c, 0x18, 0x3c, 0x66, 0x00, /* x */
  0x00, 0x00, 0x66, 0x66, 0x66, 0x3e, 0x06, 0x3c, /* y */
  0x00, 0x00, 0x7e, 0x0c, 0x18, 0x30, 0x7e, 0x00, /* z */
  0x30, 0x60, 0x60, 0xc0, 0x60, 0x60, 0x30, 0x00, /* { */
  0x00, 0x60, 0x60, 0x60, 0x60, 0x60, 0x60, 0x00, /* | */
  0x60, 0x30, 0x30, 0x18, 0x30, 0x30, 0x60, 0x00, /* } */
  0x00, 0x00, 0x00, 0x3a, 0x6c, 0x00, 0x00, 0x00, /* ~ */
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, /* DEL */
]

const analyserPC = document.getElementById("analyser-pc");
const analyserSP = document.getElementById("analyser-sp");

const analyserRegisters = [
  document.getElementById("analyser-r0"),
  document.getElementById("analyser-r1"),
  document.getElementById("analyser-r2"),
  document.getElementById("analyser-r3"),
  document.getElementById("analyser-r4"),
  document.getElementById("analyser-r5"),
  document.getElementById("analyser-r6"),
  document.getElementById("analyser-r7"),
  document.getElementById("analyser-r8"),
  document.getElementById("analyser-r9"),
  document.getElementById("analyser-ra"),
  document.getElementById("analyser-rb"),
  document.getElementById("analyser-rc"),
  document.getElementById("analyser-rd"),
  document.getElementById("analyser-re"),
  document.getElementById("analyser-rf"),
];

const analyserFlagCarry = document.getElementById("analyser-flag-carry");
const analyserFlagInterrupt = document.getElementById("analyser-flag-int");
const analyserFlagZero = document.getElementById("analyser-flag-zero");
const analyserFlagNegative = document.getElementById("analyser-flag-neg");

const analyserState = document.getElementById("analyser-state");

const Flag = {
  CARRY: Symbol("Carry"),
  INTERRUPT: Symbol("Interrupt"),
  ZERO: Symbol("Zero"),
  NEGATIVE: Symbol("Negative"),
};

/* The main FRAME VM class
 * Responsible for running FRAME programs
 */
class FrameVM {
  #canvas;
  #ctx;

  #registers;
  #pc;

  #flags;
  #input;

  #clock;
  #cyclesSinceInterrupt;
  #needsInterrupt;

  #memory;

  #running;
  #paused;
  #runID;

  #instructions;

  #kernelInfo;

  constructor() {
    this.#initCanvas();
    this.#initKeyboard();
    this.#initFlags();
    this.#initRegisters();
    this.#initMemory();
    this.#initInstructions();
    this.#initKernel();
    this.#initFont();

    this.#paused = false;

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

    const code = program.program;
    const main = program.main;

    for (let i = 0; i < KERNEL_START_ADDR; i++) {
      this.setMemory(i, code[i]);
    }

    /* Setup reset vector */
    const u = main >>> 0;
    const lo = u & 0xff;
    const hi = (u >> 8) & 0xff;
    this.setMemory16(ROM_START_ADDR, lo, hi);
  }

  /* Runs the VM */
  run() {
    this.setPC(this.getMemory16(ROM_START_ADDR));

    analyserState.innerText = "Running...";

    this.#running = true;
    this.#runID = setInterval(this.runCallback.bind(this), RUN_INTERVAL);
  }

  /* Stops the execution of the current program */
  stop() {
    if (!this.#running) {
      return;
    }

    this.#running = false;

    analyserState.innerText = "Stopped";

    clearInterval(this.#runID);
    this.#runID = -1;
  }

  /* Pauses/unpauses the execution of the current program */
  pause() {
    if (this.#running) {
      this.#paused = true;
      this.stop();
    } else {
      this.#paused = false;
      this.#running = true;
      analyserState.innerText = "Running...";

      this.#runID = setInterval(this.runCallback.bind(this), RUN_INTERVAL);
    }
  }

  /* Steps through a single instruction */
  step() {
    if (!this.#running && !this.#paused) {
      this.#running = true;
      this.pause();
      this.setPC(this.getMemory16(ROM_START_ADDR));
    } else if (!this.#paused) {
      this.pause();
    }

    this.cycle();
    if (this.#clock % CYCLES_PER_INTERRUPT === 0) {
      this.#draw();
      this.#triggerInterrupt();
    }
  }

  /* Returns if the program is stopped */
  isProgramPaused() {
    return this.#paused;
  }

  /* Called every frame */
  runCallback() {
    const target = this.#clock + CYCLES_PER_FRAME;
    while (this.#running && this.#clock < target) {
      if (
        this.#cyclesSinceInterrupt === CYCLES_PER_INTERRUPT &&
        this.getFlag(Flag.INTERRUPT)
      ) {
        this.#draw();
        this.#triggerInterrupt();
        this.#cyclesSinceInterrupt = 0;
      }

      this.cycle();
      this.#cyclesSinceInterrupt++;
    }
  }

  /* Executes a single CPU cycle */
  cycle() {
    this.#updateAnalyser();

    const instruction = this.fetchNext();
    const callback = this.#instructions[instruction];
    callback();
  }

  /* Fetches the next byte */
  fetchNext() {
    if (this.#pc === 0x30d) {
      console.log(
        "=>",
        this.#memory[this.#pc - 3],
        this.#memory[this.#pc - 2],
        this.#memory[this.#pc - 1],
        this.#memory[this.#pc],
        this.#memory[this.#pc + 1],
        this.#memory[this.#pc + 2],
        this.#memory[this.#pc + 3],
      );
    }
    const next = this.getMemory(this.#pc++);
    this.#pc &= 0xffff;

    this.#clock++;

    return next;
  }

  /* Resets the VM */
  reset() {
    this.stop();

    this.#clock = 0;
    this.#cyclesSinceInterrupt = 1;
    this.#needsInterrupt = false;

    for (let i = 0; i < KERNEL_START_ADDR; i++) {
      this.#memory[i] = 0;
    }

    for (let i = 0; i < REG_COUNT; i++) {
      this.setRegister(i, 0);
    }

    this.setPC(0);
    this.setSP(0);
  }

  /* Sets a value in memory */
  setMemory(addr, to) {
    const V = (to >>> 0) & 0xff;
    this.#memory[addr] = V;
    this.#updateZeroAndNegative(V);
  }

  /* Sets a 16-bit value in memory */
  setMemory16(addr, lo, hi) {
    this.setMemory(addr++, lo);
    this.setMemory(addr, hi);
  }

  /* Gets a value from memory */
  getMemory(addr) {
    switch (addr) {
      case INPUT_DATA_ADDR:
        return this.#input;
      default:
        return this.#memory[addr];
    }
  }

  /* Gets a 16-bit value from memory */
  getMemory16(addr) {
    const lo = this.getMemory(addr++);
    const hi = this.getMemory(addr);
    return lo | (hi << 8);
  }

  /* Sets the register @r to the 8-bit value @to */
  setRegister(r, to) {
    if (r === 0) {
      to = 0;
    }

    const V = (to >>> 0) & 0xff;
    this.#registers[r] = V;
    this.#updateZeroAndNegative(V);
  }

  /* Returns the contents of register @r */
  getRegister(r) {
    return this.#registers[r];
  }

  /* Sets the stack pointer */
  setSP(to) {
    this.setRegister(SP, to);
  }

  /* Returns the contents of the stack pointer */
  getSP() {
    return this.getRegister(SP);
  }

  /* Sets the program counter */
  setPC(to) {
    this.#pc = (to >>> 0) & 0xffff;
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
  pushToStack(value) {
    const sp = this.getSP();

    const addr = 0x0100 + sp;
    this.setMemory(addr, value);
    this.setSP(sp + 1);
  }

  /* Pushes a 16-bit value to the stack */
  pushToStack16(value) {
    const u = value >>> 0;
    const lo = u & 0xff;
    const hi = (u >> 8) & 0xff;

    this.pushToStack(hi);
    this.pushToStack(lo);
  }

  /* Pops a value from the stack */
  popFromStack() {
    const sp = this.getSP() - 1;

    this.setSP(sp);
    const addr = 0x0100 + sp;
    return this.getMemory(addr);
  }

  /* Pops a 16-bit value from the stack */
  popFromStack16() {
    const lo = this.popFromStack();
    const hi = this.popFromStack();

    const addr = lo | (hi << 8);
    return addr;
  }

  /* Gets kernel compilation info */
  getKernelInfo() {
    return this.#kernelInfo;
  }

  /* Initializes the HTML canvas */
  #initCanvas() {
    this.#canvas = document.getElementById("runner-canvas");
    this.#canvas.width = FRAME_CANVAS_W;
    this.#canvas.height = FRAME_CANVAS_H;

    this.#ctx = this.#canvas.getContext("2d");
    this.#ctx.scale(FRAME_CANVAS_SCALE, FRAME_CANVAS_SCALE);
    this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);

    this.#ctx.fillStyle = "black";
    this.#ctx.fillRect(0, 0, FRAME_WIN_W, FRAME_WIN_H);
  }

  /* Initializes the keyboard hooks */
  #initKeyboard() {
    const KEY_LEFT = 0;
    const KEY_DOWN = 1;
    const KEY_UP = 2;
    const KEY_RIGHT = 3;
    const KEY_A = 4;
    const KEY_B = 5;
    const KEY_START = 6;
    const KEY_MENU = 7;

    const keyMap = {
      a: KEY_LEFT,
      A: KEY_LEFT,
      ArrowLeft: KEY_LEFT,

      s: KEY_DOWN,
      S: KEY_DOWN,
      ArrowDown: KEY_DOWN,

      W: KEY_UP,
      w: KEY_UP,
      ArrowUp: KEY_UP,

      D: KEY_RIGHT,
      d: KEY_RIGHT,
      ArrowRight: KEY_RIGHT,

      Z: KEY_A,
      z: KEY_A,

      X: KEY_B,
      x: KEY_B,

      Enter: KEY_START,

      Backspace: KEY_MENU,
    };

    this.#input = 0;

    document.addEventListener("keydown", (ev) => {
      const key = keyMap[ev.key];
      if (key !== undefined) {
        this.#input |= 1 << key;
      }
    });
    document.addEventListener("keyup", (ev) => {
      const key = keyMap[ev.key];
      if (key !== undefined) {
        this.#input &= ~(1 << key);
      }
    });
  }

  /* Initializes the VM registers */
  #initRegisters() {
    this.#registers = {};
    for (let r = 0; r < REG_COUNT; r++) {
      this.setRegister(r, 0);
    }

    this.setSP(0);
    this.setPC(0);
  }

  /* Initializes the VM memory */
  #initMemory() {
    this.#memory = new Uint8Array(MEMORY_SIZE);
  }

  /* Initializes the flags */
  #initFlags() {
    this.#flags = new Map();

    this.setFlag(Flag.CARRY, 0);
    this.setFlag(Flag.INTERRUPT, 1);
    this.setFlag(Flag.ZERO, 0);
    this.setFlag(Flag.NEGATIVE, 0);
  }

  /* Initializes the kernel */
  #initKernel() {
    const [kernel, kernelInfo] = assembleWithInfo(KERNEL_SRC);
    if (kernel === null) {
      throw new Error("failed to initialize kernel");
    }

    const code = kernel.program;
    for (let i = 0; i < MEMORY_SIZE; i++) {
      this.#memory[i] = code[i];
    }

    this.#kernelInfo = kernelInfo;
  }

  /* Initializes the font data */
  #initFont() {
    for (let i = 0; i < FONT_DATA.length; i++) {
      this.setMemory(FONT_START_ADDR + i, FONT_DATA[i]);
    }
  }

  /* Initializes the instruction callbacks */
  #initInstructions() {
    this.#instructions = {
      [Opcode.HLT_A]: () => {
        const a = this.#getArgsA();
        const A = this.getRegister(a);

        this.#doSyscall(A);
      },
      [Opcode.HLT_K]: () => {
        const k = this.#getArgsK();
        this.#doSyscall(k);
      },
      [Opcode.HLT_O]: () => {
        this.pause();
      },
      [Opcode.MOV_APB]: () => {
        const [a, p, b] = this.#getArgsAPB();
        const B = this.getRegister(b);
        const P = this.getMemory(p + B);

        this.setRegister(a, P);
      },
      [Opcode.MOV_APK]: () => {
        const [a, p, k] = this.#getArgsAPK();
        const P = this.getMemory(p + k);

        this.setRegister(a, P);
      },
      [Opcode.MOV_AIB]: () => {
        const [a, i, b] = this.#getArgsAIB();
        const lo = this.getMemory(i);
        const hi = this.getMemory((i + 1) & 0xff);

        const I = lo | (hi << 8);
        const B = this.getRegister(b);
        const P = this.getMemory(I + B);

        this.setRegister(a, P);
      },
      [Opcode.MOV_AIK]: () => {
        const [a, i, k] = this.#getArgsAIK();
        const lo = this.getMemory(i++);
        const hi = this.getMemory(i & 0xff);

        const I = lo | (hi << 8);
        this.setRegister(a, I + k);
      },
      [Opcode.MOV_PAB]: () => {
        const [p, a, b] = this.#getArgsPAB();
        const A = this.getRegister(a);
        const B = this.getRegister(b);

        this.setMemory(p + A, B);
      },
      [Opcode.MOV_PAK]: () => {
        const [p, a, k] = this.#getArgsPAK();
        const A = this.getRegister(a);

        this.setMemory(p + A, k);
      },
      [Opcode.MOV_AB]: () => {
        const [a, b] = this.#getArgsAB();
        const B = this.getRegister(b);

        this.setRegister(a, B);
      },
      [Opcode.MOV_AK]: () => {
        const [a, k] = this.#getArgsAK();
        this.setRegister(a, k);
      },
      [Opcode.MOV_KA]: () => {
        const [k, a] = this.#getArgsKA();
        const A = this.getRegister(a);

        this.setMemory(k, A);
      },
      [Opcode.MOV_KK]: () => {
        const [k, l] = this.#getArgsKK();
        this.setMemory(k, l);
      },
      [Opcode.MOV_AP]: () => {
        const [a, p] = this.#getArgsAP();
        const P = this.getMemory(p);

        this.setRegister(a, P);
      },
      [Opcode.MOV_PA]: () => {
        const [p, a] = this.#getArgsPA();
        const A = this.getRegister(a);

        this.setMemory(p, A);
      },
      [Opcode.MOV_PK]: () => {
        const [p, k] = this.#getArgsPK();
        this.setMemory(p, k);
      },
      [Opcode.JMP_PA]: () => {
        const [p, a] = this.#getArgsPA();
        const P = p + a;

        this.setPC(P);
      },
      [Opcode.JMP_PK]: () => {
        const [p, k] = this.#getArgsPK();
        const P = p + k;

        this.setPC(P);
      },
      [Opcode.JMP_P]: () => {
        const p = this.#getArgsP();
        this.setPC(p);
      },
      [Opcode.BRT_PA]: () => {
        const [p, a] = this.#getArgsPA();
        if (this.getFlag(Flag.ZERO)) {
          const P = p + a;
          this.setPC(P);
        }
      },
      [Opcode.BRT_PK]: () => {
        const [p, k] = this.#getArgsPK();
        if (this.getFlag(Flag.ZERO)) {
          const P = p + k;
          this.setPC(P);
        }
      },
      [Opcode.BRT_P]: () => {
        const p = this.#getArgsP();
        if (this.getFlag(Flag.ZERO)) {
          this.setPC(p);
        }
      },
      [Opcode.BRF_PA]: () => {
        const [p, a] = this.#getArgsPA();
        if (this.getFlag(Flag.ZERO) === 0) {
          const P = p + a;
          this.setPC(P);
        }
      },
      [Opcode.BRF_PK]: () => {
        const [p, k] = this.#getArgsPK();
        if (this.getFlag(Flag.ZERO) === 0) {
          const P = p + k;
          this.setPC(P);
        }
      },
      [Opcode.BRF_P]: () => {
        const p = this.#getArgsP();
        if (this.getFlag(Flag.ZERO) === 0) {
          this.setPC(p);
        }
      },
      [Opcode.EQU_AB]: () => {
        const [a, b] = this.#getArgsAB();
        const eq = this.getRegister(a) === this.getRegister(b) ? 1 : 0;

        this.setFlag(Flag.ZERO, eq);
      },
      [Opcode.EQU_AK]: () => {
        const [a, k] = this.#getArgsAK();
        const eq = this.getRegister(a) === k ? 1 : 0;

        this.setFlag(Flag.ZERO, eq);
      },
      [Opcode.LSS_AB]: () => {
        const [a, b] = this.#getArgsAB();
        const A = this.getRegister(a);
        const B = this.getRegister(b);

        const lss = A < B ? 1 : 0;
        this.setFlag(Flag.ZERO, lss);
      },
      [Opcode.LSS_AK]: () => {
        const [a, k] = this.#getArgsAK();
        const A = this.getRegister(a);

        const lss = A < k ? 1 : 0;
        this.setFlag(Flag.ZERO, lss);
      },
      [Opcode.AND_ABC]: () => {
        const [a, b, c] = this.#getArgsABC();
        const B = this.getRegister(b);
        const C = this.getRegister(c);

        const AND = B & C;
        this.setRegister(a, AND);
      },
      [Opcode.AND_ABK]: () => {
        const [a, b, k] = this.#getArgsABK();
        const B = this.getRegister(b);

        const AND = B & k;
        this.setRegister(a, AND);
      },
      [Opcode.AND_AB]: () => {
        const [a, b] = this.#getArgsAB();
        const A = this.getRegister(a);
        const B = this.getRegister(b);

        const AND = A & B;
        this.setRegister(a, AND);
      },
      [Opcode.AND_AK]: () => {
        const [a, k] = this.#getArgsAK();
        const A = this.getRegister(a);

        const AND = A & k;
        this.setRegister(a, AND);
      },
      [Opcode.OR_ABC]: () => {
        const [a, b, c] = this.#getArgsABC();
        const B = this.getRegister(b);
        const C = this.getRegister(c);

        const OR = B | C;
        this.setRegister(a, OR);
      },
      [Opcode.OR_ABK]: () => {
        const [a, b, k] = this.#getArgsABK();
        const B = this.getRegister(b);

        const OR = B | k;
        this.setRegister(a, OR);
      },
      [Opcode.OR_AB]: () => {
        const [a, b] = this.#getArgsAB();
        const A = this.getRegister(a);
        const B = this.getRegister(b);

        const OR = A | B;
        this.setRegister(a, OR);
      },
      [Opcode.OR_AK]: () => {
        const [a, k] = this.#getArgsAK();
        const A = this.getRegister(a);

        const OR = A | k;
        this.setRegister(a, OR);
      },
      [Opcode.XOR_ABC]: () => {
        const [a, b, c] = this.#getArgsABC();
        const B = this.getRegister(b);
        const C = this.getRegister(c);

        const XOR = B ^ C;
        this.setRegister(a, XOR);
      },
      [Opcode.XOR_ABK]: () => {
        const [a, b, k] = this.#getArgsABK();
        const B = this.getRegister(b);

        const XOR = B ^ k;
        this.setRegister(a, XOR);
      },
      [Opcode.XOR_AB]: () => {
        const [a, b] = this.#getArgsAB();
        const A = this.getRegister(a);
        const B = this.getRegister(b);

        const XOR = A ^ B;
        this.setRegister(a, XOR);
      },
      [Opcode.XOR_AK]: () => {
        const [a, k] = this.#getArgsAK();
        const A = this.getRegister(a);

        const XOR = A ^ k;
        this.setRegister(a, XOR);
      },
      [Opcode.NOT_AB]: () => {
        const [a, b] = this.#getArgsAB();
        const B = this.getRegister(b);

        this.getRegister(a, B === 0 ? 1 : 0);
      },
      [Opcode.NOT_AK]: () => {
        const [a, k] = this.#getArgsAK();
        this.getRegister(a, k === 0 ? 1 : 0);
      },
      [Opcode.NOT_A]: () => {
        const a = this.#getArgsA();
        const C = this.getFlag(Flag.ZERO) === 0 ? 1 : 0;

        this.setFlag(Flag.ZERO, C);
        this.setRegister(a, C);
      },
      [Opcode.NOT_O]: () => {
        const C = this.getFlag(Flag.ZERO) === 0 ? 1 : 0;
        this.setFlag(Flag.ZERO, C);
      },
      [Opcode.ROL_A]: () => {
        const a = this.#getArgsA();
        const carry = this.getFlag(Flag.CARRY);

        let A = this.getRegister(a) >>> 0;
        this.setFlag(Flag.CARRY, (A >> 7) & 1);

        A = (A << 1) & 0xff;
        if (carry) {
          A |= 1;
        }

        this.setRegister(a, A);
      },
      [Opcode.ROL_K]: () => {
        const k = this.#getArgsK();
        const carry = this.getFlag(Flag.CARRY);

        let K = this.getMemory(k) >>> 0;
        this.setFlag(Flag.CARRY, (K >> 7) & 1);

        K = (K << 1) & 0xff;
        if (carry) {
          K |= 1;
        }

        this.setMemory(k, K);
      },
      [Opcode.ROL_P]: () => {
        const p = this.#getArgsP();
        const carry = this.getFlag(Flag.CARRY);

        let P = this.getMemory(p) >>> 0;
        this.setFlag(Flag.CARRY, (P >> 7) & 1);

        P = (P << 1) & 0xff;
        if (carry) {
          P |= 1;
        }

        this.setMemory(p, P);
      },
      [Opcode.ROR_A]: () => {
        const a = this.#getArgsA();
        const carry = this.getFlag(Flag.CARRY);

        let A = this.getRegister(a);
        this.setFlag(Flag.CARRY, A & 1);

        A >>= 1;
        if (carry) {
          A |= 1 << 7;
        }

        this.setRegister(a, A);
      },
      [Opcode.ROR_K]: () => {
        const k = this.#getArgsK();
        const carry = this.getFlag(Flag.CARRY);

        let K = this.getMemory(k);
        this.setFlag(Flag.CARRY, K & 1);

        K >>= 1;
        if (carry) {
          K |= 1 << 7;
        }

        this.setMemory(k, K);
      },
      [Opcode.ROR_P]: () => {
        const p = this.#getArgsP();
        const carry = this.getFlag(Flag.CARRY);

        let P = this.getMemory(p);
        this.setFlag(Flag.CARRY, P & 1);

        P >>= 1;
        if (carry) {
          P |= 1 << 7;
        }

        this.setMemory(p, P);
      },
      [Opcode.LSH_ABC]: () => {
        const [a, b, c] = this.#getArgsABC();
        const B = this.getRegister(b);
        const C = this.getRegister(c);

        this.setFlag(Flag.CARRY, B > 127 ? 1 : 0);
        this.setRegister(a, B << C);
      },
      [Opcode.LSH_ABK]: () => {
        const [a, b, k] = this.#getArgsABK();
        const B = this.getRegister(b);

        this.setFlag(Flag.CARRY, B > 127 ? 1 : 0);
        this.setRegister(a, B << k);
      },
      [Opcode.LSH_AB]: () => {
        const [a, b] = this.#getArgsAB();
        const A = this.getRegister(a);
        const B = this.getRegister(b);

        this.setFlag(Flag.CARRY, A > 127 ? 1 : 0);
        this.setRegister(a, A << B);
      },
      [Opcode.LSH_AK]: () => {
        const [a, k] = this.#getArgsAK();
        const A = this.getRegister(a);

        this.setFlag(Flag.CARRY, A > 127 ? 1 : 0);
        this.setRegister(a, A << k);
      },
      [Opcode.LSH_A]: () => {
        const a = this.#getArgsA();
        const A = this.getRegister(a);

        this.setFlag(Flag.CARRY, A > 127 ? 1 : 0);
        this.setRegister(a, A << 1);
      },
      [Opcode.RSH_ABC]: () => {
        const [a, b, c] = this.#getArgsABC();
        const B = this.getRegister(b);
        const C = this.getRegister(c);

        this.setFlag(Flag.CARRY, B & 1);
        this.setRegister(a, B >> C);
      },
      [Opcode.RSH_ABK]: () => {
        const [a, b, k] = this.#getArgsABK();
        const B = this.getRegister(b);

        this.setFlag(Flag.CARRY, B & 1);
        this.setRegister(a, B >> k);
      },
      [Opcode.RSH_AB]: () => {
        const [a, b] = this.#getArgsAB();
        const A = this.getRegister(a);
        const B = this.getRegister(b);

        this.setFlag(Flag.CARRY, A & 1);
        this.setRegister(a, A >> B);
      },
      [Opcode.RSH_AK]: () => {
        const [a, k] = this.#getArgsAK();
        const A = this.getRegister(a);

        this.setFlag(Flag.CARRY, A & 1);
        this.setRegister(a, A >> k);
      },
      [Opcode.RSH_A]: () => {
        const a = this.#getArgsA();
        const A = this.getRegister(a);

        this.setFlag(Flag.CARRY, A & 1);
        this.setRegister(a, A >> 1);
      },
      [Opcode.ADD_ABC]: () => {
        const [a, b, c] = this.#getArgsABC();
        const B = this.getRegister(b);
        const C = this.getRegister(c);

        const result = this.#addWithCarry(B, C);
        this.setRegister(a, result);
      },
      [Opcode.ADD_ABK]: () => {
        const [a, b, k] = this.#getArgsABK();
        const B = this.getRegister(b);

        const result = this.#addWithCarry(B, k);
        this.setRegister(a, result);
      },
      [Opcode.ADD_AB]: () => {
        const [a, b] = this.#getArgsAB();
        const A = this.getRegister(a);
        const B = this.getRegister(b);

        const result = this.#addWithCarry(A, B);
        this.setRegister(a, result);
      },
      [Opcode.ADD_AK]: () => {
        const [a, k] = this.#getArgsAK();
        const A = this.getRegister(a);

        const result = this.#addWithCarry(A, k);
        this.setRegister(a, result);
      },
      [Opcode.INC_A]: () => {
        const a = this.#getArgsA();
        const A = this.getRegister(a);

        this.setRegister(a, A + 1);
      },
      [Opcode.INC_P]: () => {
        const p = this.#getArgsP();
        const P = this.getMemory(p);

        this.setMemory(p, P + 1);
      },
      [Opcode.DEC_A]: () => {
        const a = this.#getArgsA();
        const A = this.getRegister(a) - 1;

        this.setRegister(a, A >>> 0);
      },
      [Opcode.DEC_P]: () => {
        const p = this.#getArgsP();
        const P = this.getMemory(p) - 1;

        this.setMemory(p, P >>> 0);
      },
      [Opcode.CALL_P]: () => {
        const p = this.#getArgsP();

        const pc = this.getPC();
        this.pushToStack16(pc);

        this.setPC(p);
      },
      [Opcode.RET_O]: () => {
        const returnAddress = this.popFromStack16();
        this.setPC(returnAddress);
      },
      [Opcode.PUSH_A]: () => {
        const a = this.#getArgsA();
        const A = this.getRegister(a);

        this.pushToStack(A);
      },
      [Opcode.PUSH_O]: () => {
        const k = this.#getArgsK();
        this.pushToStack(k);
      },
      [Opcode.POP_A]: () => {
        const value = this.popFromStack();

        const a = this.#getArgsA();
        this.setRegister(a, value);
      },
      [Opcode.POP_O]: () => {
        this.popFromStack();
      },
      [Opcode.SEI_A]: () => {
        const a = this.#getArgsA();
        const A = this.getRegister(a) === 0 ? 0 : 1;

        this.setFlag(Flag.INTERRUPT, A);
      },
      [Opcode.SEI_K]: () => {
        const k = this.#getArgsK();
        const K = k === 0 ? 0 : 1;

        this.setFlag(Flag.INTERRUPT, K);
      },
      [Opcode.SEI_O]: () => {
        this.setFlag(Flag.INTERRUPT, 1);
      },
      [Opcode.CHY_O]: () => {
        const carry = this.getFlag(Flag.CARRY);
        this.setFlag(Flag.ZERO, carry);
      },
    };

    Object.keys(this.#instructions).forEach((k) =>
      this.#instructions[k].bind(this),
    );
  }

  /* Adds two numbers, handling carry */
  #addWithCarry(a, b) {
    const result = a + b;
    if (result >= 0x100) {
      this.setFlag(Flag.CARRY, 1);
    } else {
      this.setFlag(Flag.CARRY, 0);
    }

    return (result >>> 0) & 0xff;
  }

  /* Updates the analyser with the internal state of the VM */
  #updateAnalyser() {
    for (let i = 0; i < REG_COUNT; i++) {
      const p = analyserRegisters[i];

      const rV = this.getRegister(i).toString(16);
      const rN = i.toString(16);
      p.innerText = `\$${rN}: ${rV}`;
    }

    const pc = this.getPC().toString(16);
    analyserPC.innerText = `pc: ${pc}`;

    const sp = this.getSP().toString(16);
    analyserSP.innerText = `sp: ${sp}`;

    analyserFlagCarry.innerText = `C: ${this.getFlag(Flag.CARRY)}`;
    analyserFlagInterrupt.innerText = `I: ${this.getFlag(Flag.INTERRUPT)}`;
    analyserFlagZero.innerText = `Z: ${this.getFlag(Flag.ZERO)}`;
    analyserFlagNegative.innerText = `N: ${this.getFlag(Flag.NEGATIVE)}`;
  }

  /* Performs a syscall */
  #doSyscall(_syscall) {}

  /* Draws to the screen
   * TODO:
   * - Draw modes
   * - Rewrite in assembly
   * - DO changes you are thinking about. Yeah, those
   */
  #draw() {
    let x = 0;
    let y = 0;

    for (let i = TXT_DATA_ADDR; i < TXT_DATA_ADDR + 0x40; i++) {
      const letter = this.getMemory(i);
      const letterDataAddr = FONT_START_ADDR + letter * 8;

      let oy = 0;
      for (let j = letterDataAddr; j < letterDataAddr + 8; j++) {
        const byte = this.getMemory(j);

        let ox = 0;
        for (let k = 7; k >= 0; k--) {
          const px = (byte >> k) & 1;
          this.#blit(x + ox, y + oy, px);
          ox++;
        }

        oy++;
      }

      x = (x + 8) & 0x3f;
      if (x === 0) {
        y += 8;
      }
    }
  }

  /* Blits to the screen buffer */
  #blit(x, y, c) {
    const i = y * 64 + x;
    if (c === 0) {
      this.setMemory(SCREEN_DATA_ADDR + i, 0);
      this.#ctx.fillStyle = "black";
    } else {
      this.setMemory(SCREEN_DATA_ADDR + i, 1);
      this.#ctx.fillStyle = "white";
    }

    this.#ctx.fillRect(x, y, 1, 1);
  }

  /* Triggers an interrupt */
  #triggerInterrupt() {
    console.log("INTERRUPT!", this.#memory[2]);
    this.#needsInterrupt = false;

    this.pushToStack16(this.getPC());

    const addr = this.getMemory16(INT_START_ADDR);
    this.setPC(addr);
  }

  /* Updates the zero and negative flags based on a value */
  #updateZeroAndNegative(v) {
    this.setFlag(Flag.ZERO, v === 0 ? 1 : 0);

    const SIGN = (v >> 7) & 1;
    this.setFlag(Flag.NEGATIVE, SIGN);
  }

  /* Gets register A from the arguments */
  #getArgsA() {
    const next = this.fetchNext();
    return next & 0xf;
  }

  /* Gets the argument for a K instruction */
  #getArgsK() {
    return this.fetchNext();
  }

  /* Gets the argument for a P instruction */
  #getArgsP() {
    const lo = this.fetchNext();
    const hi = this.fetchNext();

    return lo | (hi << 8);
  }

  /* Gets the arguments for an AB instruction */
  #getArgsAB() {
    const next = this.fetchNext();
    const a = next & 0xf;
    const b = (next >> 4) & 0xf;

    return [a, b];
  }

  /* Gets the arguments for an AK instruction */
  #getArgsAK() {
    const a = this.#getArgsA();
    const k = this.fetchNext();

    return [a, k];
  }

  /* Gets the arguments for a KA instruction */
  #getArgsKA() {
    const k = this.fetchNext();
    const a = this.#getArgsA();

    return [k, a];
  }

  /* Gets the arguments for a KK instruction */
  #getArgsKK() {
    const k = this.fetchNext();
    const l = this.fetchNext();

    return [k, l];
  }

  /* Gets the arguments for an AP instruction */
  #getArgsAP() {
    const a = this.#getArgsA();
    const p = this.#getArgsP();

    return [a, p];
  }

  /* Gets the arguments for a PA instruction */
  #getArgsPA() {
    const p = this.#getArgsP();
    const a = this.#getArgsA();

    return [p, a];
  }

  /* Gets the arguments for a PK instruction */
  #getArgsPK() {
    const p = this.#getArgsP();
    const k = this.#getArgsK();

    return [p, k];
  }

  /* Gets the arguments for an ABC instruction */
  #getArgsABC() {
    const [a, b] = this.#getArgsAB();
    const c = this.#getArgsA();

    return [a, b, c];
  }

  /* Gets the arguments for an ABK instruction */
  #getArgsABK() {
    const [a, b] = this.#getArgsAB();
    const k = this.#getArgsK();

    return [a, b, k];
  }

  /* Gets the arguments for an APB instruction */
  #getArgsAPB() {
    const [p, a, b] = this.#getArgsPAB();
    return [a, p, b];
  }

  /* Gets the arguments for an APK instruction */
  #getArgsAPK() {
    const [p, a, k] = this.#getArgsPAK();
    return [a, p, k];
  }

  /* Gets the arguments for an AIB instruction */
  #getArgsAIB() {
    const [a, b, i] = this.#getArgsABK();
    return [a, i, b];
  }

  /* Gets the arguments for an AIK instruction */
  #getArgsAIK() {
    const [a, i] = this.#getArgsAK();
    const k = this.fetchNext();

    return [a, i, k];
  }

  /* Gets the arguments for a PAB instruction */
  #getArgsPAB() {
    const p = this.#getArgsP();
    const [a, b] = this.#getArgsAB();

    return [p, a, b];
  }

  /* Gets the arguments for a PAK instruction */
  #getArgsPAK() {
    const p = this.#getArgsP();
    const [a, k] = this.#getArgsAK();

    return [p, a, k];
  }
}

const frameVM = new FrameVM();

const getKernelInfo = () => {
  return frameVM.getKernelInfo();
};

const runProgram = (program) => {
  frameVM.loadProgramAndRun(program);
};

const loadProgram = (program) => {
  frameVM.loadProgram(program);
};

const stopProgram = () => {
  frameVM.stop();
};

const pauseProgram = () => {
  frameVM.pause();
};

const stepProgram = () => {
  frameVM.step();
};

const isProgramPaused = () => {
  return frameVM.isProgramPaused();
};
