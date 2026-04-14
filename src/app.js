import { Automata, AutomataError } from "./core/automata.js";
import { Evaluator } from "./core/evaluator.js";
import { Converter } from "./core/converter.js";
import { Minimizer } from "./core/minimizer.js";
import { getDefaultGraphLayout, renderAutomataSvg } from "./core/renderer.js";

const summaryCards = document.querySelector("#summary-cards");
const graphContainer = document.querySelector("#graph-container");
const transitionTableContainer = document.querySelector("#transition-table-container");
const transitionListContainer = document.querySelector("#transition-list-container");
const evaluationResults = document.querySelector("#evaluation-results");
const conversionResults = document.querySelector("#conversion-results");
const minimizationResults = document.querySelector("#minimization-results");
const errorBanner = document.querySelector("#error-banner");
const successBanner = document.querySelector("#success-banner");
const nodeList = document.querySelector("#node-list");
const quickNodeInput = document.querySelector("#node-quick-input");
const alphabetInput = document.querySelector("#alfabeto");
const typeSelect = document.querySelector("#tipo");
const moveModeButton = document.querySelector("#move-mode-button");
const connectModeButton = document.querySelector("#connect-mode-button");
const transitionDialog = document.querySelector("#transition-dialog");
const transitionDialogTitle = document.querySelector("#transition-dialog-title");
const transitionSymbolOptions = document.querySelector("#transition-symbol-options");
const stageNote = document.querySelector(".stage-note");

let editorState = createEmptyEditorState();
let currentAutomata = null;
let graphPositions = {};
let currentMode = "move";
let liveBuildTimer = null;
let draggingState = null;
let connectingState = null;
let previewPointer = null;
let pendingConnection = null;
let lastConversionResult = null;
let activeGraphSource = "editor";
let activeDisplayAutomata = null;

document.querySelector("#load-example-button").addEventListener("click", loadExample);
document.querySelector("#automata-form").addEventListener("submit", (event) => event.preventDefault());
document.querySelector("#evaluate-button").addEventListener("click", handleEvaluate);
document.querySelector("#convert-button").addEventListener("click", handleConvert);
document.querySelector("#minimize-button").addEventListener("click", handleMinimize);
conversionResults.addEventListener("click", handleConversionResultClick);
quickNodeInput.addEventListener("keydown", handleQuickNodeSubmit);
alphabetInput.addEventListener("input", handleAlphabetChange);
typeSelect.addEventListener("change", handleTypeChange);
nodeList.addEventListener("input", handleNodeListInput);
nodeList.addEventListener("click", handleNodeListClick);
moveModeButton.addEventListener("click", () => setMode("move"));
connectModeButton.addEventListener("click", () => setMode("connect"));
transitionDialog.addEventListener("close", handleTransitionDialogClose);
document.addEventListener("pointermove", handleGlobalPointerMove);
document.addEventListener("pointerup", stopPointerInteraction);

loadExample();

function createEmptyEditorState() {
  return {
    tipo: "AFD",
    alfabeto: [],
    estados: [],
    estadoInicial: "",
    estadosFinales: new Set(),
    transiciones: {},
  };
}

function loadExample() {
  editorState = {
    tipo: "AFND",
    alfabeto: ["a", "b"],
    estados: ["A", "B", "C", "D"],
    estadoInicial: "A",
    estadosFinales: new Set(["C"]),
    transiciones: {
      A: { a: new Set(["A", "D"]), b: new Set(["B"]) },
      B: { a: new Set(["C"]), b: new Set(["B"]) },
      C: { a: new Set(["C"]), b: new Set(["D"]) },
      D: { a: new Set(["C"]), b: new Set(["C", "D"]) },
    },
  };

  document.querySelector("#cadena-input").value = "ab";
  document.querySelector("#multi-cadenas-input").value = ["ab", "abb", "ba"].join("\n");
  syncInputsFromState();
  rebuildFromEditor({ silent: false, resetResults: true });
}

function syncInputsFromState() {
  typeSelect.value = editorState.tipo;
  alphabetInput.value = editorState.alfabeto.join(",");
}

function handleQuickNodeSubmit(event) {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  const value = quickNodeInput.value.trim();
  if (!value) {
    return;
  }

  if (editorState.estados.includes(value)) {
    showPreviewError(new AutomataError(`El nodo '${value}' ya existe.`));
    return;
  }

  editorState.estados.push(value);
  ensureStateReferences();
  quickNodeInput.value = "";
  rebuildFromEditor({ silent: false, resetResults: false });
}

function handleAlphabetChange() {
  if (liveBuildTimer) {
    clearTimeout(liveBuildTimer);
  }
  liveBuildTimer = setTimeout(() => {
    editorState.alfabeto = parseCommaList(alphabetInput.value);
    sanitizeTransitionsByAlphabet();
    rebuildFromEditor({ silent: true, resetResults: false });
  }, 180);
}

function handleTypeChange() {
  editorState.tipo = typeSelect.value;
  if (editorState.tipo === "AFD") {
    normalizeTransitionsForType();
  }
  rebuildFromEditor({ silent: false, resetResults: false });
}

function handleNodeListInput(event) {
  const item = event.target.closest("[data-node]");
  if (!item) {
    return;
  }

  const originalName = item.dataset.node;
  const nextName = event.target.value.trim();

  if (!nextName || nextName === originalName) {
    return;
  }

  if (editorState.estados.includes(nextName)) {
    showPreviewError(new AutomataError(`El nodo '${nextName}' ya existe.`));
    event.target.value = originalName;
    return;
  }

  renameState(originalName, nextName);
  rebuildFromEditor({ silent: true, resetResults: false });
}

function handleNodeListClick(event) {
  const action = event.target.dataset.action;
  const stateName = event.target.dataset.state;
  if (!action || !stateName) {
    return;
  }

  if (action === "delete") {
    removeState(stateName);
  }

  if (action === "initial") {
    editorState.estadoInicial = editorState.estadoInicial === stateName ? "" : stateName;
  }

  if (action === "final") {
    if (editorState.estadosFinales.has(stateName)) {
      editorState.estadosFinales.delete(stateName);
    } else {
      editorState.estadosFinales.add(stateName);
    }
  }

  rebuildFromEditor({ silent: false, resetResults: false });
}

function removeState(stateName) {
  editorState.estados = editorState.estados.filter((estado) => estado !== stateName);
  delete editorState.transiciones[stateName];

  for (const origen of Object.keys(editorState.transiciones)) {
    for (const simbolo of Object.keys(editorState.transiciones[origen])) {
      editorState.transiciones[origen][simbolo].delete(stateName);
      if (!editorState.transiciones[origen][simbolo].size) {
        delete editorState.transiciones[origen][simbolo];
      }
    }
  }

  if (editorState.estadoInicial === stateName) {
    editorState.estadoInicial = editorState.estados[0] ?? "";
  }
  editorState.estadosFinales.delete(stateName);
  delete graphPositions[stateName];
}

function renameState(previousName, nextName) {
  editorState.estados = editorState.estados.map((estado) => (estado === previousName ? nextName : estado));

  if (editorState.transiciones[previousName]) {
    editorState.transiciones[nextName] = editorState.transiciones[previousName];
    delete editorState.transiciones[previousName];
  }

  for (const origen of Object.keys(editorState.transiciones)) {
    for (const simbolo of Object.keys(editorState.transiciones[origen])) {
      const updatedDestinations = new Set(
        [...editorState.transiciones[origen][simbolo]].map((destino) => (destino === previousName ? nextName : destino)),
      );
      editorState.transiciones[origen][simbolo] = updatedDestinations;
    }
  }

  if (editorState.estadoInicial === previousName) {
    editorState.estadoInicial = nextName;
  }

  if (editorState.estadosFinales.has(previousName)) {
    editorState.estadosFinales.delete(previousName);
    editorState.estadosFinales.add(nextName);
  }

  if (graphPositions[previousName]) {
    graphPositions[nextName] = graphPositions[previousName];
    delete graphPositions[previousName];
  }
}

function rebuildFromEditor({ silent, resetResults }) {
  try {
    clearMessages();
    ensureStateReferences();
    activeGraphSource = "editor";

    const previewGraph = buildGraphModelForPreview();
    graphPositions = getDefaultGraphLayout(previewGraph, graphPositions);
    activeDisplayAutomata = previewGraph;
    renderAll(previewGraph);

    currentAutomata = buildAutomataFromEditorState();

    if (resetResults) {
      resetResultPanels();
    }

    if (!silent) {
      showSuccess("Automata actualizado.");
    }
  } catch (error) {
    currentAutomata = null;
    const previewGraph = buildGraphModelForPreview();
    graphPositions = getDefaultGraphLayout(previewGraph, graphPositions);
    activeDisplayAutomata = previewGraph;
    renderAll(previewGraph);

    if (!silent) {
      handleError(error);
    } else {
      showPreviewError(error);
    }
  }
}

function buildAutomataFromEditorState() {
  return new Automata({
    estados: editorState.estados,
    alfabeto: editorState.alfabeto,
    transiciones: editorState.transiciones,
    estadoInicial: editorState.estadoInicial,
    estadosFinales: [...editorState.estadosFinales],
    tipo: editorState.tipo,
  });
}

function buildGraphModelForPreview() {
  return {
    estados: [...editorState.estados],
    alfabeto: [...editorState.alfabeto],
    transiciones: editorState.transiciones,
    estadoInicial: editorState.estadoInicial,
    estadosFinales: new Set([...editorState.estadosFinales]),
    tipo: editorState.tipo,
  };
}

function renderAll(graphModel) {
  renderSummary(graphModel);
  renderNodeList(graphModel);
  renderTransitionList();
  renderTransitionTable(graphModel);
  renderGraph(graphModel);
}

function renderSummary(graphModel) {
  const summary = {
    tipo: graphModel.tipo || "-",
    Q: `{ ${graphModel.estados.join(", ")} }`,
    Sigma: `{ ${graphModel.alfabeto.join(", ")} }`,
    q0: graphModel.estadoInicial || "-",
    F: `{ ${[...graphModel.estadosFinales].join(", ")} }`,
  };

  summaryCards.innerHTML = [
    summaryItem("Tipo", summary.tipo),
    summaryItem("Conjunto Q", summary.Q),
    summaryItem("Alfabeto", summary.Sigma),
    summaryItem("Estado inicial", summary.q0),
    summaryItem("Finales", summary.F),
  ].join("");
}

function renderNodeList(graphModel) {
  if (activeGraphSource !== "editor") {
    nodeList.innerHTML = (graphModel?.estados?.length)
      ? graphModel.estados.map((estado) => `
        <article class="node-item">
          <div class="node-item-header">
            <strong>Nodo</strong>
          </div>
          <input type="text" value="${escapeHtml(estado)}" aria-label="Nodo ${escapeHtml(estado)}" disabled />
          <div class="node-item-actions">
            <span class="toggle-chip ${graphModel.estadoInicial === estado ? "is-active" : ""}">
              ${graphModel.estadoInicial === estado ? "Inicial" : "No inicial"}
            </span>
            <span class="toggle-chip ${graphModel.estadosFinales.has(estado) ? "is-active" : ""}">
              ${graphModel.estadosFinales.has(estado) ? "Final" : "No final"}
            </span>
          </div>
        </article>
      `).join("")
      : `<div class="empty-state">No hay nodos para mostrar.</div>`;
    return;
  }

  if (!editorState.estados.length) {
    nodeList.innerHTML = `<div class="empty-state">Agrega nodos escribiendo un nombre y presionando Enter.</div>`;
    return;
  }

  nodeList.innerHTML = editorState.estados.map((estado) => `
    <article class="node-item" data-node="${escapeHtml(estado)}">
      <div class="node-item-header">
        <strong>Nodo</strong>
        <button class="icon-button" type="button" data-action="delete" data-state="${escapeHtml(estado)}">Eliminar</button>
      </div>
      <input type="text" value="${escapeHtml(estado)}" aria-label="Nombre del nodo ${escapeHtml(estado)}" />
      <div class="node-item-actions">
        <button class="toggle-chip ${editorState.estadoInicial === estado ? "is-active" : ""}" type="button" data-action="initial" data-state="${escapeHtml(estado)}">
          ${editorState.estadoInicial === estado ? "Inicial" : "Marcar inicial"}
        </button>
        <button class="toggle-chip ${editorState.estadosFinales.has(estado) ? "is-active" : ""}" type="button" data-action="final" data-state="${escapeHtml(estado)}">
          ${editorState.estadosFinales.has(estado) ? "Final" : "Marcar final"}
        </button>
      </div>
    </article>
  `).join("");
}

function renderTransitionList() {
  const items = flattenTransitions(activeDisplayAutomata?.transiciones ?? editorState.transiciones);
  if (!items.length) {
    transitionListContainer.classList.add("empty-state");
    transitionListContainer.innerHTML = "Aun no hay recorridos.";
    return;
  }

  transitionListContainer.classList.remove("empty-state");
  transitionListContainer.innerHTML = items.map((item) => `
    <article class="transition-item">
      <div class="transition-item-header">
        <strong>${escapeHtml(item.origen)} -> ${escapeHtml(item.destino)}</strong>
        <span class="toggle-chip is-active">${escapeHtml(item.simbolos.join(", "))}</span>
      </div>
    </article>
  `).join("");
}

function renderTransitionTable(graphModel) {
  if (!graphModel.estados.length || !graphModel.alfabeto.length) {
    transitionTableContainer.classList.add("empty-state");
    transitionTableContainer.innerHTML = "Aun no hay datos.";
    return;
  }

  const rows = graphModel.estados.map((estado) => {
    const row = { estado };
    for (const simbolo of graphModel.alfabeto) {
      const destinos = [...(graphModel.transiciones[estado]?.[simbolo] ?? new Set())].sort();
      row[simbolo] = destinos.length ? destinos.join(", ") : "vacio";
    }
    return row;
  });

  transitionTableContainer.classList.remove("empty-state");
  transitionTableContainer.innerHTML = renderTable(rows);
}

function renderGraph(graphModel) {
  if (!graphModel.estados.length) {
    graphContainer.classList.add("empty-state");
    graphContainer.innerHTML = "Captura un automata para visualizarlo aqui.";
    updateStageNote();
    return;
  }

  graphContainer.classList.remove("empty-state");
  graphContainer.innerHTML = renderAutomataSvg(graphModel, graphPositions, {
    sourceState: connectingState,
    pointer: previewPointer,
  });
  attachGraphInteractions();
  updateModeButtons();
  updateStageNote();
}

function attachGraphInteractions() {
  const svg = graphContainer.querySelector(".graph-svg");
  if (!svg) {
    return;
  }

  svg.querySelectorAll(".graph-node").forEach((node) => {
    const targetState = node.dataset.state;

    node.addEventListener("pointerdown", (event) => {
      if (currentMode === "move" || activeGraphSource !== "editor") {
        draggingState = targetState;
      } else {
        connectingState = targetState;
        previewPointer = graphPositions[targetState];
      }
      node.classList.add(currentMode === "move" || activeGraphSource !== "editor" ? "dragging" : "connecting");
      event.preventDefault();
    });

    node.addEventListener("pointerup", (event) => {
      if (activeGraphSource !== "editor" || currentMode !== "connect" || !connectingState) {
        return;
      }

      pendingConnection = {
        origen: connectingState,
        destino: targetState,
      };
      openTransitionDialog();
      connectingState = null;
      previewPointer = null;
      renderGraph(buildGraphModelForPreview());
      event.preventDefault();
    });
  });
}

function handleGlobalPointerMove(event) {
  const svg = graphContainer.querySelector(".graph-svg");
  if (!svg) {
    return;
  }

  if (draggingState) {
    const point = pointerToSvg(event, svg);
    graphPositions[draggingState] = point;
    graphPositions = getDefaultGraphLayout(buildGraphModelForPreview(), graphPositions);
    renderGraph(buildGraphModelForPreview());
    const activeNode = graphContainer.querySelector(`[data-state="${CSS.escape(draggingState)}"]`);
    activeNode?.classList.add("dragging");
    return;
  }

  if (connectingState) {
    previewPointer = pointerToSvg(event, svg);
    renderGraph(buildGraphModelForPreview());
  }
}

function stopPointerInteraction() {
  draggingState = null;
  if (currentMode === "connect" && !pendingConnection) {
    connectingState = null;
    previewPointer = null;
  }
  renderGraph(buildGraphModelForPreview());
}

function pointerToSvg(event, svg) {
  const rect = svg.getBoundingClientRect();
  const viewBox = svg.viewBox.baseVal;
  return {
    x: ((event.clientX - rect.left) / rect.width) * viewBox.width,
    y: ((event.clientY - rect.top) / rect.height) * viewBox.height,
  };
}

function setMode(mode) {
  currentMode = mode;
  draggingState = null;
  connectingState = null;
  previewPointer = null;
  if (activeGraphSource !== "editor") {
    activeGraphSource = "editor";
  }
  updateModeButtons();
  renderGraph(buildGraphModelForPreview());
}

function updateModeButtons() {
  moveModeButton.classList.toggle("is-active", currentMode === "move");
  connectModeButton.classList.toggle("is-active", currentMode === "connect");
}

function openTransitionDialog() {
  if (!pendingConnection) {
    return;
  }

  if (!editorState.alfabeto.length) {
    handleError(new AutomataError("Define primero el alfabeto para crear recorridos."));
    pendingConnection = null;
    return;
  }

  transitionDialogTitle.textContent = `${pendingConnection.origen} -> ${pendingConnection.destino}`;
  transitionSymbolOptions.innerHTML = editorState.alfabeto.map((simbolo) => `
    <label class="symbol-option">
      <input type="checkbox" name="transition-symbol" value="${escapeHtml(simbolo)}" />
      <span>${escapeHtml(simbolo)}</span>
    </label>
  `).join("");

  transitionDialog.showModal();
}

function handleTransitionDialogClose() {
  if (transitionDialog.returnValue === "cancel" || !pendingConnection) {
    pendingConnection = null;
    return;
  }

  const selectedSymbols = [...transitionSymbolOptions.querySelectorAll("input:checked")].map((input) => input.value);
  if (!selectedSymbols.length) {
    pendingConnection = null;
    return;
  }

  for (const simbolo of selectedSymbols) {
    upsertTransition(pendingConnection.origen, simbolo, pendingConnection.destino);
  }

  pendingConnection = null;
  rebuildFromEditor({ silent: false, resetResults: false });
}

function upsertTransition(origen, simbolo, destino) {
  if (!editorState.transiciones[origen]) {
    editorState.transiciones[origen] = {};
  }

  if (!editorState.transiciones[origen][simbolo] || editorState.tipo === "AFD") {
    editorState.transiciones[origen][simbolo] = new Set();
  }

  if (editorState.tipo === "AFD") {
    editorState.transiciones[origen][simbolo] = new Set([destino]);
  } else {
    editorState.transiciones[origen][simbolo].add(destino);
  }
}

function flattenTransitions(transitionsSource) {
  const grouped = new Map();

  for (const [origen, mapa] of Object.entries(transitionsSource)) {
    for (const [simbolo, destinos] of Object.entries(mapa)) {
      for (const destino of destinos) {
        const key = `${origen}->${destino}`;
        if (!grouped.has(key)) {
          grouped.set(key, { origen, destino, simbolos: [] });
        }
        grouped.get(key).simbolos.push(simbolo);
      }
    }
  }

  return [...grouped.values()].map((item) => ({
    ...item,
    simbolos: item.simbolos.sort(),
  }));
}

function normalizeTransitionsForType() {
  for (const origen of Object.keys(editorState.transiciones)) {
    for (const simbolo of Object.keys(editorState.transiciones[origen])) {
      const firstDestination = [...editorState.transiciones[origen][simbolo]][0];
      editorState.transiciones[origen][simbolo] = firstDestination ? new Set([firstDestination]) : new Set();
    }
  }
}

function sanitizeTransitionsByAlphabet() {
  const allowed = new Set(editorState.alfabeto);
  for (const origen of Object.keys(editorState.transiciones)) {
    for (const simbolo of Object.keys(editorState.transiciones[origen])) {
      if (!allowed.has(simbolo)) {
        delete editorState.transiciones[origen][simbolo];
      }
    }
  }
}

function ensureStateReferences() {
  editorState.estados = unique(editorState.estados);
  editorState.alfabeto = unique(editorState.alfabeto);

  if (!editorState.estadoInicial && editorState.estados.length) {
    editorState.estadoInicial = editorState.estados[0];
  }

  if (editorState.estadoInicial && !editorState.estados.includes(editorState.estadoInicial)) {
    editorState.estadoInicial = editorState.estados[0] ?? "";
  }

  editorState.estadosFinales = new Set(
    [...editorState.estadosFinales].filter((estado) => editorState.estados.includes(estado)),
  );

  for (const estado of editorState.estados) {
    if (!editorState.transiciones[estado]) {
      editorState.transiciones[estado] = {};
    }
  }

  for (const origen of Object.keys(editorState.transiciones)) {
    if (!editorState.estados.includes(origen)) {
      delete editorState.transiciones[origen];
      continue;
    }

    for (const simbolo of Object.keys(editorState.transiciones[origen])) {
      editorState.transiciones[origen][simbolo] = new Set(
        [...editorState.transiciones[origen][simbolo]].filter((destino) => editorState.estados.includes(destino)),
      );
      if (!editorState.transiciones[origen][simbolo].size) {
        delete editorState.transiciones[origen][simbolo];
      }
    }
  }
}

function handleEvaluate() {
  withAutomata(() => {
    const evaluator = new Evaluator(currentAutomata);
    const cadena = document.querySelector("#cadena-input").value;
    const multiple = document.querySelector("#multi-cadenas-input").value;
    const results = [];

    if (`${cadena}`.trim()) {
      results.push(evaluator.evaluateString(cadena));
    }
    if (`${multiple}`.trim()) {
      results.push(...evaluator.evaluateMany(multiple));
    }
    if (!results.length) {
      throw new AutomataError("Escribe una cadena o varias lineas para evaluar.");
    }

    evaluationResults.classList.remove("empty-state");
    evaluationResults.innerHTML = results.map(renderEvaluationResult).join("");
    showSuccess("Evaluacion completada.");
  });
}

function handleConvert() {
  withAutomata(() => {
    const sourceAutomata = getOperationAutomata();
    const result = new Converter(sourceAutomata).convertByType();
    lastConversionResult = result;
    conversionResults.classList.remove("empty-state");
    conversionResults.innerHTML = renderConversionResult(result);
    showSuccess("Conversion completada.");
  });
}

function handleMinimize() {
  withAutomata(() => {
    const sourceAutomata = getOperationAutomata();
    const result = new Minimizer(sourceAutomata).minimize();
    minimizationResults.classList.remove("empty-state");
    minimizationResults.innerHTML = renderMinimizationResult(result);
    showSuccess("Minimizacion completada.");
  });
}

function withAutomata(callback) {
  try {
    clearMessages();
    if (!getOperationAutomata()) {
      throw new AutomataError("Debes definir un automata valido antes de ejecutar operaciones.");
    }
    callback();
  } catch (error) {
    handleError(error);
  }
}

function resetResultPanels() {
  evaluationResults.className = "results-shell empty-state";
  conversionResults.className = "results-shell empty-state";
  minimizationResults.className = "results-shell empty-state";
  evaluationResults.textContent = "Aqui apareceran los recorridos evaluados.";
  conversionResults.textContent = "La conversion aparecera aqui.";
  minimizationResults.textContent = "La minimizacion aparecera aqui.";
}

function renderTable(rows) {
  if (!rows.length) {
    return "<p>No hay informacion disponible.</p>";
  }

  const headers = Object.keys(rows[0]);
  return `
    <table>
      <thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${headers.map((header) => `<td>${row[header]}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  `;
}

function renderEvaluationResult(result) {
  return `
    <article class="result-card">
      <div class="result-card-header">
        <div><h3>Cadena: ${displayValue(result.cadena)}</h3><p>${result.mensaje}</p></div>
        <span class="pill ${result.aceptada ? "success" : "danger"}">${result.aceptada ? "Aceptada" : "Rechazada"}</span>
      </div>
      <div class="inline-list">
        <div><strong>Tipo:</strong> ${result.tipo}</div>
        <div><strong>Destino:</strong> ${displayValue(result.estadoFinal ?? result.estadosFinalesAlcanzados?.join(", "))}</div>
      </div>
      <div class="substeps">
        ${result.pasos.length ? result.pasos.map((paso) => renderEvaluationStep(result.tipo, paso)).join("") : `<div class="step-card"><strong>Cadena vacia:</strong> evaluacion directa desde el estado inicial.</div>`}
      </div>
    </article>
  `;
}

function renderEvaluationStep(tipo, paso) {
  if (tipo === "AFD") {
    return `<div class="step-card"><div class="step-card-header"><strong>Paso ${paso.numero}</strong><span>${paso.simbolo}</span></div><p>${paso.texto}</p></div>`;
  }

  return `
    <div class="step-card">
      <div class="step-card-header"><strong>Paso ${paso.numero}</strong><span>${paso.simbolo}</span></div>
      <p>${paso.textoResumen}</p>
      <div class="state-badge-row">${paso.estadosDespues.map((estado) => `<span class="state-chip">${estado}</span>`).join("") || "<span class='state-chip'>vacio</span>"}</div>
      <div class="substeps">${paso.detalle.map((item) => `<div class="step-card"><strong>${item.estado}</strong><p>${item.texto}</p></div>`).join("")}</div>
    </div>
  `;
}

function renderConversionResult(result) {
  const drawActions = result.automataResultante
    ? `
      <div class="actions conversion-draw-actions">
        <button class="secondary-button" type="button" data-action="draw-converted">
          Dibujar automata resultante
        </button>
        <button class="ghost-button" type="button" data-action="draw-original">
          Volver al original
        </button>
      </div>
    `
    : "";
  const equivalencias = result.equivalencias?.length
    ? `<div class="substeps"><div class="mini-title">Equivalencias</div>${result.equivalencias.map((item) => `<div class="step-card"><strong>${item.nombreAfd ?? item.nombreMinimo}</strong><p>${displayArray(item.subconjunto ?? item.grupoOriginal)}</p></div>`).join("")}</div>`
    : "";
  const pasos = result.pasos?.length
    ? `<div class="substeps"><div class="mini-title">Pasos</div>${result.pasos.map((paso) => `<div class="step-card"><strong>${paso.nombreEstadoAfd}</strong><p>Representa ${displayArray(paso.estadoOriginal)}</p>${paso.detalleSimbolos.map((detalle) => `<div class="step-card"><strong>Simbolo ${detalle.simbolo}</strong><p>${detalle.textoResumen}</p></div>`).join("")}</div>`).join("")}</div>`
    : "";
  return `<article class="result-card"><div class="result-card-header"><div><h3>${result.tipoConversion}</h3><p>${result.mensaje}</p></div></div>${drawActions}<div class="mini-title">Resultado</div>${renderTable(result.tablaResultante)}${equivalencias}${pasos}</article>`;
}

function renderMinimizationResult(result) {
  return `
    <article class="result-card">
      <div class="result-card-header"><div><h3>AFD minimo</h3><p>${result.mensaje}</p></div></div>
      <div class="step-card">
        <strong>Estados accesibles</strong>
        <p>${result.pasoInaccesibles.descripcion}</p>
        <div class="inline-list">
          <div><strong>Originales:</strong> ${displayArray(result.pasoInaccesibles.estadosOriginales)}</div>
          <div><strong>Accesibles:</strong> ${displayArray(result.pasoInaccesibles.estadosAccesibles)}</div>
          <div><strong>Eliminados:</strong> ${displayArray(result.pasoInaccesibles.estadosEliminados)}</div>
        </div>
      </div>
      <div class="step-card"><strong>Particion inicial</strong><p>${displayPartition(result.particionInicial)}</p></div>
      <div class="substeps"><div class="mini-title">Iteraciones</div>${result.iteraciones.map((iteracion, index) => `<div class="iteration-card"><strong>Iteracion ${index + 1}</strong><p><strong>Entrada:</strong> ${displayPartition(iteracion.particionEntrada)}</p><p><strong>Salida:</strong> ${displayPartition(iteracion.particionSalida)}</p></div>`).join("")}</div>
      <div class="step-card"><strong>Grupos finales</strong><p>${displayPartition(result.gruposFinales)}</p></div>
      <div class="mini-title">Tabla resultante</div>
      ${renderTable(result.tablaResultante)}
    </article>
  `;
}

function summaryItem(title, value) {
  return `<article class="summary-item"><h3>${title}</h3><p>${value || "-"}</p></article>`;
}

function parseCommaList(value) {
  return unique(
    `${value ?? ""}`
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function unique(items) {
  return [...new Set(items)];
}

function displayPartition(partition) {
  return partition.map((group) => `{ ${group.join(", ")} }`).join(" | ");
}

function displayArray(values) {
  return values?.length ? values.join(", ") : "sin elementos";
}

function displayValue(value) {
  if (value === "") {
    return "cadena vacia";
  }
  return value ?? "vacio";
}

function showSuccess(message) {
  successBanner.textContent = message;
  successBanner.classList.remove("is-hidden");
  errorBanner.classList.add("is-hidden");
}

function handleError(error) {
  console.error(error);
  errorBanner.textContent = error instanceof Error ? error.message : "Ocurrio un error inesperado.";
  errorBanner.classList.remove("is-hidden");
}

function showPreviewError(error) {
  errorBanner.textContent = error instanceof Error ? error.message : "No se pudo actualizar la vista previa.";
  errorBanner.classList.remove("is-hidden");
  successBanner.classList.add("is-hidden");
}

function clearMessages() {
  errorBanner.classList.add("is-hidden");
  successBanner.classList.add("is-hidden");
}

function escapeHtml(value) {
  return `${value}`
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function handleConversionResultClick(event) {
  const action = event.target.dataset.action;
  if (!action) {
    return;
  }

  if (action === "draw-converted") {
    drawConvertedAutomata();
  }

  if (action === "draw-original") {
    drawOriginalAutomata();
  }
}

function drawConvertedAutomata() {
  if (!lastConversionResult?.automataResultante) {
    handleError(new AutomataError("Primero ejecuta una conversion para poder dibujar su resultado."));
    return;
  }

  const graphModel = convertAutomataInstanceToGraphModel(lastConversionResult.automataResultante);
  currentMode = "move";
  graphPositions = getDefaultGraphLayout(graphModel, graphPositions);
  activeGraphSource = "converted";
  activeDisplayAutomata = graphModel;
  renderAll(graphModel);
  showSuccess("Mostrando el automata resultante de la conversion en el visor central.");
}

function drawOriginalAutomata() {
  const graphModel = buildGraphModelForPreview();
  graphPositions = getDefaultGraphLayout(graphModel, graphPositions);
  activeGraphSource = "editor";
  activeDisplayAutomata = graphModel;
  renderAll(graphModel);
  showSuccess("Mostrando nuevamente el automata original.");
}

function updateStageNote() {
  if (!stageNote) {
    return;
  }

  if (activeGraphSource === "converted") {
    stageNote.textContent = "Mostrando el automata resultante de la conversion. Las operaciones se aplican sobre esta vista.";
    return;
  }

  stageNote.textContent = currentMode === "connect"
    ? "Arrastra de un nodo a otro para crear un recorrido."
    : "Arrastra nodos para reordenar el automata.";
}

function convertAutomataInstanceToGraphModel(automata) {
  return {
    estados: [...automata.estados],
    alfabeto: [...automata.alfabeto],
    transiciones: automata.transiciones,
    estadoInicial: automata.estadoInicial,
    estadosFinales: new Set([...automata.estadosFinales]),
    tipo: automata.tipo,
  };
}

function getOperationAutomata() {
  if (activeGraphSource === "converted" && lastConversionResult?.automataResultante) {
    return lastConversionResult.automataResultante;
  }
  return currentAutomata;
}
