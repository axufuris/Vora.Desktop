export type Point = readonly [number, number];

export type Segment =
    | { kind: 'line'; to: Point }
    | { kind: 'cubic'; c1: Point; c2: Point; to: Point };

export interface Contour {
    start: Point;
    segments: Segment[];
    closed: boolean;
}

export interface AssIcon {
    stroke: number | null;
    drawing: string;
}

export const ICON_UNITS = 8;

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;

class PathReader {
    private readonly text: string;
    private index = 0;

    constructor(text: string) {
        this.text = text;
    }

    private skip(): void {
        while (this.index < this.text.length && /[\s,]/.test(this.text[this.index])) this.index++;
    }

    atEnd(): boolean {
        this.skip();
        return this.index >= this.text.length;
    }

    command(): string | null {
        this.skip();
        const letter = this.text[this.index];
        if (letter && /[MmLlHhVvCcSsQqTtAaZz]/.test(letter)) {
            this.index++;
            return letter;
        }
        return null;
    }

    number(): number {
        this.skip();
        const match = NUMBER.exec(this.text.slice(this.index));
        if (!match) throw new Error(`Expected a number at ${this.index} in "${this.text}"`);
        this.index += match[0].length;
        return Number(match[0]);
    }

    flag(): boolean {
        this.skip();
        const letter = this.text[this.index];
        if (letter !== '0' && letter !== '1') throw new Error(`Expected an arc flag at ${this.index} in "${this.text}"`);
        this.index++;
        return letter === '1';
    }
}

const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]];
const scale = (a: Point, k: number): Point => [a[0] * k, a[1] * k];
const reflect = (point: Point, around: Point): Point => [2 * around[0] - point[0], 2 * around[1] - point[1]];
const same = (a: Point, b: Point) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

export function arcToCubics(from: Point, rxIn: number, ryIn: number, rotation: number, large: boolean, sweep: boolean, to: Point): Segment[] {
    if (same(from, to)) return [];
    let rx = Math.abs(rxIn);
    let ry = Math.abs(ryIn);
    if (rx === 0 || ry === 0) return [{ kind: 'line', to }];

    const phi = (rotation * Math.PI) / 180;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    const dx = (from[0] - to[0]) / 2;
    const dy = (from[1] - to[1]) / 2;
    const x1 = cos * dx + sin * dy;
    const y1 = -sin * dx + cos * dy;
    const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lambda > 1) {
        rx *= Math.sqrt(lambda);
        ry *= Math.sqrt(lambda);
    }
    const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
    const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    const coefficient = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
    const cxp = coefficient * ((rx * y1) / ry);
    const cyp = coefficient * (-(ry * x1) / rx);
    const cx = cos * cxp - sin * cyp + (from[0] + to[0]) / 2;
    const cy = sin * cxp + cos * cyp + (from[1] + to[1]) / 2;

    const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const start = angle(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
    let sweepAngle = angle((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
    if (!sweep && sweepAngle > 0) sweepAngle -= 2 * Math.PI;
    if (sweep && sweepAngle < 0) sweepAngle += 2 * Math.PI;

    const pieces = Math.max(1, Math.ceil(Math.abs(sweepAngle) / (Math.PI / 2) - 1e-9));
    const step = sweepAngle / pieces;
    const k = (4 / 3) * Math.tan(step / 4);
    const pointAt = (t: number): Point => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
    const slopeAt = (t: number): Point => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];

    const segments: Segment[] = [];
    for (let piece = 0; piece < pieces; piece++) {
        const t1 = start + piece * step;
        const t2 = t1 + step;
        const end = piece === pieces - 1 ? to : pointAt(t2);
        segments.push({ kind: 'cubic', c1: add(pointAt(t1), scale(slopeAt(t1), k)), c2: add(pointAt(t2), scale(slopeAt(t2), -k)), to: end });
    }
    return segments;
}

export function parsePath(d: string): Contour[] {
    const reader = new PathReader(d);
    const contours: Contour[] = [];
    const state: { contour: Contour | null; position: Point; start: Point } = { contour: null, position: [0, 0], start: [0, 0] };
    let lastCubic: Point | null = null;
    let lastQuadratic: Point | null = null;
    let command = '';

    const begin = (at: Point) => {
        const contour: Contour = { start: at, segments: [], closed: false };
        state.contour = contour;
        contours.push(contour);
        state.start = at;
    };
    const push = (segment: Segment) => {
        if (!state.contour || state.contour.closed) begin(state.position);
        state.contour?.segments.push(segment);
        state.position = segment.to;
    };

    while (!reader.atEnd()) {
        const next = reader.command();
        if (next) command = next;
        else if (!command) throw new Error(`The path "${d}" does not start with a command`);

        const relative = command === command.toLowerCase();
        const point = (): Point => {
            const x = reader.number();
            const y = reader.number();
            return relative ? [state.position[0] + x, state.position[1] + y] : [x, y];
        };
        const type = command.toUpperCase();
        const wasCubic: Point | null = lastCubic;
        const wasQuadratic: Point | null = lastQuadratic;
        lastCubic = null;
        lastQuadratic = null;

        switch (type) {
            case 'M':
                state.position = point();
                begin(state.position);
                command = relative ? 'l' : 'L';
                break;
            case 'L':
                push({ kind: 'line', to: point() });
                break;
            case 'H': {
                const x = reader.number();
                push({ kind: 'line', to: [relative ? state.position[0] + x : x, state.position[1]] });
                break;
            }
            case 'V': {
                const y = reader.number();
                push({ kind: 'line', to: [state.position[0], relative ? state.position[1] + y : y] });
                break;
            }
            case 'C': {
                const c1 = point();
                const c2 = point();
                const to = point();
                push({ kind: 'cubic', c1, c2, to });
                lastCubic = c2;
                break;
            }
            case 'S': {
                const c1 = wasCubic ? reflect(wasCubic, state.position) : state.position;
                const c2 = point();
                const to = point();
                push({ kind: 'cubic', c1, c2, to });
                lastCubic = c2;
                break;
            }
            case 'Q':
            case 'T': {
                const from = state.position;
                const control: Point = type === 'Q' ? point() : wasQuadratic ? reflect(wasQuadratic, state.position) : state.position;
                const to = point();
                push({ kind: 'cubic', c1: add(from, scale(add(control, scale(from, -1)), 2 / 3)), c2: add(to, scale(add(control, scale(to, -1)), 2 / 3)), to });
                lastQuadratic = control;
                break;
            }
            case 'A': {
                const rx = reader.number();
                const ry = reader.number();
                const rotation = reader.number();
                const large = reader.flag();
                const sweep = reader.flag();
                const from = state.position;
                const to = point();
                for (const segment of arcToCubics(from, rx, ry, rotation, large, sweep, to)) push(segment);
                state.position = to;
                break;
            }
            case 'Z': {
                const current = state.contour;
                if (current) {
                    if (!same(state.position, state.start)) current.segments.push({ kind: 'line', to: state.start });
                    current.closed = true;
                }
                state.position = state.start;
                command = '';
                break;
            }
        }
    }
    return contours;
}

function numbers(text: string): number[] {
    return (text.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? []).map(Number);
}

function polyline(points: number[], closed: boolean): Contour[] {
    if (points.length < 4) return [];
    const start: Point = [points[0], points[1]];
    const segments: Segment[] = [];
    for (let index = 2; index + 1 < points.length; index += 2) segments.push({ kind: 'line', to: [points[index], points[index + 1]] });
    const last = segments.at(-1)?.to;
    if (closed && last && !same(last, start)) segments.push({ kind: 'line', to: start });
    return [{ start, segments, closed }];
}

function circle(cx: number, cy: number, r: number): Contour[] {
    const start: Point = [cx + r, cy];
    const half: Point = [cx - r, cy];
    return [{ start, segments: [...arcToCubics(start, r, r, 0, false, true, half), ...arcToCubics(half, r, r, 0, false, true, start)], closed: true }];
}

function attributes(text: string): Record<string, string> {
    const found: Record<string, string> = {};
    for (const match of text.matchAll(/([\w-]+)="([^"]*)"/g)) found[match[1]] = match[2];
    return found;
}

export function contoursOf(svg: string): Contour[] {
    const contours: Contour[] = [];
    for (const match of svg.matchAll(/<(path|polygon|polyline|line|circle|rect)\b([^>]*?)\/?>/g)) {
        const element = match[1];
        const attrs = attributes(match[2]);
        const value = (name: string) => Number(attrs[name] ?? 0);
        if (element === 'path') contours.push(...parsePath(attrs.d ?? ''));
        else if (element === 'polygon' || element === 'polyline') contours.push(...polyline(numbers(attrs.points ?? ''), element === 'polygon'));
        else if (element === 'line') contours.push(...polyline([value('x1'), value('y1'), value('x2'), value('y2')], false));
        else if (element === 'circle') contours.push(...circle(value('cx'), value('cy'), value('r')));
        else {
            const [x, y, w, h] = [value('x'), value('y'), value('width'), value('height')];
            contours.push(...polyline([x, y, x + w, y, x + w, y + h, x, y + h], true));
        }
    }
    return contours;
}

const unit = (value: number) => String(Math.round(value * ICON_UNITS));
const at = (point: Point) => `${unit(point[0])} ${unit(point[1])}`;

function forward(segment: Segment): string {
    return segment.kind === 'line' ? `l ${at(segment.to)}` : `b ${at(segment.c1)} ${at(segment.c2)} ${at(segment.to)}`;
}

function backward(segment: Segment, previous: Point): string {
    return segment.kind === 'line' ? `l ${at(previous)}` : `b ${at(segment.c2)} ${at(segment.c1)} ${at(previous)}`;
}

function filled(contour: Contour): string {
    return [`m ${at(contour.start)}`, ...contour.segments.map(forward)].join(' ');
}

function traced(contour: Contour): string {
    const points = [contour.start, ...contour.segments.map(segment => segment.to)];
    const back = contour.segments.map((segment, index) => backward(segment, points[index])).reverse();
    return [`m ${at(contour.start)}`, ...contour.segments.map(forward), ...back].join(' ');
}

export function svgToAss(svg: string): AssIcon {
    const root = attributes(/<svg\b([^>]*)>/.exec(svg)?.[1] ?? '');
    const stroked = root.fill === 'none' && !!root.stroke && root.stroke !== 'none';
    const contours = contoursOf(svg);
    return {
        stroke: stroked ? Number(root['stroke-width'] ?? 1) : null,
        drawing: contours.map(stroked ? traced : filled).join(' '),
    };
}

export function iconsLua(icons: readonly { name: string; svg: string }[]): string {
    const entries = icons.map(({ name, svg }) => {
        const icon = svgToAss(svg);
        return `    ["${name}"] = { stroke = ${icon.stroke === null ? 'nil' : String(icon.stroke)}, drawing = "${icon.drawing}" },`;
    });
    return `return {\n    size = ${24 * ICON_UNITS},\n${entries.join('\n')}\n}\n`;
}
