export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type IpcValue = string | number | boolean | null | undefined | ArrayBuffer | IpcValue[] | { [key: string]: IpcValue };

export type IpcRecord = { [key: string]: IpcValue };

export function isRecord(value: IpcValue): value is IpcRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof ArrayBuffer);
}

export function isFiniteNumber(value: IpcValue): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

export function stringOrNull(value: IpcValue, maxLength: number): string | null | undefined {
    if (value === null) return null;
    if (typeof value !== 'string' || value.length > maxLength) return undefined;
    return value;
}

export function hasOnlyKeys(record: IpcRecord, allowed: readonly string[]): boolean {
    return Object.keys(record).every(key => allowed.includes(key));
}
