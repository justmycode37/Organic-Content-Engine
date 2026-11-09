import { Materials } from './services/materials.ts';
import { ChatGPT } from './services/chatgpt.ts';
import { createChatGPTGenerator } from './generation/chatgpt.ts';
import type { Config } from './config.ts';
import { openDatabase, type Db } from './db/database.ts';
import { createAnthropicGenerator, createAnthropicParse } from './generation/anthropic.ts';
import { createTemplateGenerator } from './generation/template.ts';
import type { ContentGenerator } from './generation/types.ts';
import { createLogger, createRedactor, type Logger, type Redactor } from './logger.ts';
import { createGateway, type PublishingGateway } from './publishing/gateway.ts';
import type { FetchLike } from './publishing/types.ts';
import { ActivityRepository } from './repositories/activity.ts';
import { IdeasRepository } from './repositories/ideas.ts';
import { PillarsRepository } from './repositories/pillars.ts';
import { PostsRepository } from './repositories/posts.ts';
import { FeedbackRepository } from './repositories/feedback.ts';
import { SettingsRepository } from './repositories/settings.ts';
import { AutonomyService } from './services/autonomy.ts';
import { IdeationService } from './services/ideation.ts';
import { PostService } from './services/posts.ts';
import { PublisherService } from './services/publisher.ts';
import { Scheduler } from './services/scheduler.ts';

export interface Container {
  config: Config;
  materials: Materials;
  chatgpt: ChatGPT;
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
  feedback: FeedbackRepository;
  activity: ActivityRepository;
  ideation: IdeationService;
  postService: PostService;
  publisher: PublisherService;
  autonomy: AutonomyService;
  scheduler: Scheduler;
}

export interface Overrides {
  db?: Db;
  logger?: Logger;
  now?: () => Date;
  fetch?: FetchLike;
  generator?: ContentGenerator;
}

export function createContainer(config: Config, overrides: Overrides = {}): Container {
  const redact = createRedactor(config.secrets);
  const logger = overrides.logger ?? createLogger(redact);
  const now = overrides.now ?? (() => new Date());
  const db = overrides.db ?? openDatabase(config.databasePath);
  const gateway = createGateway(config, redact, overrides.fetch ?? fetch, now);
  const materials = new Materials(db);
  const chatgpt = new ChatGPT(config, overrides.fetch ?? fetch);
  const fallback = overrides.generator ?? (config.generator.kind === 'anthropic'
    ? createAnthropicGenerator(createAnthropicParse(config.generator.anthropicApiKey, config.generator.anthropicModel))
    : createTemplateGenerator());

  const chatgptGenerator = createChatGPTGenerator(chatgpt, materials);
  const active = () => chatgpt.status().connected ? chatgptGenerator : fallback;
  const generator: ContentGenerator = {
    get id() { return active().id; },
    get reviewRequired() { return active().reviewRequired; },
    generateIdeas: input => active().generateIdeas(input),
    draftPost: input => active().draftPost(input),
  };
  const settings = new SettingsRepository(db);
  const pillars = new PillarsRepository(db);
  const ideas = new IdeasRepository(db);
  const posts = new PostsRepository(db);
  const feedback = new FeedbackRepository(db);
  const activity = new ActivityRepository(db);

  const ideation = new IdeationService({ materials, ideas, pillars, settings, generator, gateway, feedback, now });
  const postService = new PostService({ db, posts, ideas, pillars, settings, activity, ideation, generator, gateway, feedback, now });
  const publisher = new PublisherService({ db, posts, settings, activity, gateway, now });
  const autonomy = new AutonomyService({ db, posts, ideas, pillars, settings, activity, ideation, postService, generator, gateway, logger, now });
  const scheduler = new Scheduler({
    publisher,
    autonomy,
    logger,
    now,
    tickSeconds: config.scheduler.tickSeconds,
    enabled: config.scheduler.enabled,
  });

  return { config, materials, chatgpt, db, logger, redact, now, gateway, generator, settings, pillars, ideas, posts, feedback, activity, ideation, postService, publisher, autonomy, scheduler };
}
