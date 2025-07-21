/* index.js
 * Main engine script
 */

"use strict";

const init = () => {
  const editorCodeEditor = document.getElementById("editor-code-editor");
  const runnerRunButton = document.getElementById("runner-run-button");
  const runnerStopButton = document.getElementById("runner-stop-button");

  runnerRunButton.addEventListener("click", () => {
    const sourceProgram = editorCodeEditor.value;

    const assembledProgram = assemble(sourceProgram);
    if (assembledProgram) {
      runProgram(assembledProgram);
    }
  });

  runnerStopButton.addEventListener("click", () => {
    stopProgram();
  });
};

init();
