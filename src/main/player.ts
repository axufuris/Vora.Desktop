import type { MpvStatus, OpenRequest, PlayerCommand } from '../shared/bridge';

export interface Player {
    status(): MpvStatus;
    open(request: OpenRequest): Promise<void>;
    command(command: PlayerCommand): void;
    close(): Promise<void>;
}
