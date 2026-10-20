import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const folder = join(process.cwd(), 'resources', 'icons');
const icons = readdirSync(folder, { recursive: true, encoding: 'utf8' }).filter(name => name.endsWith('.png'));

interface Chunk {
    type: string;
    data: Buffer;
}

function chunksOf(png: Buffer): Chunk[] {
    const chunks: Chunk[] = [];
    let at = 8;
    while (at + 8 <= png.length) {
        const length = png.readUInt32BE(at);
        chunks.push({ type: png.subarray(at + 4, at + 8).toString('latin1'), data: png.subarray(at + 8, at + 8 + length) });
        at += 12 + length;
    }
    return chunks;
}

describe('the app icons', () => {
    it('includes the prod and QA icons', () => {
        expect(icons.map(name => name.replaceAll('\\', '/')).sort()).toEqual(['qa/vora-512.png', 'vora-512.png']);
    });

    it.each(icons)('%s is a 512 px RGBA PNG', name => {
        const png = readFileSync(join(folder, name));

        expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
        expect(chunksOf(png)[0]?.type).toBe('IHDR');
        expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20), depth: png[24], colour: png[25] })
            .toEqual({ width: 512, height: 512, depth: 8, colour: 6 });
    });

    it.each(icons)('%s has no zero resolution, which Windows refuses in an exe icon', name => {
        const resolutions = chunksOf(readFileSync(join(folder, name)))
            .filter(chunk => chunk.type === 'pHYs')
            .flatMap(chunk => [chunk.data.readUInt32BE(0), chunk.data.readUInt32BE(4)]);

        expect(resolutions).not.toContain(0);
    });
});
