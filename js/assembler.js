/* assembler.js
 * Assembles FRAME programs into machine code
 */

"use strict";

const TokenType = {
  INSTRUCTION: 0,
  IDENTIFIER: 1,
  LABEL: 2,
  NUMBER: 3,
  REGISTER: 4,

  COMMA: 5,

  ERROR: 254,
  EOF: 255,
};

const Opcode = {
  HLT: 0x0,
  MOV: 0x1,
};

const Mode = {
  O: 0,
  A: 1,
  K: 2,
  AB: 3,
  AK: 4,
  ABC: 5,
  ABK: 6,
};

class Assembler {
  #source;

  #program;
  #idx;

  #line;
  #char;

  #hadError;

  #token;

  #labels;
  #unresolvedLabels;

  #instructionEmitMap = {
    hlt: this.#emitHLT.bind(this),
    mov: this.#emitMOV.bind(this),
  };

  constructor() {}

  assembleProgram(source) {
    this.reset();

    this.#source = source;
    this.#assemble();

    console.log(`compiled: ${this.#program}`);
    return this.#hadError ? null : this.#program;
  }

  reset() {
    this.#program = [];
    this.#idx = 0;

    this.#line = 1;
    this.#char = 1;

    this.#hadError = false;

    this.#token = null;

    this.#labels = [];
    this.#unresolvedLabels = [];
  }

  #assemble() {
    while (true) {
      this.#token = this.#assembleToken();
      if (this.#token.type == TokenType.EOF) {
        break;
      } else if (this.#token.type == TokenType.ERROR) {
        this.#logError(this.#token);
        break;
      }

      const err = this.#emitToken();
      if (err) {
        this.#logError(err);
        break;
      }
    }
  }

  #logError(token) {
    const line = token.line;
    const char = token.char;
    const msg = token.lexeme;

    this.#hadError = true;
    console.log(`ERROR:${line}:${char}: ${msg}`);
  }

  /* Assembles the next token */
  #assembleToken() {
    this.#skipSpaces();
    if (this.#reachedEndOfSource()) {
      return this.#createToken(TokenType.EOF, null);
    }

    const char = this.#advance();

    if (this.#isAlpha(char)) {
      return this.#assembleIdentifier();
    }

    if (this.#isDigit(char)) {
      return this.#assembleNumber(char);
    }

    switch (char) {
      case "@":
        return this.#assembleLabel();
      case "$":
        return this.#assembleRegister();
      case ",":
        return this.#createToken(TokenType.COMMA, char);
    }

    return this.#createToken(TokenType.ERROR, `unexpected character "${char}"`);
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
    if (identifier in this.#instructionEmitMap) {
      return this.#createToken(TokenType.INSTRUCTION, identifier);
    }

    return this.#createToken(TokenType.IDENTIFIER, identifier);
  }

  /* Reads the next identifier */
  #readIdentifier() {
    const start = this.#idx - 1;
    while (!this.#reachedEndOfSource() && this.#isIdentifier(this.#peek())) {
      this.#advance();
    }

    return this.#source.substring(start, this.#idx);
  }

  /* Assembles a number (hexadecimal, decimal or binary) */
  #assembleNumber(char) {
    if (char === "0") {
      const radix = this.#advance();
      switch (radix) {
        case "x":
          return this.#createToken(TokenType.NUMBER, this.#readHexNumber());
        case "o":
          return this.#createToken(TokenType.NUMBER, this.#readOctalNumber());
        case "b":
          return this.#createToken(TokenType.NUMBER, this.#readBinaryNumber());
      }
    }

    this.#rewind();
    return this.#createToken(TokenType.NUMBER, this.#readDecimalNumber());
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

  /* Assembles a label */
  #assembleLabel() {
    const identifier = this.#readIdentifier();
    return this.#createToken(TokenType.LABEL, identifier);
  }

  /* Assembles a register */
  #assembleRegister() {
    const num = this.#advance();
    if (!this.#isDigit(num)) {
      return this.#createError(`expected register number, got "${num}"`);
    }

    if (num > "7" || num < "0") {
      return this.#createError(`no such register "\$${num}"!`);
    }

    return this.#createToken(TokenType.REGISTER, num);
  }

  /* Creates an error token */
  #createError(msg) {
    return this.#createToken(TokenType.ERROR, msg);
  }

  /* Creates a token */
  #createToken(type, lexeme) {
    return {
      type: type,
      lexeme: lexeme,
      char: this.#char,
      line: this.#line,
    };
  }

  /* Emits instruction(s) based on a token */
  #emitToken() {
    const token = this.#token;
    switch (token.type) {
      case TokenType.INSTRUCTION:
        return this.#emitInstruction(token);
      case TokenType.NUMBER:
        break;
      default:
        break;
    }
  }

  /* Emits an instruction */
  #emitInstruction(token) {
    const emitter = this.#instructionEmitMap[token.lexeme];
    return emitter();
  }

  /* Emits a HLT instruction */
  #emitHLT() {
    return this.#emitInstructionBytes(Opcode.HLT);
  }

  /* Emits a MOV instruction */
  #emitMOV() {
    return this.#emitInstructionBytes(Opcode.MOV, [Mode.ABC, Mode.ABK]);
  }

  #emitInstructionBytes(op, validModes) {
    if (!validModes) {
      this.#emitO(op);
      return;
    }

    const args = this.#getArguments();
    const mode = this.#getModeFromArguments(args);

    if (mode === null || !validModes.includes(mode)) {
      const rArgs = this.#getModeAsString(mode);
      const msg = `incorrect arguments (received ${rArgs})`;

      return this.#createError(msg);
    }

    const values = this.#getValuesFromArguments(args);
    switch (mode) {
      case Mode.O:
        this.#emitO(op);
        break;
      case Mode.A:
        this.#emitA(op, ...values);
        break;
      case Mode.K:
        this.#emitK(op, ...values);
        break;
      case Mode.AB:
        this.#emitAB(op, ...values);
        break;
      case Mode.AK:
        this.#emitAK(op, ...values);
        break;
      case Mode.ABC:
        this.#emitABC(op, ...values);
        break;
      case Mode.ABK:
        this.#emitABK(op, ...values);
        break;
    }
  }

  #getArguments() {
    const args = [];
    while (true) {
      const arg = this.#getArgument();
      if (arg === null) {
        break;
      }

      args.push(arg);
      if (!this.#expect(TokenType.COMMA)) {
        break;
      }
    }

    return args;
  }

  #getArgument() {
    let token = this.#assembleToken();
    switch (token.type) {
      case TokenType.NUMBER:
      case TokenType.REGISTER:
        return token;
    }

    return null;
  }

  #getModeFromArguments(args) {
    if (args.length === 0) {
      return Mode.O;
    }

    const mapped = args.map((a) => a.type);
    switch (mapped.length) {
      case 1:
        return mapped[0] === TokenType.REGISTER ? Mode.A : Mode.K;
      case 2:
        if (mapped[0] !== TokenType.REGISTER) {
          return null;
        }

        return mapped[1] === TokenType.REGISTER ? Mode.AB : Mode.AK;
      case 3:
        if (
          mapped[0] !== TokenType.REGISTER ||
          mapped[1] !== TokenType.REGISTER
        ) {
          return null;
        }

        return mapped[2] === TokenType.REGISTER ? Mode.ABC : Mode.ABK;
    }

    return null;
  }

  #getModeAsString(mode) {
    switch (mode) {
      case Mode.O:
        return "no arguments";
      case Mode.A:
        return "register";
      case Mode.K:
        return "number";
      case Mode.AB:
        return "register, register";
      case Mode.AK:
        return "register, number";
      case Mode.ABC:
        return "register, register, register";
      case Mode.ABK:
        return "register, register, number";
    }
  }

  #getValuesFromArguments(args) {
    return args.map((arg) => {
      switch (arg.type) {
        case TokenType.NUMBER:
        case TokenType.REGISTER:
          return arg.lexeme;
      }
    });
  }

  /* Emits O op */
  #emitO(op) {
    const instruction = this.#createInstruction(op, Mode.O);
    this.#emit(instruction);
  }

  /* Emits A op */
  #emitA(op, a) {
    let instruction = this.#createInstruction(op, Mode.A);
    instruction |= this.#prepareA(a);

    this.#emit(instruction);
  }

  /* Emits K op */
  #emitK(op, k) {
    let instruction = this.#createInstruction(op, Mode.K);
    instruction |= this.#prepareK(k);

    this.#emit(instruction);
  }

  /* Emits AB op */
  #emitAB(op, a, b) {
    let instruction = this.#createInstruction(op, Mode.AB);
    instruction |= this.#prepareA(a);
    instruction |= this.#prepareB(b);

    this.#emit(instruction);
  }

  /* Emits ABC op */
  #emitABC(op, a, b, c) {
    let instruction = this.#createInstruction(op, Mode.ABC);
    instruction |= this.#prepareA(a);
    instruction |= this.#prepareB(b);
    instruction |= this.#prepareC(c);

    this.#emit(instruction);
  }

  /* Emits ABK op */
  #emitABK(op, a, b, k) {
    let instruction = this.#createInstruction(op, Mode.ABK);
    instruction |= this.#prepareABK(a, b, k);

    this.#emit(instruction);
  }

  /* Emits AK op */
  #emitAK(op, a, k) {
    let instruction = this.#createInstruction(op, Mode.AK);
    instruction |= this.#prepareA(a);
    instruction |= this.#prepareK(k);

    this.#emit(instruction);
  }

  /* Prepare A register for instruction */
  #prepareA(a) {
    return (a & 0x07) << 8;
  }

  /* Prepare B register for instruction */
  #prepareB(b) {
    return (b & 0x07) << 11;
  }

  /* Prepare C register for instruction */
  #prepareC(c) {
    return (c & 0x07) << 14;
  }

  /* Prepare K constant for instruction */
  #prepareK(k) {
    return (k & 0xff) << 8;
  }

  /* Prepare ABK for instruction */
  #prepareABK(a, b, k) {
    k = (k & 0xff) << 14;
    return this.#prepareA(a) | this.#prepareB(b) | k;
  }

  /* Emits an instruction */
  #emit(instruction) {
    this.#program.push(instruction);
  }

  /* Creates a base instruction with opcode and a mode */
  #createInstruction(op, mode) {
    op &= 0x1f;
    mode &= 0x7;

    return op | (mode << 5);
  }

  /* Advances and returns if the next character was the one that was expected */
  #expect(type) {
    this.#token = this.#assembleToken();
    return this.#token.type === type;
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
