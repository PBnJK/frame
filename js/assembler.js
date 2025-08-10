/* assembler.js
 * Assembles FRAME programs into machine code
 */

"use strict";

const START_POINT = "main";

const LABEL_LSB = "<";
const LABEL_MSB = ">";

const TokenType = {
  INSTRUCTION: 0,
  IDENTIFIER: 1,
  LABEL: 2,
  IMMEDIATE: 3,
  REGISTER: 4,
  DIRECTIVE: 5,
  ADDRESS: 6,
  INDIRECT: 7,

  COMMA: 8,
  RPAREN: 9,

  ERROR: 254,
  EOF: 255,
};

const Opcode = {
  /* HLT family */
  HLT_A: 0x0,
  HLT_K: 0x1,
  HLT_O: 0x2,

  /* MOV family */
  MOV_APB: 0x3,
  MOV_APK: 0x4,
  MOV_AIB: 0x5,
  MOV_AIK: 0x6,
  MOV_PAB: 0x7,
  MOV_PAK: 0x8,
  MOV_AB: 0x9,
  MOV_AK: 0xa,
  MOV_AP: 0xb,
  MOV_KA: 0xc,
  MOV_KK: 0xd,
  MOV_PA: 0xe,
  MOV_PK: 0xf,

  /* JMP family*/
  JMP_PA: 0x10,
  JMP_PK: 0x11,
  JMP_P: 0x12,

  /* BRT family */
  BRT_PA: 0x13,
  BRT_PK: 0x14,
  BRT_P: 0x15,

  /* BRF family */
  BRF_PA: 0x16,
  BRF_PK: 0x17,
  BRF_P: 0x18,

  /* EQU family */
  EQU_AB: 0x19,
  EQU_AK: 0x1a,
  EQU_PA: 0x1b,
  EQU_PK: 0x1c,

  /* LSS family */
  LSS_AB: 0x1d,
  LSS_AK: 0x1e,

  /* AND family */
  AND_ABC: 0x1f,
  AND_ABK: 0x20,
  AND_AB: 0x21,
  AND_AK: 0x22,

  /* OR family */
  OR_ABC: 0x23,
  OR_ABK: 0x24,
  OR_AB: 0x25,
  OR_AK: 0x26,

  /* XOR family */
  XOR_ABC: 0x27,
  XOR_ABK: 0x28,
  XOR_AB: 0x29,
  XOR_AK: 0x2a,

  /* NOT family */
  NOT_AB: 0x2b,
  NOT_AK: 0x2c,
  NOT_A: 0x2d,
  NOT_O: 0x2e,

  /* LSH family */
  LSH_ABC: 0x2f,
  LSH_ABK: 0x30,
  LSH_AB: 0x31,
  LSH_AK: 0x32,
  LSH_A: 0x33,

  /* RSH family */
  RSH_ABC: 0x34,
  RSH_ABK: 0x35,
  RSH_AB: 0x36,
  RSH_AK: 0x37,
  RSH_A: 0x38,

  /* ROL family */
  ROL_A: 0x39,
  ROL_K: 0x3a,
  ROL_P: 0x3b,

  /* ROR family */
  ROR_A: 0x3c,
  ROR_K: 0x3d,
  ROR_P: 0x3e,

  /* ADD family */
  ADD_ABC: 0x3f,
  ADD_ABK: 0x40,
  ADD_AB: 0x41,
  ADD_AK: 0x42,

  /* INC family */
  INC_A: 0x43,
  INC_P: 0x44,

  /* DEC family */
  DEC_A: 0x45,
  DEC_P: 0x46,

  /* CALL family */
  CALL_P: 0x47,

  /* RET family */
  RET_O: 0x48,

  /* PUSH family */
  PUSH_A: 0x49,
  PUSH_K: 0x4a,

  /* POP family */
  POP_A: 0x4b,
  POP_O: 0x4c,

  /* SEI family */
  SEI_A: 0x4d,
  SEI_K: 0x4e,
  SEI_O: 0x4f,

  /* CHY family */
  CHY_O: 0x50,
};

const Mode = {
  O: 0x0,

  A: 0x1 /* Register */,
  K: 0x2 /* Immediate */,
  P: 0x3 /* Address  */,

  AB: 0x4 /* Register, Register */,
  AK: 0x5 /* Register, Immediate */,
  AP: 0x6 /* Register, Address */,
  KA: 0x7 /* Immediate, Register */,
  KK: 0x8 /* Immediate, Immediate */,
  PA: 0x9 /* Address, Register */,
  PK: 0xa /* Address, Immediate */,

  ABC: 0xb /* Register, Register, Register */,
  ABK: 0xc /* Register, Register, Immediate */,
  APB: 0xd /* Register, Address, Register */,
  APK: 0xe /* Register, Address, Immediate */,
  AIB: 0xf /* Register, Indirect, Register */,
  AIK: 0x10 /* Register, Indirect, Immediate */,
  PAB: 0x11 /* Address, Register, Register */,
  PAK: 0x12 /* Address, Register, Immediate */,
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

  #unresolvedLsbLabels;
  #unresolvedMsbLabels;

  #modeTrie;
  #opMap;
  #modeMap;
  #debugInfo;

  #defines;

  #startPoint;

  constructor() {
    this.#ensureEnumUnique(Opcode);
    this.#ensureEnumUnique(Mode);

    this.#initModeTrie();
    this.#initOpMap();
    this.#debugInfo = new Map();
  }

  /* Ensures that an "enum" has unique values */
  #ensureEnumUnique(e) {
    const v = Object.values(e);
    const s = new Set(v);

    if (v.length !== s.size) {
      throw new Error(`Enum ${e} is not unique`);
    }
  }

  /* Initializes the mode trie that will be used to turn arguments into instruction modes
   * Resources:
   * - https://en.wikipedia.org/wiki/Trie
   * - https://learnersbucket.com/tutorials/data-structures/trie-data-structure-in-javascript/
   */
  #initModeTrie() {
    class TrieNode {
      #children;
      #end;

      constructor() {
        this.#children = {};
        this.#end = null;
      }

      hasChild(key) {
        return key in this.#children;
      }

      setChild(key, value) {
        this.#children[key] = value;
      }

      getChild(key) {
        return this.#children[key];
      }

      setEnd(end) {
        this.#end = end;
      }

      getEnd() {
        return this.#end;
      }
    }

    class Trie {
      #root;

      constructor() {
        this.#root = new TrieNode();
      }

      insertMode(modeList, end) {
        let curr = this.#root;
        for (const mode of modeList) {
          if (!curr.hasChild(mode)) {
            const newNode = new TrieNode();
            curr.setChild(mode, newNode);
          }

          curr = curr.getChild(mode);
        }

        curr.setEnd(end);
      }

      findMode(modeList) {
        let curr = this.#root;
        for (const mode of modeList) {
          if (curr.hasChild(mode)) {
            curr = curr.getChild(mode);
          } else {
            return false;
          }
        }

        return curr.getEnd();
      }
    }

    this.#modeTrie = new Trie();
    this.#modeTrie.insertMode([TokenType.REGISTER], Mode.A);
    this.#modeTrie.insertMode([TokenType.IMMEDIATE], Mode.K);
    this.#modeTrie.insertMode([TokenType.ADDRESS], Mode.P);

    this.#modeTrie.insertMode(
      [TokenType.REGISTER, TokenType.REGISTER],
      Mode.AB,
    );

    this.#modeTrie.insertMode(
      [TokenType.REGISTER, TokenType.IMMEDIATE],
      Mode.AK,
    );

    this.#modeTrie.insertMode(
      [TokenType.IMMEDIATE, TokenType.REGISTER],
      Mode.KA,
    );

    this.#modeTrie.insertMode(
      [TokenType.IMMEDIATE, TokenType.IMMEDIATE],
      Mode.KK,
    );

    this.#modeTrie.insertMode([TokenType.REGISTER, TokenType.ADDRESS], Mode.AP);
    this.#modeTrie.insertMode([TokenType.ADDRESS, TokenType.REGISTER], Mode.PA);
    this.#modeTrie.insertMode(
      [TokenType.ADDRESS, TokenType.IMMEDIATE],
      Mode.PK,
    );

    this.#modeTrie.insertMode(
      [TokenType.REGISTER, TokenType.REGISTER, TokenType.REGISTER],
      Mode.ABC,
    );

    this.#modeTrie.insertMode(
      [TokenType.REGISTER, TokenType.REGISTER, TokenType.IMMEDIATE],
      Mode.ABK,
    );

    this.#modeTrie.insertMode(
      [TokenType.REGISTER, TokenType.ADDRESS, TokenType.REGISTER],
      Mode.APB,
    );

    this.#modeTrie.insertMode(
      [TokenType.REGISTER, TokenType.ADDRESS, TokenType.IMMEDIATE],
      Mode.APK,
    );

    this.#modeTrie.insertMode(
      [TokenType.REGISTER, TokenType.INDIRECT, TokenType.REGISTER],
      Mode.AIB,
    );

    this.#modeTrie.insertMode(
      [TokenType.REGISTER, TokenType.INDIRECT, TokenType.IMMEDIATE],
      Mode.AIK,
    );

    this.#modeTrie.insertMode(
      [TokenType.ADDRESS, TokenType.REGISTER, TokenType.REGISTER],
      Mode.PAB,
    );

    this.#modeTrie.insertMode(
      [TokenType.ADDRESS, TokenType.REGISTER, TokenType.IMMEDIATE],
      Mode.PAK,
    );
  }

  /* Initializes the map that matches a mnemonic to its opcode */
  #initOpMap() {
    this.#opMap = new Map();

    this.#opMap.set("hlt", {
      [Mode.A]: Opcode.HLT_A,
      [Mode.K]: Opcode.HLT_K,
      [Mode.O]: Opcode.HLT_O,
    });

    this.#opMap.set("mov", {
      [Mode.APB]: Opcode.MOV_APB,
      [Mode.APK]: Opcode.MOV_APK,
      [Mode.AIB]: Opcode.MOV_AIB,
      [Mode.AIK]: Opcode.MOV_AIK,
      [Mode.PAB]: Opcode.MOV_PAB,
      [Mode.PAK]: Opcode.MOV_PAK,
      [Mode.AB]: Opcode.MOV_AB,
      [Mode.AK]: Opcode.MOV_AK,
      [Mode.KA]: Opcode.MOV_KA,
      [Mode.KK]: Opcode.MOV_KK,
      [Mode.AP]: Opcode.MOV_AP,
      [Mode.PA]: Opcode.MOV_PA,
      [Mode.PK]: Opcode.MOV_PK,
    });

    this.#opMap.set("jmp", {
      [Mode.PA]: Opcode.JMP_PA,
      [Mode.PK]: Opcode.JMP_PK,
      [Mode.P]: Opcode.JMP_P,
    });

    this.#opMap.set("brt", {
      [Mode.PA]: Opcode.BRT_PA,
      [Mode.PK]: Opcode.BRT_PK,
      [Mode.P]: Opcode.BRT_P,
    });

    this.#opMap.set("brf", {
      [Mode.PA]: Opcode.BRF_PA,
      [Mode.PK]: Opcode.BRF_PK,
      [Mode.P]: Opcode.BRF_P,
    });

    this.#opMap.set("equ", {
      [Mode.AB]: Opcode.EQU_AB,
      [Mode.AK]: Opcode.EQU_AK,
      [Mode.PA]: Opcode.EQU_PA,
      [Mode.PK]: Opcode.EQU_PK,
    });

    this.#opMap.set("lss", {
      [Mode.AB]: Opcode.LSS_AB,
      [Mode.AK]: Opcode.LSS_AK,
    });

    this.#opMap.set("and", {
      [Mode.ABC]: Opcode.AND_ABC,
      [Mode.ABK]: Opcode.AND_ABK,
      [Mode.AB]: Opcode.AND_AB,
      [Mode.AK]: Opcode.AND_AK,
    });

    this.#opMap.set("or", {
      [Mode.ABC]: Opcode.OR_ABC,
      [Mode.ABK]: Opcode.OR_ABK,
      [Mode.AB]: Opcode.OR_AB,
      [Mode.AK]: Opcode.OR_AK,
    });

    this.#opMap.set("xor", {
      [Mode.ABC]: Opcode.XOR_ABC,
      [Mode.ABK]: Opcode.XOR_ABK,
      [Mode.AB]: Opcode.XOR_AB,
      [Mode.AK]: Opcode.XOR_AK,
    });

    this.#opMap.set("not", {
      [Mode.AB]: Opcode.NOT_AB,
      [Mode.AK]: Opcode.NOT_AK,
      [Mode.A]: Opcode.NOT_A,
      [Mode.O]: Opcode.NOT_O,
    });

    this.#opMap.set("lsh", {
      [Mode.ABC]: Opcode.LSH_ABC,
      [Mode.ABK]: Opcode.LSH_ABK,
      [Mode.AB]: Opcode.LSH_AB,
      [Mode.AK]: Opcode.LSH_AK,
      [Mode.A]: Opcode.LSH_A,
    });

    this.#opMap.set("rsh", {
      [Mode.ABC]: Opcode.RSH_ABC,
      [Mode.ABK]: Opcode.RSH_ABK,
      [Mode.AB]: Opcode.RSH_AB,
      [Mode.AK]: Opcode.RSH_AK,
      [Mode.A]: Opcode.RSH_A,
    });

    this.#opMap.set("rol", {
      [Mode.A]: Opcode.ROL_A,
      [Mode.K]: Opcode.ROL_K,
      [Mode.P]: Opcode.ROL_P,
    });

    this.#opMap.set("ror", {
      [Mode.A]: Opcode.ROR_A,
      [Mode.K]: Opcode.ROR_K,
      [Mode.P]: Opcode.ROR_P,
    });

    this.#opMap.set("add", {
      [Mode.ABC]: Opcode.ADD_ABC,
      [Mode.ABK]: Opcode.ADD_ABK,
      [Mode.AB]: Opcode.ADD_AB,
      [Mode.AK]: Opcode.ADD_AK,
    });

    this.#opMap.set("inc", {
      [Mode.A]: Opcode.INC_A,
      [Mode.P]: Opcode.INC_P,
    });

    this.#opMap.set("dec", {
      [Mode.A]: Opcode.DEC_A,
      [Mode.P]: Opcode.DEC_P,
    });

    this.#opMap.set("call", { [Mode.P]: Opcode.CALL_P });

    this.#opMap.set("ret", { [Mode.O]: Opcode.RET_O });

    this.#opMap.set("push", {
      [Mode.A]: Opcode.PUSH_A,
      [Mode.K]: Opcode.PUSH_K,
    });

    this.#opMap.set("pop", {
      [Mode.A]: Opcode.POP_A,
      [Mode.O]: Opcode.POP_O,
    });

    this.#opMap.set("sei", {
      [Mode.A]: Opcode.SEI_A,
      [Mode.K]: Opcode.SEI_K,
      [Mode.O]: Opcode.SEI_O,
    });

    this.#opMap.set("chy", { [Mode.O]: Opcode.CHY_O });

    this.#modeMap = new Map();
    for (const objs of this.#opMap.values()) {
      for (const [k, v] of Object.entries(objs)) {
        this.#modeMap.set(v, Number(k));
      }
    }
  }

  /* Assembles a FRAME assembly program, with extra info */
  assembleProgramWithInfo(source, extraInfo) {
    const program = this.assembleProgram(source, extraInfo);
    const info = {
      labels: this.#labels,
      defines: this.#defines,
    };

    return [program, info];
  }

  /* Assembles FRAME assembly programs */
  assembleProgram(source, extraInfo) {
    this.reset();

    if (extraInfo) {
      this.#loadExtraInfo(extraInfo);
    }

    this.#source = source;
    this.#assemble();

    if (this.#hadError) {
      return null;
    }

    return {
      program: this.#program,
      main: this.#startPoint,
      debug: this.#debugInfo,
    };
  }

  /* Resets the assembler to a safe initial state */
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
    this.#unresolvedLsbLabels = new Map();
    this.#unresolvedMsbLabels = new Map();

    this.#defines = new Map();

    this.#startPoint = 0;
  }

  /* Loads information given by the user */
  #loadExtraInfo(extraInfo) {
    const labels = extraInfo.labels;
    if (labels) {
      for (const [k, v] of labels) {
        this.#labels.set(k, v);
      }
    }

    const defines = extraInfo.defines;
    if (defines) {
      for (const [k, v] of defines) {
        this.#defines.set(k, v);
      }
    }
  }

  /* Assembles the loaded FRAME assembly program */
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

    const unresolved = new Map([
      ...this.#unresolvedLabels,
      ...this.#unresolvedLsbLabels,
      ...this.#unresolvedMsbLabels,
    ]);

    if (unresolved.size !== 0) {
      let msg = "the following label(s) could not be resolved:\n";
      for (const k of unresolved.keys()) {
        msg += `- "${k}"\n`;
      }

      const err = this.#createError(msg);
      this.#logError(err);
    }

    if (this.#labels.has(START_POINT)) {
      const addr = this.#labels.get(START_POINT);
      this.#startPoint = addr;
    } else {
      this.#startPoint = 0;
    }
  }

  /* Logs an error to the browser console
   * TODO: Custom console (or alert-likes?)
   */
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
      case "%":
        return this.#assembleAddress();
      case "(":
        return this.#assembleIndirect();
      case "'":
        return this.#assembleCharacter();
      case ",":
        return this.#createToken(TokenType.COMMA, char);
      case ")":
        return this.#createToken(TokenType.RPAREN, char);
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
    this.#line++;
    this.#char = 1;
  }

  /* Assembles an identifier (instruction or defined identifier) */
  #assembleIdentifier() {
    this.#rewind();
    const identifier = this.#readIdentifier();
    if (this.#opMap.has(identifier)) {
      return this.#createToken(TokenType.INSTRUCTION, identifier);
    }

    return this.#createToken(TokenType.IDENTIFIER, identifier);
  }

  /* Reads the next identifier */
  #readIdentifier() {
    const start = this.#idx;
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
          return this.#createToken(TokenType.IMMEDIATE, this.#readHexNumber());
        case "o":
          return this.#createToken(
            TokenType.IMMEDIATE,
            this.#readOctalNumber(),
          );
        case "b":
          return this.#createToken(
            TokenType.IMMEDIATE,
            this.#readBinaryNumber(),
          );
      }
    }

    this.#rewind();
    return this.#createToken(TokenType.IMMEDIATE, this.#readDecimalNumber());
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
    switch (this.#peek()) {
      case LABEL_LSB:
      case LABEL_MSB: {
        const type = this.#advance();
        const label = this.#readIdentifier();
        return this.#createToken(TokenType.IMMEDIATE, {
          label: label,
          type: type,
        });
      }
      default: {
        const label = this.#readIdentifier();
        return this.#createToken(TokenType.LABEL, label);
      }
    }
  }

  /* Assembles a register */
  #assembleRegister() {
    const char = this.#peek();
    if (char === "s") {
      return this.#createToken(TokenType.REGISTER, SP);
    }

    if (!this.#isHex(char)) {
      return this.#createError(`expected register number, got "${char}"`);
    }

    const num = this.#readHexNumber();
    if (num > 15) {
      return this.#createError(`no such register \$${num}`);
    }

    return this.#createToken(TokenType.REGISTER, num);
  }

  /* Assembles a directive */
  #assembleDirective() {
    const identifier = this.#readIdentifier();
    return this.#createToken(TokenType.DIRECTIVE, identifier);
  }

  /* Assembles an address */
  #assembleAddress() {
    const start = this.#peek();
    if (!this.#isHex(start)) {
      const msg = `expected start of address after '%', got '${start}'`;
      return this.#createError(msg);
    }

    const addr = this.#readHexNumber();
    if (addr >= MEMORY_SIZE) {
      const msg = `address %${addr} is outside the 16-bit addressable range`;
      return this.#createError(msg);
    }

    return this.#createToken(TokenType.ADDRESS, addr);
  }

  /* Assembles an indirect zero-page address */
  #assembleIndirect() {
    const token = this.#assembleToken();
    if (token.type !== TokenType.IMMEDIATE) {
      const type = this.#getTypeAsString(token.type);
      const msg = `expected an immediate zero-page address after '(' got '${type}'`;
      return this.#createError(msg);
    }

    if (!this.#expect(TokenType.RPAREN)) {
      const type = this.#getTypeAsString(this.#token.type);
      const msg = `expected closing parenthesis, got '${type}'`;
      return this.#createError(msg);
    }

    const addr = token.lexeme;
    if (addr > 0xff) {
      const msg = `'${addr}' is not a valid zero-page address (must be a single byte)`;
      return this.#createError(msg);
    }

    return this.#createToken(TokenType.INDIRECT, addr);
  }

  /* Assembles an ASCII character */
  #assembleCharacter() {
    let char = this.#advance();
    if (char === "\\") {
      const next = this.#advance();
      switch (next) {
        case "n":
          char = "\n";
          break;
        default:
          return this.#createError(`'\\${next}' is not a valid character`);
      }
    }

    const quote = this.#advance();
    if (quote !== "'") {
      const msg = `expected closing quote, got '${quote}'`;
      return this.#createError(msg);
    }

    const ascii = char.charCodeAt(0) & 0xff;
    return this.#createToken(TokenType.IMMEDIATE, ascii);
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
      case TokenType.IMMEDIATE:
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
    const op = token.lexeme;
    const opMap = this.#opMap.get(op);

    return this.#handleInstruction(op, opMap);
  }

  /* Emits a label */
  #emitLabel(token) {
    const label = token.lexeme;
    const addr = this.#pos;

    if (label[0] !== "_" && this.#labels.get(label)) {
      const msg = `tried to redefine label ${label}. only labels that start with "_" may be redefined`;
      return this.#createError(msg);
    }

    this.#labels.set(label, addr);

    const unresolved = this.#unresolvedLabels.get(label);
    if (unresolved) {
      this.#fixUnresolvedLabel(label, addr, unresolved);
    }

    const unresolvedLsb = this.#unresolvedLsbLabels.get(label);
    if (unresolvedLsb) {
      const lo = addr & 0xff;
      this.#fixUnresolvedLabelImmediate(lo, unresolvedLsb);
      this.#unresolvedLsbLabels.delete(label);
    }

    const unresolvedMsb = this.#unresolvedMsbLabels.get(label);
    if (unresolvedMsb) {
      const hi = (addr >> 8) & 0xff;
      this.#fixUnresolvedLabelImmediate(hi, unresolvedMsb);
      this.#unresolvedMsbLabels.delete(label);
    }
  }

  /* Fixes a now-declared unresolved label */
  #fixUnresolvedLabel(label, addr, unresolved) {
    const lo = addr & 0xff;
    const hi = (addr >> 8) & 0xff;

    const fix = (at) => {
      this.#program[at++] = lo;
      this.#program[at] = hi;
    };

    for (let i of unresolved) {
      let op = this.#program[i++];
      const mode = this.#modeMap.get(op);
      switch (mode) {
        case Mode.P:
        case Mode.PA:
        case Mode.PK:
        case Mode.APB:
        case Mode.PAB:
        case Mode.APK:
        case Mode.PAK:
          fix(i);
          break;
        case Mode.AP:
          fix(i + 1);
          break;
      }
    }

    this.#unresolvedLabels.delete(label);
  }

  /* Fixes a now-declared unresolved label in an immediate token */
  #fixUnresolvedLabelImmediate(addr, unresolved) {
    const fix = (at) => {
      this.#program[at] = addr;
    };

    for (let i of unresolved) {
      let op = this.#program[i++];
      const mode = this.#modeMap.get(op);
      switch (mode) {
        case Mode.K:
          fix(i);
          break;
        case Mode.AK:
        case Mode.ABK:
          fix(i + 1);
          break;
        case Mode.PK:
          fix(i + 2);
          break;
        case Mode.APK:
        case Mode.PAK:
          fix(i + 3);
          break;
      }
    }
  }

  /* Emits a directive */
  #emitDirective(token) {
    const directives = {
      addr: this.#emitDirectiveAddr.bind(this),
      byte: this.#emitDirectiveByte.bind(this),
      def: this.#emitDirectiveDef.bind(this),
      word: this.#emitDirectiveWord.bind(this),
    };

    const directive = directives[token.lexeme];
    if (directive) {
      return directive();
    }

    return this.#createError(`no such directive ".${token.lexeme}"`);
  }

  /* Emits a .addr directive
   * Sets the address to where bytes are written
   */
  #emitDirectiveAddr() {
    const [addr, err] = this.#getDirectiveArg();
    if (err) {
      return err;
    }

    this.#pos = addr;
  }

  /* Emits a .byte directive
   * Emits a single byte "as-is"
   */
  #emitDirectiveByte() {
    while (true) {
      const [byte, err] = this.#getDirectiveArg();
      if (err) {
        break;
      }

      this.#emit(byte);

      if (!this.#expect(TokenType.COMMA)) {
        this.#hasLeftoverToken = true;
        break;
      }
    }
  }

  /* Emits a .def directive
   * Defines an alias for a value
   */
  #emitDirectiveDef() {
    const ident = this.#assembleToken();
    if (!ident) {
      return this.#createError("couldn't get define name");
    }

    if (ident.type !== TokenType.IDENTIFIER) {
      const type = this.#getTypeAsString(ident.type);
      return this.#createError(`expected identifier, got "${type}"`);
    }

    const value = this.#assembleToken();
    if (!value) {
      return this.#createError("couldn't get define value");
    }

    const name = ident.lexeme;
    this.#defines.set(name, value);
  }

  /* Emits a .word directive
   * Emits a single 16-bit word (two bytes) "as-is"
   */
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

  /* Parses and emits an instruction  */
  #handleInstruction(opName, opMap) {
    if (this.#peek() === "\n") {
      const mode = Mode.O;
      return this.#emitOpFromArgs(mode, opName, opMap, []);
    }

    const [args, err] = this.#getArguments();
    if (err) {
      return err;
    }

    const mode = this.#getModeFromArguments(args);
    return this.#emitOpFromArgs(mode, opName, opMap, args);
  }

  /* Emits an operation as bytes */
  #emitOpFromArgs(mode, opName, opMap, args) {
    const op = opMap[mode];
    if (!op || mode === null) {
      const rArgs = this.#getModeAsString(mode);
      const eArgs = Object.keys(opMap)
        .map((m) => this.#getModeAsString(Number(m)))
        .join("; ");
      const msg = `incorrect arguments for ${opName} (received ${rArgs}, expected one of: ${eArgs})`;

      return this.#createError(msg);
    }

    const values = this.#getValuesFromArguments(args);
    this.#emitDebug(opName, values);

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
      case Mode.P:
        this.#emitP(op, ...values);
        break;
      case Mode.AB:
        this.#emitAB(op, ...values);
        break;
      case Mode.AK:
        this.#emitAK(op, ...values);
        break;
      case Mode.KA:
        this.#emitKA(op, ...values);
        break;
      case Mode.KK:
        this.#emitKK(op, ...values);
        break;
      case Mode.AP:
        this.#emitAP(op, ...values);
        break;
      case Mode.PA:
        this.#emitPA(op, ...values);
        break;
      case Mode.PK:
        this.#emitPK(op, ...values);
        break;
      case Mode.ABC:
        this.#emitABC(op, ...values);
        break;
      case Mode.ABK:
        this.#emitABK(op, ...values);
        break;
      case Mode.APB:
        this.#emitAPB(op, ...values);
        break;
      case Mode.APK:
        this.#emitAPK(op, ...values);
        break;
      case Mode.AIB:
        this.#emitAIB(op, ...values);
        break;
      case Mode.AIK:
        this.#emitAIK(op, ...values);
        break;
      case Mode.PAB:
        this.#emitPAB(op, ...values);
        break;
      case Mode.PAK:
        this.#emitPAK(op, ...values);
        break;
      default: {
        const asString = this.#getModeAsString(mode);
        const msg = `got unknown or unhandled mode ${asString}`;
        return this.#createError(msg);
      }
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

      if (arg.type === TokenType.ERROR) {
        return [null, arg];
      }

      args.push(arg);
      if (!this.#expect(TokenType.COMMA)) {
        this.#hasLeftoverToken = true;
        break;
      }
    }

    return [args, null];
  }

  /* Gets the next token as an argument */
  #getArgument() {
    let token = this.#assembleToken();
    switch (token.type) {
      case TokenType.REGISTER:
      case TokenType.ADDRESS:
      case TokenType.INDIRECT:
        return token;
      case TokenType.IMMEDIATE:
        return this.#resolveImmediate(token);
      case TokenType.LABEL:
        return this.#resolveLabel(token);
      case TokenType.IDENTIFIER:
        return this.#resolveIdentifier(token);
    }

    this.#token = token;
    return token.type === TokenType.ERROR ? token : null;
  }

  /* Resolves an immediate value */
  #resolveImmediate(token) {
    const value = token.lexeme;
    if (typeof value === "number") {
      return token;
    }

    const label = value.label;
    const type = value.type;

    if (this.#labels.has(label)) {
      const addr = this.#labels.get(label);
      if (type === LABEL_LSB) {
        token.lexeme = addr & 0xff;
      } else {
        token.lexeme = (addr >> 8) & 0xff;
      }

      return token;
    }

    const labelMap =
      type === LABEL_LSB
        ? this.#unresolvedLsbLabels
        : this.#unresolvedMsbLabels;

    const addr = this.#pos;
    if (labelMap.has(label)) {
      const labels = labelMap.get(label);
      labels.push(addr);
    } else {
      labelMap.set(label, [addr]);
    }

    token.lexeme = 0;
    return token;
  }

  /* Resolves a label's address, if possible */
  #resolveLabel(token) {
    const label = token.lexeme;
    if (this.#labels.has(label)) {
      const addr = this.#labels.get(label);
      return this.#createToken(TokenType.ADDRESS, addr);
    }

    const addr = this.#pos;
    if (this.#unresolvedLabels.has(label)) {
      const labels = this.#unresolvedLabels.get(label);
      labels.push(addr);
    } else {
      this.#unresolvedLabels.set(label, [addr]);
    }

    return this.#createToken(TokenType.ADDRESS, 0);
  }

  /* Resolves an identifier's value, if possible */
  #resolveIdentifier(token) {
    const ident = token.lexeme;
    if (!this.#defines.has(ident)) {
      return null;
    }

    return this.#defines.get(ident);
  }

  /* Gets the mode from a list of arguments */
  #getModeFromArguments(args) {
    if (args.length === 0) {
      return Mode.O;
    }

    const modeList = args.map((a) => a.type);
    return this.#modeTrie.findMode(modeList);
  }

  /* Turns a mode into a user-friendly string */
  #getModeAsString(mode) {
    switch (mode) {
      case Mode.O:
        return "no arguments";
      case Mode.A:
        return "register";
      case Mode.K:
        return "immediate";
      case Mode.P:
        return "address";
      case Mode.AB:
        return "register, register";
      case Mode.AK:
        return "register, immediate";
      case Mode.KA:
        return "immediate, register";
      case Mode.KK:
        return "immediate, immediate";
      case Mode.AP:
        return "register, address";
      case Mode.PA:
        return "address, register";
      case Mode.PK:
        return "address, immediate";
      case Mode.ABC:
        return "register, register, register";
      case Mode.ABK:
        return "register, register, immediate";
      case Mode.APB:
        return "register, address, register";
      case Mode.APK:
        return "register, address, immediate";
      case Mode.AIB:
        return "register, indirect, register";
      case Mode.AIK:
        return "register, indirect, immediate";
      case Mode.PAB:
        return "address, register, register";
      case Mode.PAK:
        return "address, register, immediate";
      default:
        return mode.toString();
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
      case TokenType.IMMEDIATE:
        return "immediate";
      case TokenType.REGISTER:
        return "register";
      case TokenType.DIRECTIVE:
        return "directive";
      case TokenType.ADDRESS:
        return "address";
      case TokenType.INDIRECT:
        return "indirect address";
      case TokenType.COMMA:
        return "comma (',')";
      case TokenType.RPAREN:
        return "right parentesis (')')";
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
      case TokenType.IMMEDIATE:
      case TokenType.REGISTER:
      case TokenType.ADDRESS:
      case TokenType.INDIRECT:
        return arg.lexeme;
    }

    return null;
  }

  /* Emits debug info for an op */
  #emitDebug(op, values) {
    const args = [];
    for (const arg of values) {
      args.push(arg.toString());
    }

    const argsString = args.join(", ");

    const pos = this.#pos;
    const info = `${pos} ${op} ${argsString}`;
    this.#debugInfo.set(pos, info);
  }

  /* Emits O op */
  #emitO(op) {
    this.#emit(op);
  }

  /* Emits A op */
  #emitA(op, a) {
    const arg = this.#prepareA(a);

    this.#emit(op);
    this.#emit(arg);
  }

  /* Emits K op */
  #emitK(op, k) {
    const K = this.#prepareK(k);

    this.#emit(op);
    this.#emit(K);
  }

  /* Emits P op */
  #emitP(op, p) {
    const [lo, hi] = this.#prepareP(p);

    this.#emit(op);
    this.#emit(lo);
    this.#emit(hi);
  }

  /* Emits AB op */
  #emitAB(op, a, b) {
    const AB = this.#prepareA(a) | this.#prepareB(b);

    this.#emit(op);
    this.#emit(AB);
  }

  /* Emits AK op */
  #emitAK(op, a, k) {
    const K = this.#prepareK(k);

    this.#emitA(op, a);
    this.#emit(K);
  }

  /* Emits KA op */
  #emitKA(op, k, a) {
    const A = this.#prepareA(a);

    this.#emitK(op, k);
    this.#emit(A);
  }

  /* Emits KK op */
  #emitKK(op, k, l) {
    const K = this.#prepareK(l);

    this.#emitK(op, k);
    this.#emit(K);
  }

  /* Emits AP op */
  #emitAP(op, a, p) {
    const [lo, hi] = this.#prepareP(p);

    this.#emitA(op, a);
    this.#emit(lo);
    this.#emit(hi);
  }

  /* Emits PA op */
  #emitPA(op, p, a) {
    const A = this.#prepareA(a);

    this.#emitP(op, p);
    this.#emit(A);
  }

  /* Emits PK op */
  #emitPK(op, p, k) {
    const K = this.#prepareK(k);

    this.#emitP(op, p);
    this.#emit(K);
  }

  /* Emits ABC op */
  #emitABC(op, a, b, c) {
    const C = this.#prepareC(c);

    this.#emitAB(op, a, b);
    this.#emit(C);
  }

  /* Emits ABK op */
  #emitABK(op, a, b, k) {
    const K = this.#prepareK(k);

    this.#emitAB(op, a, b);
    this.#emit(K);
  }

  /* Emits APB op */
  #emitAPB(op, a, p, b) {
    this.#emitPAB(op, p, a, b);
  }

  /* Emits APK op */
  #emitAPK(op, a, p, k) {
    this.#emitPAK(op, p, a, k);
  }

  /* Emits AIB op */
  #emitAIB(op, a, i, b) {
    this.#emitABK(op, a, b, i);
  }

  /* Emits AIK op */
  #emitAIK(op, a, i, k) {
    const K = this.#prepareK(k);

    this.#emitAK(op, a, i);
    this.#emit(K);
  }

  /* Emits PAB op */
  #emitPAB(op, p, a, b) {
    const AB = this.#prepareA(a) | this.#prepareB(b);

    this.#emitP(op, p);
    this.#emit(AB);
  }

  /* Emits PAK op */
  #emitPAK(op, p, a, k) {
    const A = this.#prepareA(a);
    const K = this.#prepareK(k);

    this.#emitP(op, p);
    this.#emit(A);
    this.#emit(K);
  }

  /* Prepare A register for instruction */
  #prepareA(a) {
    return a & 0xf;
  }

  /* Prepare B register for instruction */
  #prepareB(b) {
    return (b & 0xf) << 4;
  }

  /* Prepare C register for instruction */
  #prepareC(c) {
    return c & 0xf;
  }

  /* Prepare K immediate for instruction */
  #prepareK(k) {
    return k & 0xff;
  }

  /* Prepare P address for instruction */
  #prepareP(p) {
    const lo = p & 0xff;
    const hi = (p >> 8) & 0xff;

    return [lo, hi];
  }

  /* Emits an instruction */
  #emit(instruction) {
    this.#program[this.#pos++] = instruction;
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

const assemble = (program, extraInfo) => {
  const assembler = new Assembler();
  return assembler.assembleProgram(program, extraInfo);
};

const assembleWithInfo = (program, extraInfo) => {
  const assembler = new Assembler();
  return assembler.assembleProgramWithInfo(program, extraInfo);
};
