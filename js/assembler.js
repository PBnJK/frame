/* assembler.js
 * Assembles FRAME programs into machine code
 */

"use strict";

const START_POINT = "@main";

const TokenType = {
  INSTRUCTION: 0,
  IDENTIFIER: 1,
  LABEL: 2,
  NUMBER: 3,
  REGISTER: 4,
  DIRECTIVE: 5,

  COMMA: 6,

  ERROR: 254,
  EOF: 255,
};

const Opcode = {
  HLT: 0x0,
  MOV: 0x1,
  JMP: 0x2,
  JMPC: 0x3,
  EQU: 0x4,
  NOT: 0x5,
  ADD: 0x6,
  CALL: 0x7,
  RET: 0x8,
  PUSH: 0x9,
  POP: 0xa,
};

const Mode = {
  O: 0,
  A: 1,
  K: 2,
  KK: 3,
  AB: 4,
  AK: 5,
  ABC: 6,
  ABK: 7,
};

class Assembler {
  #source;
  #idx;

  #program;
  #pos;

  #line;
  #char;

  #hadError;

  #token;
  #hasLeftoverToken;

  #labels;
  #unresolvedLabels;

  #instructionEmitMap = {
    hlt: this.#emitHLT.bind(this),
    mov: this.#emitMOV.bind(this),
    jmp: this.#emitJMP.bind(this),
    jmpc: this.#emitJMPC.bind(this),
    equ: this.#emitEQU.bind(this),
    not: this.#emitNOT.bind(this),
    add: this.#emitADD.bind(this),
    call: this.#emitCALL.bind(this),
    ret: this.#emitRET.bind(this),
    push: this.#emitPUSH.bind(this),
    pop: this.#emitPOP.bind(this),
  };

  constructor() {}

  assembleProgram(source) {
    this.reset();

    this.#source = source;
    this.#assemble();

    return this.#hadError ? null : this.#program;
  }

  reset() {
    this.#idx = 0;

    this.#program = new Uint8Array(MEMORY_SIZE);
    this.#pos = 0;

    this.#line = 1;
    this.#char = 1;

    this.#hadError = false;

    this.#token = null;
    this.#hasLeftoverToken = false;

    this.#labels = new Map();
    this.#unresolvedLabels = new Map();
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

      do {
        this.#hasLeftoverToken = false;
        if (!this.#handleToken()) {
          break;
        }
      } while (this.#hasLeftoverToken);
    }

    if (this.#unresolvedLabels.size !== 0) {
      const asString = JSON.stringify(this.#unresolvedLabels);
      const msg = `label(s) ${asString} could not be resolved`;

      const err = this.#createError(msg);
      this.#logError(err);
    }

    if (this.#labels.has(START_POINT)) {
      const addr = this.#labels.get(START_POINT);

      const lo = addr & 0xff;
      this.#program[ROM_START_ADDR] = lo;

      const hi = (addr >> 8) & 0xff;
      this.#program[ROM_START_ADDR + 1] = hi;
    } else {
      this.#program[ROM_START_ADDR] = 0;
      this.#program[ROM_START_ADDR + 1] = 0;
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
      case ".":
        return this.#assembleDirective();
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
    if (num === "s") {
      return this.#createToken(TokenType.REGISTER, SP);
    }

    if (!this.#isDigit(num)) {
      return this.#createError(`expected register number, got "${num}"`);
    }

    if (num > "7" || num < "0") {
      return this.#createError(`no such register "\$${num}"!`);
    }

    return this.#createToken(TokenType.REGISTER, num);
  }

  /* Assembles a directive */
  #assembleDirective() {
    const identifier = this.#readIdentifier();
    return this.#createToken(TokenType.DIRECTIVE, identifier);
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

  /* Handles the scanned token */
  #handleToken() {
    const err = this.#emitToken();
    if (!err) {
      return true;
    }

    this.#logError(err);
    return false;
  }

  /* Emits instruction(s) based on a token */
  #emitToken() {
    const token = this.#token;
    switch (token.type) {
      case TokenType.INSTRUCTION:
        return this.#emitInstruction(token);
      case TokenType.NUMBER:
        break;
      case TokenType.LABEL:
        return this.#emitLabel(token);
      case TokenType.DIRECTIVE:
        return this.#emitDirective(token);
      default:
        break;
    }
  }

  /* Emits an instruction */
  #emitInstruction(token) {
    const emitter = this.#instructionEmitMap[token.lexeme];
    return emitter();
  }

  /* Emits a label */
  #emitLabel(token) {
    const label = token.lexeme;
    const addr = this.#pos;

    this.#labels.set(label, addr);

    const unresolved = this.#unresolvedLabels.get(label);
    if (unresolved) {
      this.#fixUnresolvedLabel(label, addr, unresolved);
    }
  }

  /* Fixes a now-declared unresolved label */
  #fixUnresolvedLabel(label, addr, unresolved) {
    for (const i of unresolved) {
      let op = this.#program[i];

      const mode = (op >> 5) & 0x7;
      switch (mode) {
        case Mode.K:
          op |= addr << 8;
          break;
        case Mode.AK:
          op |= addr << 11;
          break;
        case Mode.ABK:
          op |= addr << 14;
          break;
      }

      this.#program[i] = op;
    }

    this.#unresolvedLabels.delete(label);
  }

  /* Emits a directive */
  #emitDirective(token) {
    const directives = {
      ".addr": this.#emitDirectiveAddr.bind(this),
      ".byte": this.#emitDirectiveByte.bind(this),
      ".word": this.#emitDirectiveWord.bind(this),
    };

    const directive = directives[token.lexeme];
    if (directive) {
      return directive();
    }

    return this.#createError(`no such directive "${token.lexeme}"`);
  }

  /* Emits a .addr directive */
  #emitDirectiveAddr() {
    const [addr, err] = this.#getDirectiveArg();
    if (err) {
      return err;
    }

    this.#pos = addr;
  }

  /* Emits a .byte directive */
  #emitDirectiveByte() {
    while (true) {
      const [byte, err] = this.#getDirectiveArg();
      if (err) {
        break;
      }

      this.#emit(byte);
    }
  }

  /* Emits a .word directive */
  #emitDirectiveWord() {
    while (true) {
      const [word, err] = this.#getDirectiveArg();
      if (err) {
        break;
      }

      const lo = word & 0xff;
      const hi = (word >> 8) & 0xff;

      this.#emit(lo);
      this.#emit(hi);
    }
  }

  /* (Attempts to) retrieve a number argument for a directive */
  #getDirectiveArg() {
    const arg = this.#getArgument();
    if (arg === null) {
      const msg = `couldn't retrieve next argument`;
      return [null, this.#createError(msg)];
    }

    const value = this.#getValueFromArgument(arg);
    if (value === null) {
      const asString = this.#getTypeAsString(arg.type);
      const msg = `expected an argument, but got ${asString}`;

      return [null, this.#createError(msg)];
    }

    return [value, null];
  }

  /* Emits a HLT instruction */
  #emitHLT() {
    return this.#emitInstructionBytes(Opcode.HLT);
  }

  /* Emits a MOV instruction */
  #emitMOV() {
    return this.#emitInstructionBytes(Opcode.MOV, [Mode.AB, Mode.AK]);
  }

  /* Emits a JMP instruction */
  #emitJMP() {
    return this.#emitInstructionBytes(Opcode.JMP, [Mode.K], true);
  }

  /* Emits a JMPC instruction */
  #emitJMPC() {
    return this.#emitInstructionBytes(Opcode.JMPC, [Mode.K], true);
  }

  /* Emits an EQU instruction */
  #emitEQU() {
    return this.#emitInstructionBytes(Opcode.EQU, [Mode.AB, Mode.AK]);
  }

  /* Emits a NOT instruction */
  #emitNOT() {
    return this.#emitInstructionBytes(Opcode.NOT, [Mode.O, Mode.AB, Mode.AK]);
  }

  /* Emits an ADD instruction */
  #emitADD() {
    return this.#emitInstructionBytes(Opcode.ADD, [Mode.ABC, Mode.ABK]);
  }

  /* Emits a CALL instruction */
  #emitCALL() {
    return this.#emitInstructionBytes(Opcode.CALL, [Mode.K], true);
  }

  /* Emits a RET instruction */
  #emitRET() {
    return this.#emitInstructionBytes(Opcode.RET);
  }

  /* Emits a PUSH instruction */
  #emitPUSH() {
    return this.#emitInstructionBytes(Opcode.PUSH, [Mode.A, Mode.K]);
  }

  /* Emits a POP instruction */
  #emitPOP() {
    return this.#emitInstructionBytes(Opcode.POP, [Mode.O, Mode.A]);
  }

  /* Parses and emits an instruction as bytes */
  #emitInstructionBytes(op, validModes, long = false) {
    if (!validModes) {
      this.#emitO(op);
      return;
    }

    const args = this.#getArguments();
    const mode = this.#getModeFromArguments(args);

    if (mode === null || !validModes.includes(mode)) {
      const rArgs = this.#getModeAsString(mode);
      const eArgs = validModes.map((m) => this.#getModeAsString(m)).join("; ");
      const msg = `incorrect arguments (received ${rArgs}, expected one of: ${eArgs})`;

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
        this.#emitK(op, ...values, long);
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

  /* Gets a list of arguments for an instruction */
  #getArguments() {
    const args = [];
    while (true) {
      const arg = this.#getArgument();
      if (arg === null) {
        this.#hasLeftoverToken = true;
        break;
      }

      args.push(arg);
      if (!this.#expect(TokenType.COMMA)) {
        this.#hasLeftoverToken = true;
        break;
      }
    }

    return args;
  }

  /* Gets the next token as an argument */
  #getArgument() {
    let token = this.#assembleToken();
    switch (token.type) {
      case TokenType.NUMBER:
      case TokenType.REGISTER:
        return token;
      case TokenType.LABEL:
        return this.#resolveLabel(token);
    }

    this.#token = token;
    return null;
  }

  /* Resolves a label's address, if possible */
  #resolveLabel(token) {
    const label = token.lexeme;
    if (this.#labels.has(label)) {
      const addr = this.#labels.get(label);
      return this.#createToken(TokenType.NUMBER, addr);
    }

    const addr = this.#pos;
    if (this.#unresolvedLabels.has(label)) {
      const labels = this.#unresolvedLabels.get(label);
      labels.push(addr);
    } else {
      this.#unresolvedLabels.set(label, [addr]);
    }

    return this.#createToken(TokenType.NUMBER, 0);
  }

  /* Gets the mode from a list of arguments
   * TODO: Refactor...
   */
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

  /* Turns a mode into a user-friendly string */
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

  /* Turns a token type into a user-friendly */
  #getTypeAsString(type) {
    switch (type) {
      case TokenType.INSTRUCTION:
        return "instruction";
      case TokenType.IDENTIFIER:
        return "identifier";
      case TokenType.LABEL:
        return "label";
      case TokenType.NUMBER:
        return "number";
      case TokenType.REGISTER:
        return "register";
      case TokenType.DIRECTIVE:
        return "directive";
      case TokenType.COMMA:
        return "comma";
      case TokenType.ERROR:
        return "error";
      case TokenType.EOF:
        return "EOF";
    }
  }

  /* Returns the values of arguments */
  #getValuesFromArguments(args) {
    return args.map(this.#getValueFromArgument);
  }

  /* Returns the value of an argument */
  #getValueFromArgument(arg) {
    switch (arg.type) {
      case TokenType.NUMBER:
      case TokenType.REGISTER:
        return arg.lexeme;
    }

    return null;
  }

  /* Emits O op */
  #emitO(op) {
    const instruction = this.#createInstruction(op, Mode.O);
    this.#emit(instruction);
  }

  /* Emits A op */
  #emitA(op, a) {
    const opcode = this.#createInstruction(op, Mode.A);
    const arg = this.#prepareA(a);

    this.#emit(opcode);
    this.#emit(arg);
  }

  /* Emits K op */
  #emitK(op, k, long) {
    const constant = this.#prepareK(k);

    if (long) {
      const opcode = this.#createInstruction(op, Mode.KK);
      this.#emit(opcode);

      const lo = constant & 0xff;
      this.#emit(lo);

      const hi = (constant >> 8) & 0xff;
      this.#emit(hi);
    } else {
      const opcode = this.#createInstruction(op, Mode.K);
      this.#emit(opcode | (constant << 8));
    }
  }

  /* Emits AB op */
  #emitAB(op, a, b) {
    const opcode = this.#createInstruction(op, Mode.AB);
    const args = this.#prepareA(a) | this.#prepareB(b);

    this.#emit(opcode);
    this.#emit(args);
  }

  /* Emits ABC op */
  #emitABC(op, a, b, c) {
    const opcode = this.#createInstruction(op, Mode.ABC);
    const args = this.#prepareA(a) | this.#prepareB(b);

    this.#emit(opcode);
    this.#emit(args);
    this.#emit(this.#prepareC(c));
  }

  /* Emits ABK op */
  #emitABK(op, a, b, k) {
    const opcode = this.#createInstruction(op, Mode.ABK);
    const args = this.#prepareA(a) | this.#prepareB(b);
    const constant = this.#prepareK(k);

    this.#emit(opcode);
    this.#emit(args);
    this.#emit(constant);
  }

  /* Emits AK op */
  #emitAK(op, a, k) {
    const opcode = this.#createInstruction(op, Mode.AK);
    const arg = this.#prepareA(a);
    const constant = this.#prepareK(k);

    this.#emit(opcode);
    this.#emit(arg);
    this.#emit(constant);
  }

  /* Prepare A register for instruction */
  #prepareA(a) {
    return a & 0x07;
  }

  /* Prepare B register for instruction */
  #prepareB(b) {
    return (b & 0x07) << 3;
  }

  /* Prepare C register for instruction */
  #prepareC(c) {
    return c & 0x07;
  }

  /* Prepare K constant for instruction */
  #prepareK(k) {
    return k & 0xffff;
  }

  /* Emits an instruction */
  #emit(instruction) {
    this.#program[this.#pos++] = instruction;
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
