import { Automata, AutomataError } from "./automata.js";

export class Converter {
  constructor(automata) {
    this.automata = automata;
  }

  convertByType() {
    return this.automata.isAfnd() ? this.convertAfndToAfd() : this.convertAfdToAfnd();
  }

  convertAfndToAfd() {
    if (!this.automata.isAfnd()) {
      throw new AutomataError("La conversion AFND a AFD solo aplica a AFND.");
    }

    const initialSet = new Set([this.automata.estadoInicial]);
    const queue = [initialSet];
    const visited = [];
    const visitedKeys = new Set();
    const nameMap = new Map();
    const transitionTable = {};
    const pasos = [];
    let counter = 0;

    nameMap.set(toKey(initialSet), `S${counter++}`);

    while (queue.length) {
      const currentSet = queue.shift();
      const currentKey = toKey(currentSet);
      if (visitedKeys.has(currentKey)) continue;

      visited.push(currentSet);
      visitedKeys.add(currentKey);

      const currentName = nameMap.get(currentKey);
      transitionTable[currentName] = {};
      const detalleSimbolos = [];

      for (const simbolo of this.automata.alfabeto) {
        const unionDestinos = new Set();
        const detalleOrigenes = [];

        for (const estado of [...currentSet].sort()) {
          const destinos = [...this.automata.getTransition(estado, simbolo)].sort();
          for (const destino of destinos) unionDestinos.add(destino);
          detalleOrigenes.push({ estado, simbolo, destinos, texto: `delta(${estado}, ${simbolo}) = ${formatSet(destinos)}` });
        }

        const targetKey = toKey(unionDestinos);
        let targetName = "vacio";

        if (unionDestinos.size) {
          if (!nameMap.has(targetKey)) nameMap.set(targetKey, `S${counter++}`);
          targetName = nameMap.get(targetKey);
          transitionTable[currentName][simbolo] = new Set([targetName]);
          if (!visitedKeys.has(targetKey)) queue.push(new Set(unionDestinos));
        }

        detalleSimbolos.push({
          simbolo,
          detalleOrigenes,
          conjuntoResultante: [...unionDestinos].sort(),
          nombreEstadoResultante: targetName,
          textoResumen: `delta^(${formatSet(currentSet)}, ${simbolo}) = ${formatSet(unionDestinos)}`,
        });
      }

      pasos.push({
        estadoOriginal: [...currentSet].sort(),
        nombreEstadoAfd: currentName,
        esFinal: this.automata.setHasFinal(currentSet),
        detalleSimbolos,
      });
    }

    const estados = visited.map((setValue) => nameMap.get(toKey(setValue)));
    const estadoInicial = nameMap.get(toKey(initialSet));
    const estadosFinales = visited.filter((setValue) => this.automata.setHasFinal(setValue)).map((setValue) => nameMap.get(toKey(setValue)));

    const automataResultante = new Automata({
      estados,
      alfabeto: this.automata.alfabeto,
      transiciones: transitionTable,
      estadoInicial,
      estadosFinales,
      tipo: "AFD",
    });

    const equivalencias = visited.map((setValue) => ({
      nombreAfd: nameMap.get(toKey(setValue)),
      subconjunto: [...setValue].sort(),
      esFinal: this.automata.setHasFinal(setValue),
    }));

    return {
      tipoConversion: "AFND a AFD",
      mensaje: "Conversion realizada con el metodo de subconjuntos.",
      pasos,
      equivalencias,
      automataResultante,
      tablaResultante: automataResultante.transitionTable(),
      descripcionResultante: automataResultante.formalDescription(),
    };
  }

  convertAfdToAfnd() {
    if (!this.automata.isAfd()) {
      throw new AutomataError("La explicacion AFD a AFND solo aplica a AFD.");
    }
    return {
      tipoConversion: "AFD a AFND",
      mensaje: "No se requiere una conversion formal. Todo AFD ya es un caso particular de AFND porque cada estado y simbolo tiene a lo mucho un destino.",
      automataResultante: this.automata,
      tablaResultante: this.automata.transitionTable(),
      descripcionResultante: this.automata.formalDescription(),
    };
  }
}

function toKey(setValue) {
  return [...setValue].sort().join("|");
}

function formatSet(values) {
  const items = [...values].sort();
  return items.length ? `{ ${items.join(", ")} }` : "vacio";
}
