import { loadConfig, type Config } from './config.ts';
import type { Db } from './db/database.ts';
import { AppError } from './errors.ts';
import { createAnthropicGenerator, createAnthropicParse } from './generation/anthropic.ts';
import { createTemplateGenerator } from './generation/template.ts';
import type { ContentGenerator } from './generation/types.ts';
import { createLogger, createRedactor, type Logger, type Redactor } from './logger.ts';
import { createGateway, type PublishingGateway } from './publishing/gateway.ts';
import { ActivityRepository } from './repositories/activity.ts';
import { IdeasRepository } from './repositories/ideas.ts';
import { PillarsRepository } from './repositories/pillars.ts';
import { PostsRepository } from './repositories/posts.ts';
import { SettingsRepository } from './repositories/settings.ts';
import { AutonomyService } from './services/autonomy.ts';
import { IdeationService } from './services/ideation.ts';
import { PostService } from './services/posts.ts';
import { PublisherService } from './services/publisher.ts';

export interface Env {
  DB?: D1Database;
}

export interface Container {
  config: Config;
  db: Db;
  logger: Logger;
  redact: Redactor;
  now: () => Date;
  gateway: PublishingGateway;
  generator: ContentGenerator;
  settings: SettingsRepository;
  pillars: PillarsRepository;
  ideas: IdeasRepository;
  posts: PostsRepository;
  activity: ActivityRepository;
  ideation: IdeationService;
  postService: PostService;
  publisher: PublisherService;
  autonomy: AutonomyService;
}

/** Built per request: isolates hold no state, and everything durable is in D1. */
export function createContainer(env: Env): Container {
  const config = loadConfig(env);
  const db = env.DB;
  if (!db) {
    throw new AppError(500, 'database_unavailable', 'The D1 binding DB is not available. Declare it in .openai/hosting.json.');
  }
  const redact = createRedactor(config.secrets);
  const logger = createLogger(redact);
  const now = () => new Date();
  const gateway = createGateway(config, redact, (input, init) => fetch(input, init), now);
  const generator = config.generator.kind === 'anthropic'
    ? createAnthropicGenerator(createAnthropicParse(config.generator.anthropicApiKey, config.generator.anthropicModel))
    : createTemplateGenerator();

  const settings = new SettingsRepository(db);
  const pillars = new PillarsRepository(db);
  const ideas = new IdeasRepository(db);
  const posts = new PostsRepository(db);
  const activity = new ActivityRepository(db);

  const ideation = new IdeationService({ ideas, pillars, settings, generator, gateway, now });
  const postService = new PostService({ db, posts, ideas, pillars, settings, activity, ideation, generator, gateway, now });
  const publisher = new PublisherService({ db, posts, settings, activity, gateway, now });
  const autonomy = new AutonomyService({ db, posts, ideas, pillars, settings, activity, ideation, postService, generator, gateway, logger, now });

  return { config, db, logger, redact, now, gateway, generator, settings, pillars, ideas, posts, activity, ideation, postService, publisher, autonomy };
}
