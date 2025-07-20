/* assembler.js
 * Assembles FRAME programs into machine code
 */

"use strict";

const Opcode = {
  MOV: 0x1,
};

const _instr = (op, argCount) => {
  return {
    op: op,
    argCount: argCount,
  };
};

const INSTRUCTION_MAP = {
  mov: _instr(Opcode.MOV, 2),
};

class Assembler {
  #source = null;

  #program = null;
  #idx = 0;

  #line = 0;
  #char = 0;

  constructor() {}

  assembleProgram(source) {
    this.#source = source;
    this.#program = [];

    this.#idx = 0;
    this.#line = 1;
    this.#char = 1;

    this.#assemble();
    console.log(`compiled: ${this.#program}`);

    return this.#program;
  }

  #assemble() {
    while (this.#assembleToken());
  }

  /* Assembles the next token */
  #assembleToken() {
    this.#skipSpaces();
    if (this.#reachedEndOfSource()) {
      return false;
    }

    const char = this.#advance();

    if (this.#isAlpha(char)) {
      this.#assembleIdentifier();
      return true;
    }

    if (this.#isDigit(char)) {
      this.#assembleNumber(char);
      return true;
    }

    return true;
  }

  /* Skips all whitespace/useless characters */
  #skipSpaces() {
    while (true) {
      const char = this.#peek();
      switch (char) {
        case " ":
        case "\t":
        case "\r":
          this.#advance();
          break;
        case "\n":
          this.#line++;
          this.#char = 1;
          this.#advance();
          break;
        case "#":
          this.#skipComment();
          break;
        default:
          return;
      }
    }
  }

  /* Skips a comment */
  #skipComment() {
    while (!this.#reachedEndOfSource() && this.#advance() != "\n");
  }

  /* Assembles an identifier (instruction, label, constant or register) */
  #assembleIdentifier() {
    const identifier = this.#readIdentifier();

    const instruction = INSTRUCTION_MAP[identifier];
    if (instruction) {
      this.#emitInstruction(instruction);
      return;
    }
  }

  /* Reads the next identifier */
  #readIdentifier() {
    const start = this.#idx - 1;
    while (!this.#reachedEndOfSource() && this.#isIdentifier(this.#peek())) {
      this.#advance();
    }

    return this.#source.substring(start, this.#idx);
  }

  /* Emits an instruction based on an instruction object */
  #emitInstruction(instruction) {
    this.#emit(instruction.op);

    let argCount = instruction.argCount;
    if (argCount === 0) {
      return;
    }

    this.#assembleToken();
    while (--argCount > 0) {
      if (!this.#expect(",")) {
        /* TODO: throw error */
        console.log("ERROR: BAD ARG COUNT!");
        return;
      }

      this.#assembleToken();
    }
  }

  /* Assembles a number (hexadecimal, decimal or binary) */
  #assembleNumber(char) {
    if (char === "0") {
      const radix = this.#advance();
      switch (radix) {
        case "x":
          return this.#readHexNumber();
        case "o":
          return this.#readOctalNumber();
        case "b":
          return this.#readBinaryNumber();
      }
    }

    this.#rewind();
    return this.#readDecimalNumber();
  }

  /* Reads a hexadecimal number (0-F) */
  #readHexNumber() {
    const start = this.#idx;
    while (!this.#reachedEndOfSource() && this.#isHex(this.#peek())) {
      this.#advance();
    }

    const num = this.#source.substring(start, this.#idx);
    return parseInt(num, 16);
  }

  /* Reads an octal number (0-7) */
  #readOctalNumber() {
    const start = this.#idx;
    while (!this.#reachedEndOfSource() && this.#isOctal(this.#peek())) {
      this.#advance();
    }

    const num = this.#source.substring(start, this.#idx);
    return parseInt(num, 8);
  }

  /* Reads a binary number (0/1) */
  #readBinaryNumber() {
    const start = this.#idx;
    while (!this.#reachedEndOfSource() && this.#isBinary(this.#peek())) {
      this.#advance();
    }

    const num = this.#source.substring(start, this.#idx);
    return parseInt(num, 2);
  }

  /* Reads a decimal number (0-9) */
  #readDecimalNumber() {
    const start = this.#idx;
    while (!this.#reachedEndOfSource() && this.#isDigit(this.#peek())) {
      this.#advance();
    }

    const num = this.#source.substring(start, this.#idx);
    return parseInt(num, 10);
  }

  /* Advances and returns if the next character was the one that was expected */
  #expect(char) {
    return this.#advance() === char;
  }

  /* Returns the current character */
  #peek() {
    return this.#source[this.#idx];
  }

  /* Advances one character forward in the stream and returns it */
  #advance() {
    this.#char++;
    return this.#source[this.#idx++];
  }

  /* Rewinds one character */
  #rewind() {
    if (this.#idx <= 0) {
      return;
    }

    this.#idx--;
    this.#char--;
  }

  /* Emits a byte */
  #emit(b) {
    this.#program.push(b);
  }

  /* Checks if a character is a letter */
  #isAlpha(char) {
    return (char >= "A" && char <= "Z") || (char >= "a" && char <= "z");
  }

  /* Checks if a character is a valid base-16 number */
  #isHex(char) {
    return (
      this.#isDigit(char) ||
      (char >= "A" && char <= "F") ||
      (char >= "a" && char <= "f")
    );
  }

  /* Checks if a character is a valid base-8 number */
  #isOctal(char) {
    return char >= "0" && char <= "7";
  }

  /* Checks if a character is a valid base-2 number */
  #isBinary(char) {
    return char == "0" || char == "1";
  }

  /* Checks if a character is a number */
  #isDigit(char) {
    return char >= "0" && char <= "9";
  }

  /* Checks if a character is a valid identifier */
  #isIdentifier(char) {
    return char == "_" || this.#isAlpha(char) || this.#isDigit(char);
  }
  /* Checks if the assembler has reached the end of the source code */
  #reachedEndOfSource() {
    return this.#idx >= this.#source.length;
  }
}

const assembler = new Assembler();

const assemble = (program) => {
  return assembler.assembleProgram(program);
};
