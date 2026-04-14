import { AutomataError } from "./automata.js";

export class Evaluator {
  constructor(automata) {
    this.automata = automata;
  }

  evaluateString(cadena) {
    const normalized = `${cadena ?? ""}`.trim();
    this.validateString(normalized);
    return this.automata.isAfd() ? this.evaluateAfd(normalized) : this.evaluateAfnd(normalized);
  }

  evaluateMany(text) {
    return `${text ?? ""}`.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => this.evaluateString(line));
  }

  validateString(cadena) {
    for (const simbolo of cadena) {
      if (!this.automata.alfabeto.includes(simbolo)) {
        throw new AutomataError(`El simbolo '${simbolo}' no pertenece al alfabeto del automata.`);
      }
    }
  }

  evaluateAfd(cadena) {
    let estadoActual = this.automata.estadoInicial;
    const pasos = [];
    if (!cadena) {
      const aceptada = this.automata.stateIsFinal(estadoActual);
      return { tipo: "AFD", cadena, pasos, aceptada, estadoFinal: estadoActual, mensaje: aceptada ? "Cadena aceptada" : "Cadena rechazada" };
    }
    for (const [indice, simbolo] of [...cadena].entries()) {
      const siguienteEstado = this.automata.getAfdTransition(estadoActual, simbolo);
      pasos.push({
        numero: indice + 1,
        estadoActual,
        simbolo,
        siguienteEstado: siguienteEstado ?? "vacio",
        texto: siguienteEstado ? `delta(${estadoActual}, ${simbolo}) = ${siguienteEstado}` : `delta(${estadoActual}, ${simbolo}) = vacio`,
      });
      if (!siguienteEstado) {
        return { tipo: "AFD", cadena, pasos, aceptada: false, estadoFinal: null, mensaje: "Cadena rechazada" };
      }
      estadoActual = siguienteEstado;
    }
    const aceptada = this.automata.stateIsFinal(estadoActual);
    return { tipo: "AFD", cadena, pasos, aceptada, estadoFinal: estadoActual, mensaje: aceptada ? "Cadena aceptada" : "Cadena rechazada" };
  }

  evaluateAfnd(cadena) {
    let estadosActuales = new Set([this.automata.estadoInicial]);
    const pasos = [];
    if (!cadena) {
      const aceptada = this.automata.setHasFinal(estadosActuales);
      return { tipo: "AFND", cadena, pasos, aceptada, estadosFinalesAlcanzados: [...estadosActuales].sort(), mensaje: aceptada ? "Cadena aceptada" : "Cadena rechazada" };
    }
    for (const [indice, simbolo] of [...cadena].entries()) {
      const detalle = [];
      const nuevosEstados = new Set();
      for (const estado of [...estadosActuales].sort()) {
        const destinos = [...this.automata.getTransition(estado, simbolo)].sort();
        for (const destino of destinos) nuevosEstados.add(destino);
        detalle.push({ estado, simbolo, destinos, texto: `delta(${estado}, ${simbolo}) = ${formatSet(destinos)}` });
      }
      pasos.push({
        numero: indice + 1,
        simbolo,
        estadosAntes: [...estadosActuales].sort(),
        detalle,
        estadosDespues: [...nuevosEstados].sort(),
        textoResumen: `Con '${simbolo}' se pasa de ${formatSet(estadosActuales)} a ${formatSet(nuevosEstados)}`,
      });
      estadosActuales = nuevosEstados;
      if (!estadosActuales.size) {
        return { tipo: "AFND", cadena, pasos, aceptada: false, estadosFinalesAlcanzados: [], mensaje: "Cadena rechazada" };
      }
    }
    const aceptada = this.automata.setHasFinal(estadosActuales);
    return { tipo: "AFND", cadena, pasos, aceptada, estadosFinalesAlcanzados: [...estadosActuales].sort(), mensaje: aceptada ? "Cadena aceptada" : "Cadena rechazada" };
  }
}

function formatSet(values) {
  const items = [...values].sort();
  return items.length ? `{ ${items.join(", ")} }` : "vacio";
}
