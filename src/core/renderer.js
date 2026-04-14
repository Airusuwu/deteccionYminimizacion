const WIDTH = 980;
const HEIGHT = 720;
const NODE_RADIUS = 34;

export function getDefaultGraphLayout(automata, previousPositions = {}) {
  const centerX = WIDTH / 2;
  const centerY = HEIGHT / 2;
  const orbit = Math.min(WIDTH, HEIGHT) * 0.3;
  const layout = {};

  automata.estados.forEach((estado, index) => {
    const previous = previousPositions[estado];
    if (previous) {
      layout[estado] = clampPosition(previous);
      return;
    }

    const angle = (Math.PI * 2 * index) / Math.max(automata.estados.length, 1) - Math.PI / 2;
    layout[estado] = clampPosition({
      x: centerX + Math.cos(angle) * orbit,
      y: centerY + Math.sin(angle) * orbit,
    });
  });

  return layout;
}

export function renderAutomataSvg(automata, positions, interaction = {}) {
  const edgesMarkup = buildEdgesMarkup(automata, positions, interaction);
  const nodesMarkup = automata.estados.map((estado) => {
    const { x, y } = positions[estado];
    const isInitial = estado === automata.estadoInicial;
    const isFinal = automata.estadosFinales.has(estado);
    const classNames = ["graph-node"];

    if (interaction.sourceState === estado) {
      classNames.push("connecting");
    }

    return `
      <g class="${classNames.join(" ")}" data-state="${escapeText(estado)}" transform="translate(${x}, ${y})">
        ${isInitial ? `<path d="M -96 0 L -44 0" stroke="var(--graph-stroke)" stroke-width="3" marker-end="url(#arrowhead)" fill="none" />` : ""}
        <circle cx="0" cy="0" r="${NODE_RADIUS}" fill="var(--graph-fill)" stroke="var(--graph-stroke)" stroke-width="3" />
        ${isFinal ? `<circle cx="0" cy="0" r="${NODE_RADIUS - 8}" fill="none" stroke="var(--graph-stroke)" stroke-width="2" />` : ""}
        <text x="0" y="6" text-anchor="middle" font-size="16" font-weight="700">${escapeText(estado)}</text>
      </g>
    `;
  }).join("");

  return `
    <svg class="graph-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Grafo del automata">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
          <path d="M 0 0 L 8 3 L 0 6 z" fill="var(--graph-stroke)"></path>
        </marker>
      </defs>
      ${edgesMarkup}
      ${nodesMarkup}
    </svg>
  `;
}

function buildEdgesMarkup(automata, positions, interaction) {
  const edgesByPair = new Map();

  for (const origen of automata.estados) {
    const mapa = automata.transiciones[origen] ?? {};
    for (const [simbolo, destinos] of Object.entries(mapa)) {
      for (const destino of destinos) {
        const key = `${origen}->${destino}`;
        if (!edgesByPair.has(key)) {
          edgesByPair.set(key, []);
        }
        edgesByPair.get(key).push(simbolo);
      }
    }
  }

  const baseEdges = [...edgesByPair.entries()].map(([pair, simbolos]) => {
    const [origen, destino] = pair.split("->");
    const from = positions[origen];
    const to = positions[destino];
    const label = simbolos.sort().join(", ");
    return origen === destino ? renderSelfLoop(from, label) : renderArrow(from, to, label);
  }).join("");

  if (interaction.sourceState && interaction.pointer) {
    const from = positions[interaction.sourceState];
    return `${baseEdges}${renderPreviewArrow(from, interaction.pointer)}`;
  }

  return baseEdges;
}

function renderArrow(from, to, label) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy) || 1;
  const unitX = dx / distance;
  const unitY = dy / distance;
  const startX = from.x + unitX * NODE_RADIUS;
  const startY = from.y + unitY * NODE_RADIUS;
  const endX = to.x - unitX * NODE_RADIUS;
  const endY = to.y - unitY * NODE_RADIUS;
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2 - 18;

  return `
    <g class="graph-edge">
      <path d="M ${startX} ${startY} L ${endX} ${endY}" stroke="var(--graph-stroke)" stroke-width="2.5" fill="none" marker-end="url(#arrowhead)" />
      <rect x="${midX - 36}" y="${midY - 16}" width="72" height="24" rx="12" fill="var(--graph-label-bg)"></rect>
      <text x="${midX}" y="${midY}" text-anchor="middle" dominant-baseline="middle" font-size="13">${escapeText(label)}</text>
    </g>
  `;
}

function renderSelfLoop(position, label) {
  const { x, y } = position;
  return `
    <g class="graph-edge">
      <path d="M ${x - 12} ${y - 30} C ${x - 48} ${y - 88}, ${x + 48} ${y - 88}, ${x + 12} ${y - 30}" stroke="var(--graph-stroke)" stroke-width="2.5" fill="none" marker-end="url(#arrowhead)" />
      <rect x="${x - 36}" y="${y - 118}" width="72" height="24" rx="12" fill="var(--graph-label-bg)"></rect>
      <text x="${x}" y="${y - 106}" text-anchor="middle" font-size="13">${escapeText(label)}</text>
    </g>
  `;
}

function renderPreviewArrow(from, to) {
  return `
    <g class="graph-edge graph-edge-preview" pointer-events="none">
      <path d="M ${from.x} ${from.y} L ${to.x} ${to.y}" stroke="var(--graph-preview)" stroke-width="4" stroke-dasharray="10 6" fill="none" marker-end="url(#arrowhead)" opacity="1" />
    </g>
  `;
}

function escapeText(value) {
  return `${value}`
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function clampPosition(position) {
  return {
    x: Math.min(Math.max(position.x, NODE_RADIUS + 20), WIDTH - NODE_RADIUS - 20),
    y: Math.min(Math.max(position.y, NODE_RADIUS + 20), HEIGHT - NODE_RADIUS - 20),
  };
}
