import type { MpvStatus, OpenRequest, PlayerCommand } from '../shared/bridge';

export const PLAYER_NOT_BUILT = 'The Vora player is not part of this build yet. Videos play in the built-in player.';

export interface Player {
    status(): MpvStatus;
    open(request: OpenRequest): Promise<void>;
    command(command: PlayerCommand): void;
    close(): Promise<void>;
}

export class NoPlayer implements Player {
    status(): MpvStatus {
        return { available: false, version: null, reason: null };
    }

    open(): Promise<void> {
        return Promise.reject(new Error(PLAYER_NOT_BUILT));
    }

    command(): void { }

    close(): Promise<void> {
        return Promise.resolve();
    }
}
