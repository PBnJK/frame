/* index.js
 * Main engine script
 */

"use strict";

const init = () => {
  const editorCodeEditor = document.getElementById("editor-code-editor");
  const runnerRunButton = document.getElementById("runner-run-button");
  const runnerAssembleButton = document.getElementById("runner-asm-button");
  const runnerStopButton = document.getElementById("runner-stop-button");
  const runnerPauseButton = document.getElementById("runner-pause-button");
  const runnerStepButton = document.getElementById("runner-step-button");
  const runnerDebugButton = document.getElementById("runner-debug-check");

  const asm = () => {
    const sourceProgram = editorCodeEditor.value;

    const kernelInfo = getKernelInfo();
    return assemble(sourceProgram, kernelInfo);
  };

  runnerRunButton.addEventListener("click", () => {
    const assembledProgram = asm();
    if (assembledProgram) {
      runProgram(assembledProgram);
    }
  });

  runnerAssembleButton.addEventListener("click", () => {
    const assembledProgram = asm();
    if (assembledProgram) {
      loadProgram(assembledProgram);
    }
  });

  runnerStopButton.addEventListener("click", () => {
    stopProgram();
  });

  runnerPauseButton.addEventListener("click", () => {
    if (isProgramPaused()) {
      runnerPauseButton.innerText = "Pause";
    } else {
      runnerPauseButton.innerText = "Unpause";
    }

    pauseProgram();
  });

  runnerStepButton.addEventListener("click", () => {
    stepProgram();
  });

  runnerDebugButton.addEventListener("click", (e) => {
    setDebug(e.target.checked);
  });
};

init();
