import CircuitDefinition from "src/circuit/CircuitDefinition.js"
import CircuitStats from "src/circuit/CircuitStats.js"
import Config from "src/Config.js"
import DetailedError from "src/base/DetailedError.js"
import equate from "src/base/Equate.js"
import GateColumn from "src/circuit/GateColumn.js"
import GateDrawParams from "src/ui/GateDrawParams.js"
import GatePainting from "src/ui/GatePainting.js"
import Gates from "src/ui/Gates.js"
import MathPainter from "src/ui/MathPainter.js"
import Point from "src/math/Point.js"
import Matrix from "src/math/Matrix.js"
import Rect from "src/math/Rect.js"
import {seq, Seq} from "src/base/Seq.js"
import Util from "src/base/Util.js"

/** @type {!number} */
let CIRCUIT_OP_HORIZONTAL_SPACING = 10;
/** @type {!number} */
let CIRCUIT_OP_LEFT_SPACING = 35;
/** @type {!number} */
let CIRCUIT_OP_RIGHT_SPACING = 5;

class DisplayedCircuit {
    /**
     *
     * @param {!number} top
     * @param {!CircuitDefinition} circuitDefinition
     * @param {undefined|!int} compressedColumnIndex
     * @param {undefined|!{col: !int, row: !int, resizeStyle: !boolean}} highlightedSlot
     */
    constructor(top, circuitDefinition, compressedColumnIndex=undefined, highlightedSlot=undefined) {
        if (!Number.isFinite(top)) {
            throw new DetailedError("Bad top", {top, circuitDefinition});
        }
        if (!(circuitDefinition instanceof CircuitDefinition)) {
            throw new DetailedError("Bad circuitDefinition", {top, circuitDefinition});
        }
        /**
         * @type {!number}
         */
        this.top = top;
        /**
         * @type {!CircuitDefinition}
         */
        this.circuitDefinition = circuitDefinition;
        /**
         * @type {undefined|!int}
         * @private
         */
        this._compressedColumnIndex = compressedColumnIndex;
        /**
         * @type {undefined|!{col: !int, row: !int, resizeStyle: !boolean}}
         * @private
         */
        this._highlightedSlot = highlightedSlot;
    }

    /**
     * @param {!int} wireCount
     * @returns {!number}
     */
    static desiredHeight(wireCount) {
        return Math.max(Config.MIN_WIRE_COUNT, wireCount) * Config.WIRE_SPACING + 100;
    }

    /**
     * @returns {!number}
     */
    desiredWidth() {
        let r = this.opRect(
            this.circuitDefinition.columns.length + // Operations.
            1 + // Spacer.
            2 + // Wire chance and bloch sphere displays.
            1 // Density matrix displays.
        );
        return r.x + this.height() + 5; // Superposition display.
    }

    /**
     * @param {!int} wireIndex
     * @returns {!Rect}
     */
    wireRect(wireIndex) {
        if (wireIndex < 0) {
            throw new DetailedError("Bad wireIndex", {wireIndex});
        }
        return new Rect(0, this.top + Config.WIRE_SPACING * wireIndex, Infinity, Config.WIRE_SPACING);
    }

    /**
     * @param {!number} y
     * @returns {!int}
     */
    wireIndexAt(y) {
        return Math.floor((y - this.top) / Config.WIRE_SPACING);
    }

    //noinspection JSMethodCanBeStatic
    /**
     * @param {!number} x
     * @returns {!number} The continuous column-space coordinate corresponding to the given display-space coordinate.
     * @private
     */
    toColumnSpaceCoordinate(x) {
        let spacing = (CIRCUIT_OP_HORIZONTAL_SPACING + Config.GATE_RADIUS * 2);
        let left = CIRCUIT_OP_LEFT_SPACING - CIRCUIT_OP_HORIZONTAL_SPACING / 2;
        return (x - left) / spacing - 0.5;
    }

    /**
     * @param {!number} y
     * @returns {undefined|!int}
     */
    indexOfDisplayedRowAt(y) {
        let i = Math.floor((y - this.top) / Config.WIRE_SPACING);
        if (i < 0 || i >= this.circuitDefinition.numWires) {
            return undefined;
        }
        return i;
    }

    /**
     * @param {!number} x
     * @returns {undefined|!int}
     */
    indexOfDisplayedColumnAt(x) {
        let col = this.toColumnSpaceCoordinate(x);
        let i;
        if (this._compressedColumnIndex === undefined || col < this._compressedColumnIndex - 0.75) {
            i = Math.round(col);
        } else if (col < this._compressedColumnIndex - 0.25) {
            i = this._compressedColumnIndex;
        } else {
            i = Math.round(col) - 1;
        }

        if (i < 0 || i >= this.circuitDefinition.columns.length) {
            return undefined;
        }

        return i;
    }

    /**
     * @param {!Point} p
     * @returns {undefined|!number}
     */
    findOpHalfColumnAt(p) {
        if (p.x < 0 || p.y < top || p.y > top + this.height()) {
            return undefined;
        }

        return Math.max(-0.5, Math.round(this.toColumnSpaceCoordinate(p.x) * 2) / 2);
    }

    /**
     * @param {!Hand} hand
     * @returns {?{ col : !number, row : !number, isInsert : !boolean }}
     */
    findModificationIndex(hand) {
        if (hand.pos === undefined || hand.heldGate === undefined) {
            return undefined;
        }
        let pos = hand.pos.minus(hand.holdOffset).plus(new Point(Config.GATE_RADIUS, Config.GATE_RADIUS));
        let halfColIndex = this.findOpHalfColumnAt(pos);
        let row = this.indexOfDisplayedRowAt(pos.y);
        if (halfColIndex === undefined || row === undefined) {
            return undefined;
        }
        let col = Math.ceil(halfColIndex);
        let isInsert = Math.abs(halfColIndex % 1) === 0.5;
        if (col >= this.circuitDefinition.columns.length) {
            return {col: col, row: row, isInsert: isInsert};
        }

        if (!isInsert) {
            let mustInsert = this.circuitDefinition.isSlotRectCoveredByGateInSameColumn(
                col, row, hand.heldGate.height);
            if (mustInsert) {
                let isAfter = hand.pos.x > this.opRect(col).center().x;
                isInsert = true;
                if (isAfter) {
                    col += 1;
                }
            }
        }

        return {col: col, row: row, isInsert: isInsert};
    }

    /**
     * @param {!int} operationIndex
     * @returns {Rect!}
     */
    opRect(operationIndex) {
        let opWidth = Config.GATE_RADIUS * 2;
        let opSeparation = opWidth + CIRCUIT_OP_HORIZONTAL_SPACING;
        let tweak = 0;
        if (this._compressedColumnIndex !== undefined && operationIndex === this._compressedColumnIndex) {
            tweak = opSeparation / 2;
        }
        if (this._compressedColumnIndex !== undefined && operationIndex > this._compressedColumnIndex) {
            tweak = opSeparation;
        }

        let dx = opSeparation * operationIndex - tweak + CIRCUIT_OP_LEFT_SPACING;
        return new Rect(dx, this.top, opWidth, this.height());
    }

    height() {
        return DisplayedCircuit.desiredHeight(this.circuitDefinition.numWires);
    }

    /**
     * @param {!int} wireIndex
     * @param {!int} operationIndex
     * @param {!int=} width
     * @param {!int=} height
     */
    gateRect(wireIndex, operationIndex, width=1, height=1) {
        let op = this.opRect(operationIndex);
        let wire = this.wireRect(wireIndex);
        let r = new Rect(
            op.center().x - Config.GATE_RADIUS,
            wire.center().y - Config.GATE_RADIUS,
            2*Config.GATE_RADIUS + (width-1)*Config.WIRE_SPACING,
            2*Config.GATE_RADIUS + (height-1)*Config.WIRE_SPACING);

        return new Rect(Math.round(r.x - 0.5) + 0.5, Math.round(r.y - 0.5) + 0.5, Math.round(r.w), Math.round(r.h));
    }

    /**
     * @returns {!DisplayedCircuit}
     */
    afterTidyingUp() {
        return this.withCircuit(this.circuitDefinition.
            withUncoveredColumnsRemoved().
            withHeightOverlapsFixed().
            withWidthOverlapsFixed().
            withUncoveredColumnsRemoved().
            withTrailingSpacersIncluded());
    }

    /**
     * @param {!DisplayedCircuit|*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        if (this === other) {
            return true;
        }
        return other instanceof DisplayedCircuit &&
            this.top === other.top &&
            this.circuitDefinition.isEqualTo(other.circuitDefinition) &&
            this._compressedColumnIndex === other._compressedColumnIndex &&
            equate(this._highlightedSlot, other._highlightedSlot);
    }

    /**
     * @param {!Painter} painter
     * @param {!Hand} hand
     * @param {!CircuitStats} stats
     * @param {!boolean} shift
     */
    paint(painter, hand, stats, shift) {
        painter.fillRect(
            new Rect(0, this.top, this.height(), painter.canvas.clientWidth,
            Config.BACKGROUND_COLOR_CIRCUIT));

        this._drawWires(painter);

        for (let col = 0; col < this.circuitDefinition.columns.length; col++) {
            this._drawColumn(painter, this.circuitDefinition.columns[col], col, hand, stats, shift);
        }

        this._drawOutputDisplays(painter, stats, hand);
    }

    /**
     * @param {!Painter} painter
     * @private
     */
    _drawWires(painter) {
        // Initial value labels
        for (let row = 0; row < this.circuitDefinition.numWires; row++) {
            let wireRect = this.wireRect(row);
            let y = wireRect.center().y;
            painter.print('|0⟩', 20, y, 'right', 'middle', 'black', '14px Helvetica', 20, Config.WIRE_SPACING);
        }

        // Wires (doubled-up for measured sections).
        painter.trace(trace => {
            for (let row = 0; row < this.circuitDefinition.numWires; row++) {
                let wireRect = this.wireRect(row);
                let y = Math.round(wireRect.center().y - 0.5) + 0.5;
                let lastX = 25;
                //noinspection ForLoopThatDoesntUseLoopVariableJS
                for (let col = 0; lastX < painter.canvas.width; col++) {
                    let x = this.opRect(col).center().x;
                    if (this.circuitDefinition.locIsMeasured(new Point(col, row))) {
                        // Measured wire.
                        trace.line(lastX, y-1, x, y-1);
                        trace.line(lastX, y+1, x, y+1);
                    } else {
                        // Unmeasured wire.
                        trace.line(lastX, y, x, y);
                    }
                    lastX = x;
                }
            }
        }).thenStroke('black');
    }

    /**
     * @param {!int} col
     * @param {!int} row
     * @param {!Array.<!Point>} focusPosPts
     * @returns {!{isHighlighted: !boolean, isResizeShowing: !boolean, isResizeHighlighted: !boolean}}
     * @private
     */
    _highlightStatusAt(col, row, focusPosPts) {
        if (this._highlightedSlot !== undefined) {
            if (this._highlightedSlot.col === col && this._highlightedSlot.row === row) {
                return {
                    isResizeShowing: true,
                    isResizeHighlighted: this._highlightedSlot.resizeStyle,
                    isHighlighted: !this._highlightedSlot.resizeStyle
                };
            }
        }

        let gate = this.circuitDefinition.gateInSlot(col, row);
        if (gate === undefined || this._highlightedSlot !== undefined) {
            return {
                isResizeShowing: false,
                isResizeHighlighted: false,
                isHighlighted: false
            };
        }

        let gateRect = this.gateRect(row, col, gate.width, gate.height);
        let resizeTabRect = GatePainting.rectForResizeTab(gateRect);

        let isOverGate = pos => {
            let overGate = this.findGateOverlappingPos(pos);
            return overGate !== undefined && overGate.col === col && overGate.row === row;
        };
        let isNotCoveredAt = pos => {
            let g = this.findGateOverlappingPos(pos);
            return g === undefined || (g.col === col && g.row === row);
        };
        let isOverGateResizeTab = pos => isNotCoveredAt(pos) && resizeTabRect.containsPoint(pos);

        let isResizeHighlighted = gate.canChangeInSize() && seq(focusPosPts).any(isOverGateResizeTab);
        let isHighlighted = !isResizeHighlighted && seq(focusPosPts).any(isOverGate);
        let isResizeShowing = gate.canChangeInSize() && (isResizeHighlighted || isHighlighted);

        return {isHighlighted, isResizeShowing, isResizeHighlighted};
    }

    /**
     * @param {!Painter} painter
     * @param {!GateColumn} gateColumn
     * @param {!int} col
     * @param {!Hand} hand
     * @param {!CircuitStats} stats
     * @param {!boolean} shift
     * @private
     */
    _drawColumn(painter, gateColumn, col, hand, stats, shift) {
        this.drawColumnControlWires(painter, gateColumn, col, stats);

        let focusSlot = this._highlightedSlot;
        for (let row = 0; row < this.circuitDefinition.numWires; row++) {
            if (gateColumn.gates[row] === null) {
                continue;
            }
            let gate = gateColumn.gates[row];
            let gateRect = this.gateRect(row, col, gate.width, gate.height);

            let {isHighlighted, isResizeShowing, isResizeHighlighted} =
                this._highlightStatusAt(col, row, hand.hoverPoints());
            if (isResizeHighlighted) {
                painter.setDesiredCursor('ns-resize');
            } else if (isHighlighted) {
                if (shift) {
                    painter.setDesiredCursor('pointer');
                } else {
                    painter.setDesiredCursor('move');
                }
            }

            let drawer = gate.customDrawer || GatePainting.DEFAULT_DRAWER;
            drawer(new GateDrawParams(
                painter,
                false,
                isHighlighted && !isResizeHighlighted,
                isResizeShowing,
                isResizeHighlighted,
                gateRect,
                gate,
                stats,
                {row, col},
                focusSlot === undefined ? hand.hoverPoints() : []));
            let isDisabledReason = this.circuitDefinition.gateAtLocIsDisabledReason(new Point(col, row));
            if (isDisabledReason !== undefined) {
                if (isHighlighted) {
                    painter.ctx.globalAlpha /= 2;
                }
                painter.strokeLine(gateRect.topLeft(), gateRect.bottomRight(), 'orange', 3);
                painter.ctx.globalAlpha /= 2;
                painter.fillRect(gateRect.paddedBy(5), 'yellow');
                painter.ctx.globalAlpha *= 2;
                painter.printParagraph(isDisabledReason, gateRect.paddedBy(5), new Point(0.5, 0.5), 'red');
                if (isHighlighted) {
                    painter.ctx.globalAlpha *= 2;
                }
            }
        }
    }

    /**
     * @param {!Painter} painter
     * @param {!GateColumn} gateColumn
     * @param {!int} columnIndex
     * @param {!CircuitStats} stats
     */
    drawColumnControlWires(painter, gateColumn, columnIndex, stats) {
        let n = gateColumn.gates.length;
        let gs = gateColumn.gates;

        let hasTwoSwaps = stats.circuitDefinition.colHasEnabledSwapGate(columnIndex);

        let canBeControlled =
            i => stats.circuitDefinition.locHasControllableGate(new Point(columnIndex, i));

        let causesSingleWire =
            i => this.circuitDefinition.locStartsSingleControlWire(new Point(columnIndex, i));

        let causesDoubleWire =
            i => this.circuitDefinition.locStartsDoubleControlWire(new Point(columnIndex, i));

        let isMatchedSwap = i =>
            hasTwoSwaps && gs[i] === Gates.Special.SwapHalf;

        let t1 = Seq.range(n).filter(canBeControlled).first(null);
        let t2 = Seq.range(n).filter(canBeControlled).last(null);
        let c1 = Seq.range(n).filter(causesSingleWire).first(null);
        let c2 = Seq.range(n).filter(causesSingleWire).last(null);
        let cc1 = Seq.range(n).filter(causesDoubleWire).first(null);
        let cc2 = Seq.range(n).filter(causesDoubleWire).last(null);
        let s1 = Seq.range(n).filter(isMatchedSwap).first(null);
        let s2 = Seq.range(n).filter(isMatchedSwap).last(null);

        let x = Math.round(this.opRect(columnIndex).center().x - 0.5) + 0.5;
        if (c1 !== null && t1 !== null) {
            let y1 =  this.wireRect(Math.min(t1, c1)).center().y;
            let y2 = this.wireRect(Math.max(t2, c2)).center().y;
            painter.strokeLine(new Point(x,y1), new Point(x, y2));
        }
        if (s1 !== null) {
            let y1 =  this.wireRect(s1).center().y;
            let y2 = this.wireRect(s2).center().y;
            painter.strokeLine(new Point(x,y1), new Point(x, y2));
        }
        if (cc1 !== null && t1 !== null) {
            let y1 =  this.wireRect(Math.min(t1, cc1)).center().y;
            let y2 = this.wireRect(Math.max(t2, cc2)).center().y;
            painter.strokeLine(new Point(x+1, y1), new Point(x+1, y2));
            painter.strokeLine(new Point(x-1, y1), new Point(x-1, y2));
        }
    }

    /**
     * @param {!Hand} hand
     * @returns {!DisplayedCircuit}
     */
    previewDrop(hand) {
        return hand.heldGate !== undefined ? this._previewDropMovedGate(hand) : this._previewResizedGate(hand);
    }

    /**
     * @param {!Hand} hand
     * @returns {!DisplayedCircuit}
     * @private
     */
    _previewDropMovedGate(hand) {
        let modificationPoint = this.findModificationIndex(hand);
        if (modificationPoint === undefined
                || modificationPoint.row + hand.heldGate.height > this.circuitDefinition.numWires) {
            return this;
        }
        let addedGate = hand.heldGate;

        let emptyCol = GateColumn.empty(this.circuitDefinition.numWires);
        let i = modificationPoint.col;
        let isInserting = modificationPoint.isInsert;
        let row = modificationPoint.row;
        let newCols = seq(this.circuitDefinition.columns).
            padded(i, emptyCol).
            ifThen(isInserting, s => s.withInsertedItem(i, emptyCol)).
            padded(i + addedGate.width, emptyCol).
            withTransformedItem(i, c => c.withGatesAdded(row, new GateColumn([addedGate]))).
            toArray();

        return this.withCircuit(this.circuitDefinition.withColumns(newCols)).
            _withHighlightedSlot({row: modificationPoint.row, col: modificationPoint.col, resizeStyle: false}).
            _withCompressedColumnIndex(isInserting ? i : undefined);
    }

    /**
     * @param {!Hand} hand
     * @returns {!DisplayedCircuit}
     * @private
     */
    _previewResizedGate(hand) {
        if (hand.resizingGateSlot === undefined || hand.pos === undefined) {
            return this;
        }
        let gate = this.circuitDefinition.gateInSlot(hand.resizingGateSlot.x, hand.resizingGateSlot.y);
        if (gate === undefined) {
            return this;
        }
        let row = Math.min(
            this.wireIndexAt(hand.pos.y - hand.holdOffset.y),
            Config.MAX_WIRE_COUNT - 1);
        let newGate = seq(gate.gateFamily).minBy(g => Math.abs(g.height - (row - hand.resizingGateSlot.y + 1)));
        let newWireCount = Math.min(Config.MAX_WIRE_COUNT,
            Math.max(this.circuitDefinition.numWires, newGate.height + hand.resizingGateSlot.y + 1));
        let newCols = seq(this.circuitDefinition.columns).
            withTransformedItem(hand.resizingGateSlot.x,
                colObj => new GateColumn(seq(colObj.gates).
                    withOverlayedItem(hand.resizingGateSlot.y, newGate).
                    toArray())).
            toArray();

        let newCircuitWithoutHeightFix = this.circuitDefinition.withColumns(newCols).
            withWireCount(newWireCount);
        let newCircuit = newCircuitWithoutHeightFix.withHeightOverlapsFixed();
        return this.withCircuit(newCircuit).
            _withHighlightedSlot(this._highlightedSlot).
            _withCompressedColumnIndex(newCircuitWithoutHeightFix.isEqualTo(newCircuit) ?
                undefined :
                hand.resizingGateSlot.x + 1);
    }

    /**
     * @param {!Hand} hand
     * @returns {!DisplayedCircuit}
     */
    afterDropping(hand) {
        return this.previewDrop(hand)._withCompressedColumnIndex(undefined);
    }

    /**
     * @param {!CircuitDefinition} circuitDefinition
     * @returns {!DisplayedCircuit}
     */
    withCircuit(circuitDefinition) {
        return new DisplayedCircuit(
            this.top,
            circuitDefinition,
            this._compressedColumnIndex);
    }

    /**
     * @param {!Hand} hand
     * @param {!int} extraWireCount
     * @returns {!DisplayedCircuit}
     */
    withJustEnoughWires(hand, extraWireCount) {
        let neededWireCountForPlacement = hand.heldGate !== undefined ? hand.heldGate.height : 0;
        let desiredWireCount = this.circuitDefinition.minimumRequiredWireCount();
        let clampedWireCount = Math.min(
            Config.MAX_WIRE_COUNT,
            Math.max(
                neededWireCountForPlacement,
                Math.max(Config.MIN_WIRE_COUNT, desiredWireCount) + extraWireCount));
        return this.withCircuit(this.circuitDefinition.withWireCount(clampedWireCount));
    }

    /**
     * @param {!Point} pos
     * @returns {undefined|!{col: !int, row: !int, offset: !Point}}
     */
    findGateOverlappingPos(pos) {
        let col = this.indexOfDisplayedColumnAt(pos.x);
        let row = this.indexOfDisplayedRowAt(pos.y);
        if (col === undefined || row === undefined) {
            return undefined;
        }

        let target = this.circuitDefinition.findGateCoveringSlot(col, row);
        if (target === undefined) {
            return undefined;
        }

        let gateRect = this.gateRect(target.row, target.col, target.gate.width, target.gate.height);
        if (!gateRect.containsPoint(pos)) {
            return undefined;
        }

        return {col: target.col, row: target.row, offset: pos.minus(gateRect.topLeft())};
    }

    /**
     * @param {!Hand} hand
     * @param {!boolean=} duplicate
     * @returns {!{newCircuit: !DisplayedCircuit, newHand: !Hand}}
     */
    tryGrab(hand, duplicate=false) {
        let {newCircuit, newHand} = this._tryGrabResizeTab(hand) || {newCircuit: this, newHand: hand};
        return newCircuit._tryGrabGate(newHand, duplicate) || {newCircuit, newHand};
    }

    /**
     * @param {!Hand} hand
     * @param {!boolean=} duplicate
     * @returns {undefined|!{newCircuit: !DisplayedCircuit, newHand: !Hand}}
     */
    _tryGrabGate(hand, duplicate=false) {
        if (hand.isBusy() || hand.pos === undefined) {
            return undefined;
        }

        let foundPt = this.findGateOverlappingPos(hand.pos);
        if (foundPt === undefined) {
            return undefined;
        }

        let {col, row, offset} = foundPt;
        let gate = this.circuitDefinition.columns[col].gates[row];

        let remainingGates = seq(this.circuitDefinition.columns[col].gates).toArray();
        if (!duplicate) {
            remainingGates[row] = null;
        }

        let newCols = seq(this.circuitDefinition.columns).
            withOverlayedItem(col, new GateColumn(remainingGates)).
            toArray();
        return {
            newCircuit: new DisplayedCircuit(
                this.top,
                this.circuitDefinition.withColumns(newCols)),
            newHand: hand.withHeldGate(gate, offset)
        };
    }

    /**
     * @param {undefined|!{col: !int, row: !int, resizeStyle: !boolean}} slot
     * @returns {!DisplayedCircuit}
     */
    _withHighlightedSlot(slot) {
        return new DisplayedCircuit(
            this.top,
            this.circuitDefinition,
            this._compressedColumnIndex,
            slot);
    }

    /**
     * @param {undefined|!int} compressedColumnIndex
     * @returns {!DisplayedCircuit}
     */
    _withCompressedColumnIndex(compressedColumnIndex) {
        return new DisplayedCircuit(
            this.top,
            this.circuitDefinition,
            compressedColumnIndex,
            this._highlightedSlot);
    }

    /**
     * @param {!Hand} hand
     * @returns {!{newCircuit: !DisplayedCircuit, newHand: !Hand}}
     */
    _tryGrabResizeTab(hand) {
        if (hand.isBusy() || hand.pos === undefined) {
            return undefined;
        }

        for (let col = 0; col < this.circuitDefinition.columns.length; col++) {
            for (let row = 0; row < this.circuitDefinition.numWires; row++) {
                let gate = this.circuitDefinition.columns[col].gates[row];
                if (gate === null) {
                    continue;
                }
                let {isResizeHighlighted} =
                    this._highlightStatusAt(col, row, hand.hoverPoints());
                if (isResizeHighlighted) {
                    let offset = hand.pos.minus(this.gateRect(row + gate.height - 1, col, 1, 1).center());
                    return {
                        newCircuit: this._withHighlightedSlot({col, row, resizeStyle: true}),
                        newHand: hand.withResizeSlot(new Point(col, row), offset)
                    };
                }
            }
        }
        return undefined;
    }

    /**
     * @returns {!boolean}
     */
    needsContinuousRedraw() {
        return this.circuitDefinition.isTimeDependent();
    }

    /**
     * @returns {!int}
     */
    importantWireCount() {
        return seq([
            this.circuitDefinition.numWires - 1,
            Config.MIN_WIRE_COUNT,
            this.circuitDefinition.minimumRequiredWireCount()
        ]).max();
    }

    /**
     * Draws a peek gate on each wire at the right-hand side of the circuit.
     *
     * @param {!Painter} painter
     * @param {!CircuitStats} stats
     * @param {!Hand} hand
     * @private
     */
    _drawOutputDisplays(painter, stats, hand) {
        let colCount = Math.max(
                Config.MIN_COL_COUNT + (this._compressedColumnIndex !== undefined ? 1 : 0),
                this.circuitDefinition.columns.length) + 1;
        let numWire = this.importantWireCount();

        for (let i = 0; i < numWire; i++) {
            let p = stats.controlledWireProbabilityJustAfter(i, Infinity);
            MathPainter.paintProbabilityBox(painter, p, this.gateRect(i, colCount), hand.hoverPoints());
            let m = stats.qubitDensityMatrix(i, Infinity);
            if (m !== undefined) {
                MathPainter.paintBlochSphere(painter, m, this.gateRect(i, colCount+1), hand.hoverPoints());
            }
        }

        let offset = colCount+2;
        for (let i = 0; i + 1 <= numWire; i++) {
            let m = stats.qubitDensityMatrix(i, Infinity);
            let topLeft = this.gateRect(i, offset).topLeft();
            let wh = this.gateRect(i, offset).bottom() - topLeft.y;
            let r = new Rect(topLeft.x, topLeft.y, wh, wh);
            MathPainter.paintDensityMatrix(painter, m, r, hand.hoverPoints());
        }
        offset += 1;

        let bottom = this.wireRect(numWire-1).bottom();
        let right = this.opRect(colCount - 1).x;
        painter.printParagraph(
            "Local wire states\n(Chance/Bloch/Density)",
            new Rect(right+25, bottom+4, 190, 40),
            new Point(0.5, 0),
            'gray');

        this._drawOutputSuperpositionDisplay(painter, stats, offset, hand);
    }

    /**
     * Draws a peek gate on each wire at the right-hand side of the circuit.
     *
     * @param {!Painter} painter
     * @param {!CircuitStats} stats
     * @param {!int} col
     * @param {!Hand} hand
     * @private
     */
    _drawOutputSuperpositionDisplay(painter, stats, col, hand) {
        let numWire = this.importantWireCount();
        if (numWire >= Config.NO_SUPERPOSITION_DRAWING_WIRE_THRESHOLD) {
            return;
        }

        let [colWires, rowWires] = [Math.floor(numWire/2), Math.ceil(numWire/2)];
        let [colCount, rowCount] = [1 << colWires, 1 << rowWires];
        let outputStateBuffer = stats.finalState.rawBuffer();
        if (stats.circuitDefinition.numWires !== this.importantWireCount()) {
            outputStateBuffer = outputStateBuffer.slice(0, outputStateBuffer.length/2);
        }
        let amplitudeGrid = new Matrix(colCount, rowCount, outputStateBuffer);

        let topRect = this.gateRect(0, col);
        let bottomRect = this.gateRect(numWire-1, col);
        let gridRect = new Rect(topRect.x, topRect.y, 0, bottomRect.bottom() - topRect.y);
        gridRect = gridRect.withW(gridRect.h * (colCount/rowCount));
        MathPainter.paintMatrix(
            painter,
            amplitudeGrid,
            gridRect,
            numWire < Config.SIMPLE_SUPERPOSITION_DRAWING_WIRE_THRESHOLD ? Config.SUPERPOSITION_MID_COLOR : undefined,
            'black',
            numWire < Config.SIMPLE_SUPERPOSITION_DRAWING_WIRE_THRESHOLD ? Config.SUPERPOSITION_FORE_COLOR : undefined,
            Config.SUPERPOSITION_BACK_COLOR,
            hand.hoverPoints());

        let expandedRect = gridRect.withW(gridRect.w + 50).withH(gridRect.h + 50);
        let [dw, dh] = [gridRect.w / colCount, gridRect.h / rowCount];

        // Row labels.
        for (let i = 0; i < rowCount; i++) {
            let label = "_".repeat(colWires) + Util.bin(i, rowWires);
            let x = gridRect.right();
            let y = expandedRect.y + dh*(i+0.5);
            painter.print(label, x + 2, y, 'left', 'middle', 'black', '12px monospace', 50, dh, (w, h) => {
                painter.fillRect(new Rect(x, y-h/2, w + 4, h), 'lightgray');
            });
        }

        // Column labels.
        painter.ctx.save();
        painter.ctx.rotate(Math.PI/2);
        let maxY = 0;
        for (let i = 0; i < colCount; i++) {
            let labelRect = expandedRect.skipTop(gridRect.h + 2).skipLeft(dw*i).skipBottom(2).withW(dw);
            labelRect = new Rect(labelRect.y, -labelRect.x-labelRect.w, labelRect.h, labelRect.w);

            let label = Util.bin(i, colWires) + "_".repeat(rowWires);
            let x = expandedRect.x + dw*(i+0.5);
            let y = gridRect.bottom();
            painter.print(label, y + 2, -x, 'left', 'middle', 'black', '12px monospace', 50, dw, (w, h) => {
                painter.fillRect(new Rect(y, -x-h/2, w + 4, h), 'lightgray');
                maxY = Math.max(maxY, w + 8);
            });
        }
        painter.ctx.restore();

        // Hint text.
        painter.printParagraph(
            "Final amplitudes\n(deferring measurement)",
            expandedRect.withY(gridRect.bottom() + maxY).withH(40).withW(200),
            new Point(0, 0),
            'gray');
    }
}

export default DisplayedCircuit;
