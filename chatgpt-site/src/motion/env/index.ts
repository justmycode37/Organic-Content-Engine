import type { Ctx } from '../core.ts';
import { drawEnv as sky } from './sky.ts';
import { drawEnv as floor } from './floor.ts';
import { drawEnv as city } from './city.ts';
import { drawEnv as space } from './space.ts';
import { drawEnv as exchange } from './exchange.ts';
import { drawEnv as stage } from './stage.ts';
import { drawEnv as clouds } from './clouds.ts';
import { drawEnv as ocean } from './ocean.ts';
import { drawEnv as vault } from './vault.ts';
import { drawEnv as paper } from './paper.ts';
import { drawEnv as voidEnv } from './void.ts';
import type { EnvOptions } from './common.ts';

export type { EnvCamera, EnvOptions } from './common.ts';
export type EnvType = 'sky' | 'floor' | 'city' | 'space' | 'exchange' | 'stage' | 'clouds' | 'ocean' | 'vault' | 'paper' | 'void';
export type EnvironmentOptions = EnvOptions & { type: EnvType };

/** Draws a named procedural backdrop. Every environment accepts the same timeline and parallax camera. */
export function drawEnv(ctx: Ctx, options: EnvironmentOptions) {
  switch (options.type) {
    case 'sky': sky(ctx, options); break;
    case 'floor': floor(ctx, options); break;
    case 'city': city(ctx, options); break;
    case 'space': space(ctx, options); break;
    case 'exchange': exchange(ctx, options); break;
    case 'stage': stage(ctx, options); break;
    case 'clouds': clouds(ctx, options); break;
    case 'ocean': ocean(ctx, options); break;
    case 'vault': vault(ctx, options); break;
    case 'paper': paper(ctx, options); break;
    case 'void': voidEnv(ctx, options); break;
  }
}

export { drawEnv as drawSkyEnv } from './sky.ts';
export { drawEnv as drawFloorEnv } from './floor.ts';
export { drawEnv as drawCityEnv } from './city.ts';
export { drawEnv as drawSpaceEnv } from './space.ts';
export { drawEnv as drawExchangeEnv } from './exchange.ts';
export { drawEnv as drawStageEnv } from './stage.ts';
export { drawEnv as drawCloudsEnv } from './clouds.ts';
export { drawEnv as drawOceanEnv } from './ocean.ts';
export { drawEnv as drawVaultEnv } from './vault.ts';
export { drawEnv as drawPaperEnv } from './paper.ts';
export { drawEnv as drawVoidEnv } from './void.ts';
