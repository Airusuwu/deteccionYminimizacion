const WIDTH = 1120;
const HEIGHT = 780;
const NODE_RADIUS = 34;
const LABEL_HEIGHT = 26;

export function getDefaultGraphLayout(automata, previousPositions = {}) {
  const centerX = WIDTH / 2;
  const centerY = HEIGHT / 2;
  const orbitX = WIDTH * 0.28;
  const orbitY = HEIGHT * 0.3;
  const layout = {};

  automata.estados.forEach((estado, index) => {
    const previous = previousPositions[estado];
    if (previous) {
      layout[estado] = clampPosition(previous);
      return;
    }

    const angle = (Math.PI * 2 * index) / Math.max(automata.estados.length, 1) - Math.PI / 2;
    layout[estado] = clampPosition({
      x: centerX + Math.cos(angle) * orbitX,
      y: centerY + Math.sin(angle) * orbitY,
    });
  });

  return layout;
}

export function renderAutomataSvg(automata, positions, interaction = {}) {
  const edgeRecords = buildEdgeRecords(automata);
  const edgeMarkup = edgeRecords.map((edge) => renderEdge(edge, positions, edgeRecords)).join("");
  const previewMarkup = interaction.sourceState && interaction.pointer
    ? renderPreviewArrow(positions[interaction.sourceState], interaction.pointer)
    : "";

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
      ${edgeMarkup}
      ${previewMarkup}
      ${nodesMarkup}
    </svg>
  `;
}

function buildEdgeRecords(automata) {
  const grouped = new Map();

  for (const origen of automata.estados) {
    const transitions = automata.transiciones[origen] ?? {};
    for (const [simbolo, destinos] of Object.entries(transitions)) {
      for (const destino of destinos) {
        const key = `${origen}->${destino}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            origen,
            destino,
            simbolos: [],
          });
        }
        grouped.get(key).simbolos.push(simbolo);
      }
    }
  }

  return [...grouped.values()].map((edge) => ({
    ...edge,
    simbolos: edge.simbolos.sort(),
    label: edge.simbolos.sort().join(", "),
  }));
}

function renderEdge(edge, positions, allEdges) {
  const from = positions[edge.origen];
  const to = positions[edge.destino];

  if (!from || !to) {
    return "";
  }

  if (edge.origen === edge.destino) {
    return renderSelfLoop(from, edge.label);
  }

  const reverseKey = `${edge.destino}->${edge.origen}`;
  const hasReverse = allEdges.some((candidate) => `${candidate.origen}->${candidate.destino}` === reverseKey);
  const geometry = hasReverse
    ? createBidirectionalGeometry(edge.origen, edge.destino, from, to)
    : createSingleDirectionGeometry(from, to);

  const labelWidth = Math.max(78, 20 + edge.label.length * 10);

  return `
    <g class="graph-edge">
      <path d="${geometry.path}" stroke="var(--graph-stroke)" stroke-width="2.5" fill="none" marker-end="url(#arrowhead)" />
      <rect x="${geometry.label.x - labelWidth / 2}" y="${geometry.label.y - LABEL_HEIGHT / 2}" width="${labelWidth}" height="${LABEL_HEIGHT}" rx="13" fill="var(--graph-label-bg)"></rect>
      <text x="${geometry.label.x}" y="${geometry.label.y}" text-anchor="middle" dominant-baseline="middle" font-size="13">${escapeText(edge.label)}</text>
    </g>
  `;
}

function createSingleDirectionGeometry(from, to) {
  const vector = normalizeVector(to.x - from.x, to.y - from.y);
  const normal = { x: -vector.y, y: vector.x };
  const start = {
    x: from.x + vector.x * NODE_RADIUS,
    y: from.y + vector.y * NODE_RADIUS,
  };
  const end = {
    x: to.x - vector.x * NODE_RADIUS,
    y: to.y - vector.y * NODE_RADIUS,
  };
  const bend = Math.min(26, Math.max(12, distanceBetween(from, to) * 0.08));
  const control = {
    x: (start.x + end.x) / 2 + normal.x * bend,
    y: (start.y + end.y) / 2 + normal.y * bend,
  };
  const labelPoint = quadraticBezierPoint(start, control, end, 0.5);

  return {
    path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
    label: {
      x: labelPoint.x + normal.x * 12,
      y: labelPoint.y + normal.y * 12,
    },
  };
}

function createBidirectionalGeometry(origen, destino, from, to) {
  const vector = normalizeVector(to.x - from.x, to.y - from.y);
  const normal = { x: -vector.y, y: vector.x };
  const direction = origen.localeCompare(destino) < 0 ? 1 : -1;
  const arc = Math.min(118, Math.max(72, distanceBetween(from, to) * 0.26));
  const lane = 12 * direction;

  const start = {
    x: from.x + vector.x * NODE_RADIUS + normal.x * lane,
    y: from.y + vector.y * NODE_RADIUS + normal.y * lane,
  };
  const end = {
    x: to.x - vector.x * NODE_RADIUS + normal.x * lane,
    y: to.y - vector.y * NODE_RADIUS + normal.y * lane,
  };

  const control1 = {
    x: start.x + normal.x * arc + vector.x * 24,
    y: start.y + normal.y * arc + vector.y * 24,
  };
  const control2 = {
    x: end.x + normal.x * arc - vector.x * 24,
    y: end.y + normal.y * arc - vector.y * 24,
  };

  const labelPoint = cubicBezierPoint(start, control1, control2, end, 0.5);

  return {
    path: `M ${start.x} ${start.y} C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${end.x} ${end.y}`,
    label: {
      x: labelPoint.x + normal.x * 18,
      y: labelPoint.y + normal.y * 18,
    },
  };
}

function renderSelfLoop(position, label) {
  const { x, y } = position;
  const labelWidth = Math.max(74, 20 + label.length * 10);

  return `
    <g class="graph-edge">
      <path d="M ${x - 12} ${y - 30} C ${x - 48} ${y - 92}, ${x + 48} ${y - 92}, ${x + 12} ${y - 30}" stroke="var(--graph-stroke)" stroke-width="2.5" fill="none" marker-end="url(#arrowhead)" />
      <rect x="${x - labelWidth / 2}" y="${y - 126}" width="${labelWidth}" height="${LABEL_HEIGHT}" rx="13" fill="var(--graph-label-bg)"></rect>
      <text x="${x}" y="${y - 113}" text-anchor="middle" dominant-baseline="middle" font-size="13">${escapeText(label)}</text>
    </g>
  `;
}

function renderPreviewArrow(from, to) {
  const geometry = createSingleDirectionGeometry(from, to);
  return `
    <g class="graph-edge graph-edge-preview" pointer-events="none">
      <path d="${geometry.path}" stroke="var(--graph-preview)" stroke-width="4" stroke-dasharray="10 6" fill="none" marker-end="url(#arrowhead)" opacity="1" />
    </g>
  `;
}

function normalizeVector(dx, dy) {
  const distance = Math.hypot(dx, dy) || 1;
  return {
    x: dx / distance,
    y: dy / distance,
  };
}

function distanceBetween(from, to) {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function quadraticBezierPoint(start, control, end, t) {
  return {
    x: ((1 - t) ** 2 * start.x) + (2 * (1 - t) * t * control.x) + ((t ** 2) * end.x),
    y: ((1 - t) ** 2 * start.y) + (2 * (1 - t) * t * control.y) + ((t ** 2) * end.y),
  };
}

function cubicBezierPoint(start, control1, control2, end, t) {
  return {
    x: ((1 - t) ** 3 * start.x)
      + (3 * ((1 - t) ** 2) * t * control1.x)
      + (3 * (1 - t) * (t ** 2) * control2.x)
      + ((t ** 3) * end.x),
    y: ((1 - t) ** 3 * start.y)
      + (3 * ((1 - t) ** 2) * t * control1.y)
      + (3 * (1 - t) * (t ** 2) * control2.y)
      + ((t ** 3) * end.y),
  };
}

function escapeText(value) {
  return `${value}`
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function clampPosition(position) {
  return {
    x: Math.min(Math.max(position.x, NODE_RADIUS + 28), WIDTH - NODE_RADIUS - 28),
    y: Math.min(Math.max(position.y, NODE_RADIUS + 28), HEIGHT - NODE_RADIUS - 28),
  };
}
