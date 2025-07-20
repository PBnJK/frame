/* index.js
 * Main engine script
 */

const init = () => {
  const editorCodeEditor = document.getElementById("editor-code-editor");
  const editorRunButton = document.getElementById("editor-run-button");
  const editorStopButton = document.getElementById("editor-stop-button");

  editorRunButton.addEventListener("click", () => {
    const sourceProgram = editorCodeEditor.value;

    const assembledProgram = assemble(sourceProgram);
    if (assembledProgram) {
      runProgram(assembledProgram);
    }
  });

  editorStopButton.addEventListener("click", () => {
    stopProgram();
  });
};

init();
