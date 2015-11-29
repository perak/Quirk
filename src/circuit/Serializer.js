import CircuitDefinition from "src/circuit/CircuitDefinition.js"
import Complex from "src/math/Complex.js"
import Config from "src/Config.js"
import describe from "src/base/Describe.js"
import Format from "src/base/Format.js"
import Gate from "src/circuit/Gate.js"
import GateColumn from "src/circuit/GateColumn.js"
import GateFactory from "src/ui/GateFactory.js"
import Gates from "src/ui/Gates.js"
import Matrix from "src/math/Matrix.js"
import Seq from "src/base/Seq.js"

/**
 * Serializes supported values to/from json elements.
 */
export default class Serializer {
    /**
     * @param {*} value
     * @returns {*}
     */
    static toJson(value) {
        //noinspection JSUnusedLocalSymbols
        for (let [type, toJ, _] of BINDINGS) {
            //noinspection JSUnusedAssignment
            if (value instanceof type) {
                //noinspection JSUnusedAssignment
                return toJ(value);
            }
        }
        throw new Error(`Don't know how to convert ${describe(value)} to JSON.`);
    }

    /**
     * @param {*} expectedType
     * @param {*} json
     * @returns {*}
     */
    static fromJson(expectedType, json) {
        //noinspection JSUnusedLocalSymbols
        for (let [type, _, fromJ] of BINDINGS) {
            //noinspection JSUnusedAssignment
            if (type === expectedType) {
                //noinspection JSUnusedAssignment
                return fromJ(json);
            }
        }
        throw new Error(`Don't know how to deserialize JSON ${describe(value)} into an instance of ${expectedType}.`);
    }
}

/**
 * @param {!Complex} v
 * @returns {!object}
 */
let toJson_Complex = v => v.toString(Format.MINIFIED);

/**
 * @param {object} json
 * @returns {!Complex}
 * @throws {Error}
 */
let fromJson_Complex = json => {
    if (typeof json === "string") {
        return Complex.parse(json);
    }
    throw new Error("Not a packed complex string: " + json);
};

/**
 * @param {!Matrix} v
 * @returns {!object}
 */
let toJson_Matrix = v => v.toString(Format.MINIFIED);

/**
 * @param {object} json
 * @returns {!Matrix}
 * @throws {Error}
 */
let fromJson_Matrix = json => {
    if (typeof json !== "string") {
        throw new Error("Not a packed matrix string: " + json);
    }
    //noinspection JSCheckFunctionSignatures
    return Matrix.parse(json);
};

/**
 * @param {!Gate} gate
 * @returns {!object}
 */
let toJson_Gate = gate => {
    if (new Seq(Gates.KnownToSerializer).contains(gate)) {
        return gate.symbol;
    }

    if (gate.isTimeBased()) {
        throw new Error("Don't know how to serialize matrix functions.");
    }

    return {
        id: gate.symbol,
        matrix: toJson_Matrix(gate.matrixAt(0.25))
    };
};

/**
 * @param {!object} json
 * @returns {!Gate}
 * @throws {Error}
 */
let fromJson_Gate = json => {
    let symbol = typeof json === "string" ? json : json["id"];
    if (typeof symbol !== "string") {
        throw new Error(`Gate json should contain a string id. Json: ${describe(json)}`);
    }

    let matrixProp = json["matrix"];
    let matrix = matrixProp === undefined ? undefined : fromJson_Matrix(matrixProp);

    let match = new Seq(Gates.KnownToSerializer).
        filter(g => g.symbol === symbol).
        first(null);
    if (match !== null && (matrix === undefined || match.matrix.isEqualTo(matrix))) {
        return match;
    }

    if (symbol === Gates.Named.Silly.FUZZ_SYMBOL && matrix !== undefined) {
        let r = Gates.Named.Silly.FUZZ_MAKER();
        r.matrixOrFunc = matrix;
        return r;
    }

    return new Gate(symbol, matrix, symbol, "(A custom imported gate.)", "", GateFactory.DEFAULT_DRAWER);
};

/**
 * @param {!GateColumn} v
 * @returns {!object}
 */
let toJson_GateColumn = v => v.gates.map(e => e === null ? 1 : toJson_Gate(e));

/**
 * @param {object} json
 * @returns {!GateColumn}
 * @throws
 */
let fromJson_GateColumn = json => {
    if (!Array.isArray(json)) {
        throw new Error(`GateColumn json should be an array. Json: ${describe(json)}`);
    }
    return new GateColumn(json.map(e => e === 1 || e === null ? null : fromJson_Gate(e)));
};

/**
 * @param {!CircuitDefinition} v
 * @returns {!object}
 */
let toJson_CircuitDefinition = v => {
    return {
        wires: v.numWires,
        cols: v.columns.map(Serializer.toJson).map(c => new Seq(c).skipTailWhile(e => e === 1).toArray())
    };
};

/**
 * @param {object} json
 * @returns {!CircuitDefinition}
 * @throws
 */
let fromJson_CircuitDefinition = json => {
    let {wires: wires, cols: cols} = json;

    if (!Number.isInteger(wires) || wires < 0) {
        throw new Error(`CircuitDefinition json should contain a valid number of wires. Json: ${describe(json)}`);
    }
    if (wires > Config.MAX_WIRE_COUNT) {
        throw new Error(`Number of wires exceeds maximum. Json: ${describe(json)}, max: ${Config.MAX_WIRE_COUNT}`);
    }
    if (!Array.isArray(cols)) {
        throw new Error(`CircuitDefinition json should contain an array of cols. Json: ${describe(json)}`);
    }
    let gateCols = cols.map(e => Serializer.fromJson(GateColumn, e)).map(e => {
        if (e.gates.length < wires) {
            // Pad column up to circuit length.
            return new GateColumn(new Seq(e.gates).padded(wires, null).toArray());
        }
        if (e.gates.length > wires) {
            // Silently discard gates off the edge of the circuit.
            return new GateColumn(e.gates.slice(0, wires));
        }
        return e;
    });

    return new CircuitDefinition(wires, gateCols);
};

const BINDINGS = [
    [Complex, toJson_Complex, fromJson_Complex],
    [Gate, toJson_Gate, fromJson_Gate],
    [Matrix, toJson_Matrix, fromJson_Matrix],
    [GateColumn, toJson_GateColumn, fromJson_GateColumn],
    [CircuitDefinition, toJson_CircuitDefinition, fromJson_CircuitDefinition]
];