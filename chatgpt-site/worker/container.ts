import {createXAdapter} from './publishing/adapters/x.ts';
import {createLinkedInAdapter} from './publishing/adapters/linkedin.ts';
import {createHttpClient} from './publishing/http.ts';
import type {PublishingAdapter} from './publishing/types.ts';
import { GenerationError } from './generation/types.ts';
import { Materials } from './services/materials.ts';
import { SocialAccounts } from './services/social.ts';
import { VideoPublisher } from './publishing/adapters/video.ts';
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
import { FeedbackRepository } from './repositories/feedback.ts';
import { SettingsRepository } from './repositories/settings.ts';
import { AutonomyService } from './services/autonomy.ts';
import { IdeationService } from './services/ideation.ts';
import { PostService } from './services/posts.ts';
import { PublisherService } from './services/publisher.ts';
import { InstagramAnalyticsService } from './services/instagram-analytics.ts';

export interface Env {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  [key:string]:unknown;
}

export interface Container {
  config: Config;
  materials: Materials;
  social: SocialAccounts;
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
  analytics: InstagramAnalyticsService;
}

/** Built per request: isolates hold no state, and everything durable is in D1. */
export async function createContainer(env: Env): Promise<Container> {
  const config = loadConfig(env);
  const db = env.DB;
  if (!db) {
    throw new AppError(500, 'database_unavailable', 'The D1 binding DB is not available. Declare it in .openai/hosting.json.');
  }
  config.secrets.push(...Object.entries(env).filter(([key,value])=>typeof value==='string'&&(/CLIENT_SECRET$/.test(key)||['SESSION_SECRET','TOKEN_ENCRYPTION_KEY','APP_PASSWORD_HASH'].includes(key))).map(([,value])=>String(value)));
  const redact = createRedactor(config.secrets);
  const logger = createLogger(redact);
  const now = () => new Date();
  const runtime=Object.fromEntries(Object.entries(env).filter((e):e is [string,string]=>typeof e[1]==='string'));
  const materials = new Materials(db,env.BUCKET,runtime);
  const social = new SocialAccounts(db,runtime);
  const analytics = new InstagramAnalyticsService(db,social,runtime);
  const video = new VideoPublisher(db,social,materials);
  const statuses=await social.statuses();
  const http=createHttpClient(fetch,config.publishHttpTimeoutMs);
  const extra=Object.fromEntries(statuses.filter(s=>['instagram','tiktok','youtube'].includes(s.platform)).map(s=>[s.platform,video.adapter(s.platform,s.connected,s.setupRequired)])) as Partial<Record<import('./domain/platforms.ts').PlatformId,PublishingAdapter>>;
  for(const platform of ['x','linkedin'] as const){const status=statuses.find(s=>s.platform===platform)!;
    if(status.connected)extra[platform]={idempotent:false,supportsMedia:false,missingCredentials:()=>platform==='linkedin'&&!config.linkedin.apiVersion?['LINKEDIN_API_VERSION']:[],async publish(request){const {account,access}=await social.token(platform);if(request.options?.accountId!==account.account_id)throw new Error('Review this post for the currently connected account');return platform==='x'?createXAdapter({accessToken:access},http).publish(request):createLinkedInAdapter({accessToken:access,authorUrn:account.account_id,apiVersion:config.linkedin.apiVersion},http).publish(request);}};
  }
  const gateway = createGateway(config, redact, (input, init) => fetch(input, init), now,extra);
  const generator:ContentGenerator = config.generator.kind === 'chatgpt-plan' ? {id:'chatgpt-plan',reviewRequired:true,async generateIdeas(){throw new GenerationError('Use the ChatGPT tab to generate with your plan');},async draftPost(){throw new GenerationError('Use the ChatGPT tab to generate with your plan');}} : config.generator.kind === 'anthropic'
    ? createAnthropicGenerator(createAnthropicParse(config.generator.anthropicApiKey, config.generator.anthropicModel))
    : createTemplateGenerator();

  const settings = new SettingsRepository(db);
  const pillars = new PillarsRepository(db);
  const ideas = new IdeasRepository(db);
  const posts = new PostsRepository(db);
  const feedback = new FeedbackRepository(db);
  const activity = new ActivityRepository(db);

  const ideation = new IdeationService({ ideas, pillars, settings, generator, gateway, now, feedback, analytics });
  const postService = new PostService({ db, posts, ideas, pillars, settings, activity, ideation, generator, gateway, now });
  const publisher = new PublisherService({ db, posts, settings, activity, gateway, now });
  const autonomy = new AutonomyService({ db, posts, ideas, pillars, settings, activity, ideation, postService, generator, gateway, logger, now });

  return { config, materials, social, db, logger, redact, now, gateway, generator, settings, pillars, ideas, posts, feedback, activity, ideation, postService, publisher, autonomy, analytics };
}
