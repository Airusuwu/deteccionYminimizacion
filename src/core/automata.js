export class AutomataError extends Error {
  constructor(message) {
    super(message);
    this.name = "AutomataError";
  }
}

export class Automata {
  constructor({ estados, alfabeto, transiciones = {}, estadoInicial, estadosFinales = [], tipo = "AFD" }) {
    this.estados = Automata.cleanList(estados);
    this.alfabeto = Automata.cleanList(alfabeto);
    this.estadoInicial = `${estadoInicial ?? ""}`.trim();
    this.estadosFinales = new Set([...estadosFinales].map((item) => `${item}`.trim()).filter(Boolean));
    this.tipo = `${tipo ?? "AFD"}`.trim().toUpperCase();
    this.transiciones = {};

    if (!["AFD", "AFND"].includes(this.tipo)) {
      throw new AutomataError("El tipo debe ser AFD o AFND.");
    }

    this.validateBasics();
    this.transiciones = this.normalizeTransitions(transiciones);
    this.validateTransitions();
    this.validateType();
  }

  static cleanList(values = []) {
    const result = [];
    const seen = new Set();
    for (const value of values) {
      const clean = `${value ?? ""}`.trim();
      if (clean && !seen.has(clean)) {
        result.push(clean);
        seen.add(clean);
      }
    }
    return result;
  }

  validateBasics() {
    if (!this.estados.length) throw new AutomataError("Debes proporcionar al menos un estado.");
    if (!this.alfabeto.length) throw new AutomataError("Debes proporcionar al menos un simbolo del alfabeto.");
    if (!this.estadoInicial) throw new AutomataError("Debes proporcionar un estado inicial.");
    if (!this.estados.includes(this.estadoInicial)) {
      throw new AutomataError(`El estado inicial '${this.estadoInicial}' no pertenece al conjunto de estados.`);
    }
    for (const estadoFinal of this.estadosFinales) {
      if (!this.estados.includes(estadoFinal)) {
        throw new AutomataError(`El estado final '${estadoFinal}' no pertenece al conjunto de estados.`);
      }
    }
  }

  normalizeTransitions(transiciones) {
    const normalized = {};
    for (const [origenRaw, mapa] of Object.entries(transiciones)) {
      const origen = `${origenRaw}`.trim();
      normalized[origen] = {};
      for (const [simboloRaw, destinosRaw] of Object.entries(mapa)) {
        const simbolo = `${simboloRaw}`.trim();
        const destinos = Array.isArray(destinosRaw)
          ? destinosRaw
          : destinosRaw instanceof Set
            ? [...destinosRaw]
            : typeof destinosRaw === "string"
              ? [destinosRaw]
              : [];
        normalized[origen][simbolo] = new Set(destinos.map((destino) => `${destino}`.trim()).filter(Boolean));
      }
    }
    return normalized;
  }

  validateTransitions() {
    for (const [origen, mapa] of Object.entries(this.transiciones)) {
      if (!this.estados.includes(origen)) {
        throw new AutomataError(`El estado de origen '${origen}' en las transiciones no existe en Q.`);
      }
      for (const [simbolo, destinos] of Object.entries(mapa)) {
        if (!this.alfabeto.includes(simbolo)) {
          throw new AutomataError(`El simbolo '${simbolo}' en las transiciones no existe en el alfabeto.`);
        }
        for (const destino of destinos) {
          if (!this.estados.includes(destino)) {
            throw new AutomataError(`El estado destino '${destino}' no existe en el conjunto de estados.`);
          }
        }
      }
    }
  }

  validateType() {
    if (this.tipo !== "AFD") return;
    for (const mapa of Object.values(this.transiciones)) {
      for (const destinos of Object.values(mapa)) {
        if (destinos.size > 1) {
          throw new AutomataError("El automata esta marcado como AFD, pero existe una transicion con multiples destinos.");
        }
      }
    }
  }

  isAfd() { return this.tipo === "AFD"; }
  isAfnd() { return this.tipo === "AFND"; }
  getTransition(estado, simbolo) { return this.transiciones[estado]?.[simbolo] ?? new Set(); }
  getAfdTransition(estado, simbolo) { return [...this.getTransition(estado, simbolo)][0] ?? null; }
  stateIsFinal(estado) { return this.estadosFinales.has(`${estado}`.trim()); }
  setHasFinal(estados) { return [...estados].some((estado) => this.estadosFinales.has(estado)); }

  transitionTable() {
    return this.estados.map((estado) => {
      const row = { estado };
      for (const simbolo of this.alfabeto) {
        const destinos = [...this.getTransition(estado, simbolo)].sort();
        row[simbolo] = destinos.length ? destinos.join(", ") : "vacio";
      }
      return row;
    });
  }

  formalDescription() {
    return {
      Q: `{ ${this.estados.join(", ")} }`,
      Sigma: `{ ${this.alfabeto.join(", ")} }`,
      q0: this.estadoInicial,
      F: `{ ${[...this.estadosFinales].sort().join(", ")} }`,
      tipo: this.tipo,
    };
  }

  static fromForm({ estadosTexto, alfabetoTexto, estadoInicialTexto, estadosFinalesTexto, transicionesTexto, tipo }) {
    return new Automata({
      estados: estadosTexto.split(","),
      alfabeto: alfabetoTexto.split(","),
      estadoInicial: estadoInicialTexto,
      estadosFinales: estadosFinalesTexto.split(",").filter(Boolean),
      transiciones: Automata.parseTransitionsFromText(transicionesTexto),
      tipo,
    });
  }

  static parseTransitionsFromText(text) {
    const transitions = {};
    const lines = `${text ?? ""}`.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      if (!line.includes("=") || !line.includes(",")) {
        throw new AutomataError(`La transicion '${line}' no tiene el formato correcto. Usa origen,simbolo=destino1,destino2`);
      }
      const [left, right] = line.split("=", 2);
      const parts = left.split(",").map((part) => part.trim());
      if (parts.length !== 2) {
        throw new AutomataError(`La transicion '${line}' no tiene el formato correcto en la parte izquierda.`);
      }
      const [origen, simbolo] = parts;
      const destinos = right.split(",").map((destino) => destino.trim()).filter(Boolean);
      if (!destinos.length) {
        throw new AutomataError(`La transicion '${line}' debe tener al menos un estado destino.`);
      }
      if (!transitions[origen]) transitions[origen] = {};
      if (!transitions[origen][simbolo]) transitions[origen][simbolo] = new Set();
      for (const destino of destinos) transitions[origen][simbolo].add(destino);
    }
    return transitions;
  }
}
