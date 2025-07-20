/* index.js
 * Main engine script
 */

const init = () => {
  const editorCodeEditor = document.getElementById("editor-code-editor");
  const editorRunButton = document.getElementById("editor-run-button");

  editorRunButton.addEventListener("click", (ev) => {
    const sourceProgram = editorCodeEditor.value;

    const assembledProgram = assemble(sourceProgram);
    runProgram(assembledProgram);
  });
};

init();
