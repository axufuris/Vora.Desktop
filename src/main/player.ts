import type { MpvStatus, OpenRequest, PlayerChromeState, PlayerCommand, ScrubSpriteSpec } from '../shared/bridge';

export interface Player {
    status(): MpvStatus;
    open(request: OpenRequest): Promise<void>;
    command(command: PlayerCommand): void;
    close(): Promise<void>;
    setChromeState(state: PlayerChromeState): void;
    setScrubSprite(spec: ScrubSpriteSpec | null): void;
}
