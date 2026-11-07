import type { PlatformStatus } from '../api/types';
import { Notice, PageHead } from '../components/common';
import { ADAPTER_LIMITS, PLATFORM_ACCESS, platformIcon } from '../lib/platforms';
import { useWorkspace } from '../workspace';

const STATE_LABEL: Record<PlatformStatus['state'], string> = {
  ready: 'Credentials set',
  missing_credentials: 'Missing credentials',
  unsupported: 'No publishing route',
};

const VERIFICATION: Record<PlatformStatus['verification'], string> = {
  mock_tested_only: 'Mock-tested only, never run against a live account',
  depends_on_gateway: 'Depends on your gateway',
  none: 'No adapter',
};

const ROUTE: Record<string, string> = { direct: 'Direct adapter', gateway: 'External gateway' };

export function PlatformsView() {
  const { platforms, status } = useWorkspace();
  const dryRun = status.publishMode === 'dry_run';
  const ready = platforms.filter(p => p.state === 'ready').length;
  const live = platforms.filter(p => p.canPublishLive).length;

  return (
    <>
      <PageHead eyebrow="Configure" title="Platforms">
        Read-only. Platforms are configured through <code>server/.env</code>, followed by a server restart. Being listed here does not mean a platform is connected.
      </PageHead>

      <Notice>
        {dryRun
          ? <><b>Mode: dry run.</b> No request leaves this server and posts end as Simulated. Set <code>PUBLISH_MODE=live</code> to allow real posts.</>
          : <><b>Mode: live.</b> {live} of {platforms.length} platforms would receive a real post now.</>}
        {' '}{ready} of {platforms.length} have complete credentials.
      </Notice>

      <div className="platforms">
        {platforms.map(p => (
          <article key={p.id} className="platform">
            <div className="platform-head">
              <h3>{platformIcon(p.id)} {p.displayName}</h3>
              <span className={`badge state-${p.state}`}>{STATE_LABEL[p.state]}</span>
            </div>
            <dl className="meta">
              <dt>Route</dt><dd>{p.route ? ROUTE[p.route] : p.support === 'gateway_only' ? 'Gateway only, none configured' : 'None'}</dd>
              <dt>Real post now</dt><dd>{p.canPublishLive ? 'Would be attempted' : 'No'}</dd>
              <dt>Limits</dt>
              <dd>{p.limits.maxChars.toLocaleString()} characters · {p.limits.requiresMedia ? 'media required' : p.limits.supportsMedia ? 'media allowed' : 'no media on this route'}</dd>
              <dt>Verification</dt><dd>{VERIFICATION[p.verification]}</dd>
            </dl>
            {p.missingEnv.length > 0 && (
              <div className="missing">
                <span>Missing in <code>server/.env</code></span>
                <div className="tags tags-code">{p.missingEnv.map(name => <code key={name}>{name}</code>)}</div>
              </div>
            )}
            {p.state === 'unsupported' && (
              <div className="missing">
                <span>Needs an external gateway listing this platform</span>
                <div className="tags tags-code">
                  <code>PUBLISHING_GATEWAY_URL</code><code>PUBLISHING_GATEWAY_TOKEN</code><code>PUBLISHING_GATEWAY_PLATFORMS</code>
                </div>
              </div>
            )}
            <p className="platform-note">{PLATFORM_ACCESS[p.id]}</p>
            {p.route === 'direct' && ADAPTER_LIMITS[p.id] && <p className="platform-note">{ADAPTER_LIMITS[p.id]}</p>}
          </article>
        ))}
      </div>
    </>
  );
}
