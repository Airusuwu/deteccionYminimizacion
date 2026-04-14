import { Automata, AutomataError } from "./automata.js";

export class Minimizer {
  constructor(automata) {
    this.automata = automata;
  }

  minimize() {
    if (!this.automata.isAfd()) {
      throw new AutomataError("La minimizacion de este modulo solo se aplica a AFD.");
    }

    const usefulAutomata = this.removeInaccessible();
    const initialPartition = this.initialPartition(usefulAutomata);
    let currentPartition = initialPartition;
    const iterations = [];

    while (true) {
      const { newPartition, detail } = this.refinePartition(usefulAutomata, currentPartition);
      iterations.push(detail);
      if (partitionsEqual(currentPartition, newPartition)) {
        currentPartition = newPartition;
        break;
      }
      currentPartition = newPartition;
    }

    const { automataMinimo, equivalencias } = this.buildMinimalAutomata(usefulAutomata, currentPartition);

    return {
      mensaje: "Minimizacion realizada correctamente.",
      pasoInaccesibles: {
        estadosOriginales: [...this.automata.estados],
        estadosAccesibles: [...usefulAutomata.estados],
        estadosEliminados: this.automata.estados.filter((estado) => !usefulAutomata.estados.includes(estado)),
        descripcion: "Primero se eliminan los estados inaccesibles antes de comenzar la particion y refinamiento.",
      },
      particionInicial: formatPartition(initialPartition),
      iteraciones: iterations,
      gruposFinales: formatPartition(currentPartition),
      equivalencias,
      automataResultante: automataMinimo,
      tablaResultante: automataMinimo.transitionTable(),
      descripcionResultante: automataMinimo.formalDescription(),
    };
  }

  removeInaccessible() {
    const visited = new Set();
    const stack = [this.automata.estadoInicial];
    while (stack.length) {
      const actual = stack.pop();
      if (visited.has(actual)) continue;
      visited.add(actual);
      for (const simbolo of this.automata.alfabeto) {
        const destino = this.automata.getAfdTransition(actual, simbolo);
        if (destino && !visited.has(destino)) stack.push(destino);
      }
    }

    const transiciones = {};
    for (const estado of this.automata.estados) {
      if (!visited.has(estado)) continue;
      transiciones[estado] = {};
      for (const simbolo of this.automata.alfabeto) {
        const destino = this.automata.getAfdTransition(estado, simbolo);
        if (destino && visited.has(destino)) transiciones[estado][simbolo] = new Set([destino]);
      }
    }

    return new Automata({
      estados: this.automata.estados.filter((estado) => visited.has(estado)),
      alfabeto: [...this.automata.alfabeto],
      transiciones,
      estadoInicial: this.automata.estadoInicial,
      estadosFinales: [...this.automata.estadosFinales].filter((estado) => visited.has(estado)),
      tipo: "AFD",
    });
  }

  initialPartition(automata) {
    const noFinales = new Set(automata.estados.filter((estado) => !automata.estadosFinales.has(estado)));
    const finales = new Set([...automata.estadosFinales]);
    return [noFinales, finales].filter((group) => group.size);
  }

  refinePartition(automata, partition) {
    const newPartition = [];
    const detailGroups = [];
    for (const group of partition) {
      const subgroupBySignature = new Map();
      const stateDetail = [];
      for (const estado of [...group].sort()) {
        const signature = stateSignature(automata, estado, partition);
        if (!subgroupBySignature.has(signature)) subgroupBySignature.set(signature, new Set());
        subgroupBySignature.get(signature).add(estado);
        stateDetail.push({
          estado,
          firma: signature.split(",").map((item) => (item === "null" ? null : Number(item))),
          transiciones: detailTransitionsToGroups(automata, estado, partition),
        });
      }
      const subgroups = [...subgroupBySignature.values()].sort((left, right) => [...left].sort().join(",").localeCompare([...right].sort().join(",")));
      for (const subgroup of subgroups) newPartition.push(subgroup);
      detailGroups.push({
        grupoOriginal: [...group].sort(),
        detalleEstados: stateDetail,
        subgruposResultantes: subgroups.map((subgroup) => [...subgroup].sort()),
      });
    }
    return {
      newPartition,
      detail: {
        particionEntrada: formatPartition(partition),
        detalleGrupos: detailGroups,
        particionSalida: formatPartition(newPartition),
      },
    };
  }

  buildMinimalAutomata(automata, finalPartition) {
    const groupToName = new Map();
    const stateToGroup = new Map();
    finalPartition.forEach((group, index) => {
      const name = `M${index}`;
      groupToName.set(index, name);
      for (const estado of group) stateToGroup.set(estado, index);
    });

    const estados = finalPartition.map((_, index) => groupToName.get(index));
    const estadoInicial = groupToName.get(stateToGroup.get(automata.estadoInicial));
    const estadosFinales = finalPartition.map((group, index) => ({ group, index })).filter(({ group }) => [...group].some((estado) => automata.estadosFinales.has(estado))).map(({ index }) => groupToName.get(index));
    const transiciones = {};

    finalPartition.forEach((group, index) => {
      const originName = groupToName.get(index);
      const representative = [...group].sort()[0];
      transiciones[originName] = {};
      for (const simbolo of automata.alfabeto) {
        const destino = automata.getAfdTransition(representative, simbolo);
        if (!destino) continue;
        const targetGroup = stateToGroup.get(destino);
        transiciones[originName][simbolo] = new Set([groupToName.get(targetGroup)]);
      }
    });

    const automataMinimo = new Automata({ estados, alfabeto: automata.alfabeto, transiciones, estadoInicial, estadosFinales, tipo: "AFD" });
    const equivalencias = finalPartition.map((group, index) => ({
      nombreMinimo: groupToName.get(index),
      grupoOriginal: [...group].sort(),
      esInicial: group.has(automata.estadoInicial),
      esFinal: [...group].some((estado) => automata.estadosFinales.has(estado)),
    }));

    return { automataMinimo, equivalencias };
  }
}

function stateSignature(automata, estado, partition) {
  return automata.alfabeto.map((simbolo) => {
    const destino = automata.getAfdTransition(estado, simbolo);
    return destino ? indexOfStateInPartition(destino, partition) : null;
  }).join(",");
}

function detailTransitionsToGroups(automata, estado, partition) {
  return automata.alfabeto.map((simbolo) => {
    const destino = automata.getAfdTransition(estado, simbolo);
    const group = destino ? indexOfStateInPartition(destino, partition) : null;
    return {
      simbolo,
      destino: destino ?? "vacio",
      grupoDestino: group ?? "vacio",
      texto: destino ? `delta(${estado}, ${simbolo}) = ${destino} -> grupo ${group}` : `delta(${estado}, ${simbolo}) = vacio`,
    };
  });
}

function indexOfStateInPartition(estado, partition) {
  for (const [index, group] of partition.entries()) {
    if (group.has(estado)) return index;
  }
  return null;
}

function partitionsEqual(left, right) {
  const normalize = (partition) => new Set(partition.map((group) => [...group].sort().join("|")));
  const leftSet = normalize(left);
  const rightSet = normalize(right);
  if (leftSet.size !== rightSet.size) return false;
  for (const item of leftSet) if (!rightSet.has(item)) return false;
  return true;
}

function formatPartition(partition) {
  return partition.map((group) => [...group].sort());
}
