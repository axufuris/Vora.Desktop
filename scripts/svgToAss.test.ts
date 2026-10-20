import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { arcToCubics, contoursOf, iconsLua, parsePath, svgToAss } from './svgToAss.ts';

const icons = join(process.cwd(), 'src', 'player', 'icons');

describe('reading SVG paths', () => {
    it('follows relative, horizontal and vertical moves and closes the shape', () => {
        const [contour] = parsePath('M6 4h4v16H6z');

        expect(contour.start).toEqual([6, 4]);
        expect(contour.segments.map(segment => segment.to)).toEqual([[10, 4], [10, 20], [6, 20], [6, 4]]);
        expect(contour.closed).toBe(true);
    });

    it('keeps drawing lines after a move, and starts a new shape after each m', () => {
        const contours = parsePath('M19 12H5M12 19l-7-7 7-7');

        expect(contours).toHaveLength(2);
        expect(contours[1].segments.map(segment => segment.to)).toEqual([[5, 12], [12, 5]]);
    });

    it('mirrors the last control point for a smooth curve', () => {
        const [contour] = parsePath('M0 0c1 1 2 1 3 0s2-1 3 0');
        const smooth = contour.segments[1];

        expect(smooth.kind === 'cubic' && smooth.c1).toEqual([4, -1]);
        expect(smooth.to).toEqual([6, 0]);
    });

    it('reads arc flags written without spaces', () => {
        const [contour] = parsePath('M15.54 8.46a5 5 0 010 7.07');

        expect(contour.segments.at(-1)?.to[0]).toBeCloseTo(15.54);
        expect(contour.segments.at(-1)?.to[1]).toBeCloseTo(15.53);
    });

    it('draws a half circle as two quarter curves that stay on the circle', () => {
        const segments = arcToCubics([10, 0], 10, 10, 0, false, true, [-10, 0]);

        expect(segments).toHaveLength(2);
        expect(segments[0].to[0]).toBeCloseTo(0);
        expect(segments[0].to[1]).toBeCloseTo(10);
    });

    it('reads polygons, lines and circles', () => {
        expect(contoursOf('<svg><polygon points="11 5 6 9 2 9" /></svg>')[0].closed).toBe(true);
        expect(contoursOf('<svg><line x1="23" y1="9" x2="17" y2="15" /></svg>')[0].segments).toHaveLength(1);
        expect(contoursOf('<svg><circle cx="12" cy="12" r="10" /></svg>')[0].segments).toHaveLength(4);
    });
});

describe('drawing icons in mpv', () => {
    it('fills a filled icon as it is', () => {
        expect(svgToAss('<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>'))
            .toEqual({ stroke: null, drawing: 'm 64 40 l 64 152 l 152 96 l 64 40' });
    });

    it('traces a stroked line there and back so its border is the stroke', () => {
        expect(svgToAss('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18" /></svg>'))
            .toEqual({ stroke: 2, drawing: 'm 144 48 l 48 144 l 144 48' });
    });

    it('keeps src/player/vora/icons.lua in step with the SVG files', () => {
        const svgs = readdirSync(icons).filter(name => name.endsWith('.svg')).sort()
            .map(name => ({ name: name.slice(0, -4), svg: readFileSync(join(icons, name), 'utf8') }));
        const committed = readFileSync(join(process.cwd(), 'src', 'player', 'vora', 'icons.lua'), 'utf8');

        expect(committed, 'Run npm run build-icons and commit the result').toBe(iconsLua(svgs));
    });
});
