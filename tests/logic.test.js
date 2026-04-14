import assert from "node:assert/strict";

import { Automata } from "../src/core/automata.js";
import { Evaluator } from "../src/core/evaluator.js";
import { Converter } from "../src/core/converter.js";
import { Minimizer } from "../src/core/minimizer.js";

const afnd = Automata.fromForm({
  estadosTexto: "A,B,C,D",
  alfabetoTexto: "a,b",
  estadoInicialTexto: "A",
  estadosFinalesTexto: "C",
  transicionesTexto: [
    "A,a=A,D",
    "A,b=B",
    "B,a=C",
    "B,b=B",
    "C,a=C",
    "C,b=D",
    "D,a=C",
    "D,b=C,D",
  ].join("\n"),
  tipo: "AFND",
});

const evalResult = new Evaluator(afnd).evaluateString("ab");
assert.equal(evalResult.aceptada, true);
assert.deepEqual(evalResult.estadosFinalesAlcanzados, ["B", "C", "D"]);

const conversion = new Converter(afnd).convertAfndToAfd();
assert.equal(conversion.automataResultante.tipo, "AFD");
assert.ok(conversion.equivalencias.length >= 1);

const minimizedConverted = new Minimizer(conversion.automataResultante).minimize();
assert.equal(minimizedConverted.automataResultante.tipo, "AFD");
assert.ok(
  minimizedConverted.automataResultante.estados.length <= conversion.automataResultante.estados.length,
);

const afd = Automata.fromForm({
  estadosTexto: "q0,q1,q2,q3",
  alfabetoTexto: "0,1",
  estadoInicialTexto: "q0",
  estadosFinalesTexto: "q2,q3",
  transicionesTexto: [
    "q0,0=q1",
    "q0,1=q2",
    "q1,0=q1",
    "q1,1=q2",
    "q2,0=q3",
    "q2,1=q2",
    "q3,0=q3",
    "q3,1=q2",
  ].join("\n"),
  tipo: "AFD",
});

const minimized = new Minimizer(afd).minimize();
assert.equal(minimized.automataResultante.tipo, "AFD");
assert.equal(minimized.automataResultante.estados.length, 2);

console.log("Pruebas de logica completadas correctamente.");
