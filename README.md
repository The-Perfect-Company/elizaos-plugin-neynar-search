# @elizaos/plugin-neynar-search

**Read-only Farcaster engagement discovery for ElizaOS agents via the Neynar REST API.**

No signer. No posting. No Farcaster client dependency. Pure signal detection.

---

## What it does

Registers three actions:

### `SEARCH_FARCASTER` — Discovery & Delivery

1. **Dynamically extracts keywords** from the agent's RAG knowledge (prioritizing `farcaster_target_list.md` and `twitter_target_list.md` content from the `knowledge` table) or parses them from the triggering message.
2. **Searches Farcaster casts** matching the keyword corpus via `GET /v2/farcaster/cast/search`.
3. **Scores each cast** on three axes (author reach · engagement velocity · topical alignment) → **1–10**
4. **Filters to scores ≥ 6/10**, caps queue at **5 opportunities** (configurable via `MAX_RESULTS`)
5. **Fallback**: if no opportunities meet the 6/10 threshold, returns the **top 5 highest-scoring** casts tagged as `[BELOW THRESHOLD]`
6. **Delivers the ranked queue** (post URL, handle, engagement counts, score, suggested reply angle) to a target agent's DirectClient endpoint.

Designed for a **Scout agent** that feeds engagement opportunities to a publishing agent (e.g. Archon Europae) without ever touching the social graph itself.

### `LIKE_FARCASTER` — Batch Liking

1. **Retrieves Scout deliveries** from the target agent's memory (memories tagged `[SCOUT DELIVERY]`)
2. **Resolves short cast hashes** to full Neynar cast objects via `GET /v2/farcaster/cast?identifier=...&type=url`
3. **Batch-likes** up to the daily budget limit via `POST /v2/farcaster/reaction` (signer-based)
4. **Tracks daily budget** in `like-state.json` with automatic window reset at midnight UTC
5. **Logs per-cycle results** with breakdown: Scout-sourced vs extra casts, daily remaining budget, failures

Designed for a **publishing agent** (e.g. Archon Europae) that batch-likes Farcaster posts delivered by the Scout, using a configured Neynar signer UUID.

### `REPLY_DIRECT_CAST` — DM Processing & Reply

1. **Fetches pending Direct Casts** via Neynar `GET /v2/farcaster/notifications` — the same endpoint already used by the Scout for Tier 3, but now includes `direct_cast` type in the filter. **Zero additional API credits** for receiving DMs.
2. **Filters spam** using configurable thresholds:
   - Minimum follower count (default: 50; 200 for non-power-badge senders)
   - Regex pattern matching against known spam patterns (crypto scams, giveaways, unsolicited promotions)
   - Deduplication against already-processed DM hashes
3. **Reviews past interactions** by querying the agent's in-memory message history for previous conversations with the sender
4. **Reviews current knowledge** on the DM subject using semantic embedding search (RAG similarity scoring against the agent's knowledge base)
5. **Scores each DM** on a 0–100 priority scale based on:
   - Base score: 20
   - Mutual follower status: +15
   - Power badge holder: +10
   - Follower count tiers: +5 (1K+), +10 (10K+), +15 (50K+)
   - Past interaction history: +10
   - Knowledge relevance similarity (0–30, scaled from embedding cosine similarity)
6. **Generates context-aware replies** using the agent's LLM, incorporating sender profile, past interactions, and DM content into the prompt context
7. **Sends replies** via Neynar `POST /v2/farcaster/message` (signer-based write)
8. **Tracks state** in `dm-state.json`: processed DM hashes, sent reply hashes, daily reply counts, pending queue

Designed for a **publishing agent** (e.g. Archon Europae) that processes its own inbound Direct Casts using a configured Neynar signer UUID for replies.

---

## Installation

```bash
# From within a pnpm workspace that includes this plugin:
pnpm install

# Or as a published package:
pnpm add @elizaos/plugin-neynar-search
```

---

## Configuration

### Required

| Setting | Description |
|---------|-------------|
| `FARCASTER_NEYNAR_API_KEY` | Neynar API key for all API calls. Get a free key at [neynar.com](https://neynar.com). |

### Optional — SEARCH_FARCASTER (Scout)

All optional settings have sensible defaults. Override any of them via environment variables or `character.json` > `settings.secrets`.

| Setting | Default | Description |
|---------|---------|-------------|
| `ARCHON_BASE_URL` | `http://archon_euro_container:3000` | Base URL of the target agent's DirectClient |
| `ARCHON_AGENT_ID` | `187939ae-c36e-08ef-836f-131b1b658c9a` | Agent ID receiving the scout queue |
| `ARCHON_FARCASTER_FID` | `3315139` | FID of the target agent (for Tier 3 inbound engagement detection) |
| `TARGET_LIST_JSON_PATH` | `{cwd}/characters/archon_europae/farcaster_target_list.json` | Path to the generated target list JSON (Tier 2 profile monitoring) |
| `SCOUT_MAX_RESULTS` | `5` | Maximum number of opportunities in the ranked queue |
| `SCOUT_MIN_SCORE` | `6` | Minimum score threshold; casts below this are discarded (unless fallback triggers) |

### Optional — LIKE_FARCASTER (Liking)

| Setting | Default | Description |
|---------|---------|-------------|
| `FARCASTER_NEYNAR_SIGNER_UUID` | *(required for liking)* | Neynar signer UUID for the Farcaster account that performs the likes |
| `ARCHON_AGENT_ID` | `187939ae-c36e-08ef-836f-131b1b658c9a` | Agent ID whose memories are queried for Scout deliveries |
| `LIKE_DAILY_MAX` | `270` | Maximum number of likes per rolling 24h window |
| `LIKE_BATCH_SIZE` | `10` | Maximum casts per single `batchLikeCasts` call |
| `LIKE_BATCH_DELAY_MS` | `2000` | Delay (ms) between batches to avoid rate limits |
| `LIKE_PER_CAST_DELAY_MS` | `500` | Delay (ms) between individual `likeCast` calls |
| `LIKE_EXTRA_PER_CYCLE` | `5` | Additional non-Scout hashes to like per cycle (from extraCastHashes config) |
| `LIKE_STATE_PATH` | `/app/.neynar-state/like-state.json` | Path to persist like budget/state across cycles |

### Optional — REPLY_DIRECT_CAST (DM Processing)

| Setting | Default | Description |
|---------|---------|-------------|
| `DM_POLL_INTERVAL` | `3600` | Poll interval in seconds (default: 3600 = 1h) |
| `DM_MIN_FOLLOWERS` | `50` | Minimum followers for DM sender to pass spam filter |
| `DM_MIN_FOLLOWERS_POWER` | `200` | Minimum followers for non-power-badge senders (tighter threshold) |
| `DM_MAX_PER_SENDER` | `3` | Maximum DMs processed per sender in 24h rolling window |
| `DM_MAX_PER_CYCLE` | `3` | Maximum DMs to process per cycle (caps Neynar API credit usage) |
| `DM_MIN_SCORE` | `30` | Minimum priority score (0–100) for a DM to receive a reply |
| `DM_DAILY_REPLY_LIMIT` | `10` | Maximum DM replies per day (protects Neynar credit budget) |

### Example: `character.json`

```json
{
  "plugins": ["@elizaos/plugin-neynar-search"],
  "clients": ["direct"],
  "settings": {
    "secrets": {
      "FARCASTER_NEYNAR_API_KEY": "your-neynar-api-key",
      "ARCHON_BASE_URL": "http://my-agent:3000",
      "ARCHON_AGENT_ID": "my-agent-id",
      "ARCHON_FARCASTER_FID": "123456",
      "TARGET_LIST_JSON_PATH": "/app/data/targets.json",
      "SCOUT_MAX_RESULTS": "10",
      "SCOUT_MIN_SCORE": "4"
    }
  }
}
```

> **Important:** Use only `"direct"` in the `clients` array. The `auto` client drives autonomous posting — a read-only discovery agent must not post anything. The `direct` client exposes the HTTP endpoint that `scout_cycle.sh` calls.

Or set any setting via environment variable:

```bash
FARCASTER_NEYNAR_API_KEY=your-neynar-api-key
ARCHON_BASE_URL=http://my-agent:3000
SCOUT_MAX_RESULTS=10
```

---

## Usage — SEARCH_FARCASTER

Trigger the action by messaging the agent:

```
Run a Farcaster discovery cycle.
```

Or with a custom keyword list:

```
Search Farcaster keywords: EU energy, European sovereignty, Austrian economics
```

The action will return a structured queue. When opportunities meet the threshold:

```
[SCOUT CYCLE 2024-01-15T10:00:00Z] — 3 opportunity(ies) queued

1. SCORE 9.2/10 — @ischinger
   URL: https://warpcast.com/ischinger/0x1a2b3c
   Reach: 84,700 followers [⚡ power badge]
   Engagement: 847L / 32RC / 62R (941 total)
   Keywords: EU energy, European sovereignty
   Angle: Lead with a data-rich counterpoint on "EU energy" — @ischinger's 941 interactions signal peak momentum.

...

Queue delivered to Archon. 3 item(s). Cycle complete.
```

When no opportunities meet the 6/10 threshold, a fallback queue is returned with the top 5 highest-scoring casts:

```
[SCOUT CYCLE 2024-01-15T10:00:00Z] — FALLBACK: 5 lowest-scoring opportunities (none above 6/10 threshold)

1. SCORE 4.5/10 [BELOW THRESHOLD] — @username
   URL: https://warpcast.com/username/0x...
   Reach: 1,200 followers
   Engagement: 12L / 3RC / 1R (16 total)
   Keywords: EU energy
   Angle: Reply to @username on "EU energy" with a sourced data point to qualify the thread (16 interactions, score 4.5/10).

...

Fallback queue delivered to Archon. 5 item(s) (all below 6/10 threshold). Cycle complete.
```

---

## Usage — LIKE_FARCASTER

The LIKE action is triggered by messaging the agent:

```
Run like cycle.
```

The action retrieves Scout deliveries from memory, resolves cast hashes via Neynar, and batch-likes them:

```
[LIKE] ===== LIKE cycle #12 starting =====
[LIKE] Scout deliveries found: 12 delivery memories, 56 cast URLs
[LIKE] Cast URLs to process: 56
[LIKE] Resolving 6 unique short hashes...
[LIKE] lookupCast succeeded for 5/6 hashes
[LIKE] Like batch 1/1: 5 casts
[LIKE]   ✓ Cast 1/5: https://warpcast.com/ischinger/0x1a2b3c → SUCCESS
[LIKE]   ✓ Cast 2/5: https://warpcast.com/user/0x4d5e6f → SUCCESS
[LIKE]   ✓ Cast 3/5: https://warpcast.com/other/0x7g8h9i → SUCCESS
[LIKE]   ✓ Cast 4/5: https://warpcast.com/author/0x0j1k2l → SUCCESS
[LIKE]   ✓ Cast 5/5: https://warpcast.com/handle/0x3m4n5o → SUCCESS
[LIKE] LIKE cycle #12 complete. Liked 5 casts (5 Scout + 0 extra). Daily: 265/270 remaining. Failed: 0.
```

The action is driven by a cron job on the host:

```bash
# Install on the host (run once):
(crontab -l 2>/dev/null; echo "0 */3 * * * /root/agents-ecosystem/engine/scripts/like_cycle.sh >> /root/agents-ecosystem/engine/logs/quotes/like_cycle.log 2>&1") | crontab -
```

The script [`scripts/like_cycle.sh`](../../scripts/like_cycle.sh) sends a like trigger via `curl` to:

```
POST http://localhost:3000/{ARCHON_AGENT_ID}/message
```
---

## Usage — REPLY_DIRECT_CAST

The REPLY_DIRECT_CAST action is triggered by messaging the agent:

```
Process pending direct casts. Use the REPLY_DIRECT_CAST action to fetch, filter, score, and reply to incoming Direct Cast messages.
```

The action fetches pending DMs, applies spam filtering, scores senders, and generates replies:

```
[DIRECT_CAST] ===== Direct Cast processing cycle #1 starting =====
[DIRECT_CAST] Archon FID: 3315139
[DIRECT_CAST] DM config: minFollowers=50, minFollowersPower=200, maxPerSender=3, maxPerCycle=3, minScore=30, dailyLimit=10
[DIRECT_CAST] Fetching notifications for FID 3315139...
[DIRECT_CAST] Received 5 notifications, including 2 direct_cast type
[DIRECT_CAST] Filtered to 2 pending DMs after dedup
[DIRECT_CAST] Checking spam for DM from @user1 (fid: 12345, followers: 850, power_badge: true)
[DIRECT_CAST]   → Past interactions found: 2 messages in history
[DIRECT_CAST]   → Knowledge relevance score: 0.65 (scaled: 19.5/30)
[DIRECT_CAST]   → Priority score: 64.5/100
[DIRECT_CAST] Checking spam for DM from @user2 (fid: 67890, followers: 12, power_badge: false)
[DIRECT_CAST]   → SPAM: blocked by profile check (followers 12 < min 50)
[DIRECT_CAST] Generating reply for @user1 (score 64.5/100)...
[DIRECT_CAST] Reply sent to @user1 (fid: 12345) — messageId: 0xabc123
[DIRECT_CAST] State saved: dailyReplyCount=1, dailyReplyDate=2026-06-01
[DIRECT_CAST] ===== Direct Cast processing cycle #1 complete =====
[DIRECT_CAST] Summary: 2 DMs received, 1 spam filtered, 1 replied, 0/1 pending (score below threshold)
```

### DM Priority Scoring (0–100)

| Factor | Max Points | Description |
|--------|:----------:|-------------|
| Base score | 20 | Each DM starts at 20 |
| Mutual follow | +15 | Sender follows Archon AND Archon follows sender back |
| Power badge | +10 | Sender has Neynar power badge (verified human) |
| Follower tier (1K+) | +5 | ≥ 1,000 followers |
| Follower tier (10K+) | +10 | ≥ 10,000 followers |
| Follower tier (50K+) | +15 | ≥ 50,000 followers |
| Past interaction | +10 | Previous conversations exist in message history |
| Knowledge relevance | 0–30 | Scaled from embedding cosine similarity (0.3+ sim → scaled) |

**Threshold**: DMs scoring ≥ `DM_MIN_SCORE` (default: 30) receive a reply. DMs below threshold are logged as pending for manual review.

The action is driven by a cron job on the host:

```bash
# Install on the host (run once):
(crontab -l 2>/dev/null; echo "30 */6 * * * /root/agents-ecosystem/engine/scripts/dm_cycle.sh >> /var/log/dm_cycle.log 2>&1") | crontab -
```

The script [`scripts/dm_cycle.sh`](../../agents-ecosystem/engine/scripts/dm_cycle.sh) sends a DM processing trigger via `curl` to:

```
POST http://localhost:3000/{ARCHON_AGENT_ID}/message
```

---



## Scoring Algorithm

Each cast is scored on three **weighted** axes (0–10 each), combined to produce a final score:

| Axis | Weight | Rationale |
|------|:------:|-----------|
| **Topical Alignment** | **×4** | Most important — the Scout's primary mission is finding casts matching Archon's strategic vectors |
| **Engagement Velocity** | **×3** | Measures active conversation momentum, secondary to relevance |
| **Author Reach** | **×3** | Lowest weight to avoid celebrity bias; niche experts on-topic are worth more than big accounts rambling |

### Axis 1 — Author Reach  (weight: 3)
`(log10(follower_count) / 6) * 10` normalized to 0–10 (1M followers = 10). +1 bonus for Neynar power badge, capped at 10.

| Followers | Score |
|-----------|-------|
| 100       | 3.3   |
| 1 000     | 5.0   |
| 10 000    | 6.7   |
| 100 000   | 8.3   |
| 1 000 000 | 10.0  |

### Axis 2 — Engagement Velocity  (weight: 3)
`(likes + recasts + replies)` linear scale, saturates at 500 total → 10.

| Total engagement | Score |
|-----------------|-------|
| 0               | 0     |
| 50              | 1.0   |
| 250             | 5.0   |
| 500+            | 10.0  |

### Axis 3 — Topical Alignment  (weight: 4)
Count of distinct keywords from the active corpus found in the cast text:

| Keyword matches | Score |
|----------------|-------|
| 0              | 0     |
| 1              | 3.3   |
| 2              | 6.7   |
| 3+             | 10.0  |

**Final score** = `(reach × 3 + velocity × 3 + alignment × 4) / 10` rounded to 1 decimal, clamped [1, 10].

### Filtering

- Casts scoring **≥ 6** are included in the normal queue, capped at `MAX_RESULTS` (default: 5).
- If **no casts** score ≥ 6, the **top 5 highest-scoring** casts are returned as a **fallback queue**, each tagged with `[BELOW THRESHOLD]`.
- This ensures Archon always receives actionable intelligence, even during low-signal periods.

---

## Delivery to target agent

The plugin POSTs the ranked queue to the target agent's DirectClient `/ingest` endpoint (skips LLM inference — ~50ms response):
```
{ARCHON_BASE_URL}/{ARCHON_AGENT_ID}/ingest
```

Configure the target via `ARCHON_BASE_URL` and `ARCHON_AGENT_ID` runtime settings (see [Configuration](#configuration)). No code changes needed.

---

## Neynar API endpoints used

### SEARCH_FARCASTER (Scout — read-only)

| Method | Endpoint | Purpose | Tier |
|--------|----------|---------|:----:|
| GET | `/v2/farcaster/cast/search?q=QUERY&limit=25` | Keyword cast search | T1 |
| GET | `/v2/farcaster/user/casts?fid=FID&limit=10` | Target profile monitoring | T2 |
| GET | `/v2/farcaster/notifications?fid={FID}&limit=25` | Inbound engagement detection | T3 |

**Auth**: `api_key` header. No signer UUID. Fully read-only.

### LIKE_FARCASTER (Archon — write)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/v2/farcaster/cast?identifier=URL&type=url` | Resolve short cast hashes to full cast objects (pre-like validation) |
| POST | `/v2/farcaster/reaction` | Like a cast (signer-based). Request body: `{ "signer_uuid": "...", "reaction_type": "like", "target": "cast", "target_fid": FID, "target_hash": "0x..." }` |

**Auth**: `api_key` header + `signer_uuid` in request body. Requires a Neynar plan with signer-based write access.

### REPLY_DIRECT_CAST (Archon — read + write)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/v2/farcaster/notifications?fid={FID}&limit=25` | Fetch pending Direct Casts (reuses Scout's Tier 3 call — 0 additional credits) |
| GET | `/v2/farcaster/user/bulk?fids=FID` | Lookup sender profile (follower count, power badge) for spam checking |
| POST | `/v2/farcaster/message` | Send a Direct Cast reply (signer-based). Request body: `{ "signer_uuid": "...", "recipient_fid": FID, "message": "..." }` |

**Auth**: `api_key` header + `signer_uuid` for the message endpoint. Notifications and user lookup are read-only (api_key only). Sending DMs costs ~5 Neynar credits each.

---

## Trigger mechanism

The Scout agent is driven by a cron job on the host that calls its `DirectClient` HTTP endpoint every 3 hours:

```bash
# Install on the host (run once):
(crontab -l 2>/dev/null; echo "0 */3 * * * /root/agents-ecosystem/engine/scripts/scout_cycle.sh >> /var/log/scout_cycle.log 2>&1") | crontab -
```

The script [`scripts/scout_cycle.sh`](../../scripts/scout_cycle.sh) sends a discovery prompt via `curl` to:

```
POST http://localhost:3003/{SCOUT_AGENT_ID}/message
```

This triggers the `SEARCH_FARCASTER` action inside the container and returns the ranked queue to the shell log.

---

## Integration with ElizaOS engine

### 1. Add the dependency

```bash
pnpm add @elizaos/plugin-neynar-search@github:xavier-arosemena/elizaos-plugin-neynar-search
```

Or add it manually to `package.json`:

```json
{
  "dependencies": {
    "@elizaos/plugin-neynar-search": "github:xavier-arosemena/elizaos-plugin-neynar-search"
  }
}
```

### 2. `src/index.ts` (engine)

```typescript
import { neynarSearchPlugin } from "@elizaos/plugin-neynar-search";

// In createAgent(), add to plugins array:
const needsNeynarPlugin = pluginStrings.includes("@elizaos/plugin-neynar-search");

plugins: [
  bootstrapPlugin,
  webSearchPlugin,
  needsNeynarPlugin ? neynarSearchPlugin : null,
  // ...
].filter(Boolean),
```

### 3. Run install

```bash
pnpm install
```

The plugin is downloaded from the GitHub repository and installed like any other npm dependency. No workspace copy needed.

---

## Development workflow

This plugin is developed in its own repository at `elizaos-plugin-neynar-search/` and consumed by the engine as a git dependency. For local development, use the **link-based workflow**:

### Link-based development (recommended)

```bash
# 1. Temporarily switch to a local symlink
cd /root/agents-ecosystem/engine
# Edit package.json:
#   "@elizaos/plugin-neynar-search": "link:/root/elizaos-plugin-neynar-search"
pnpm install

# 2. Edit files in /root/elizaos-plugin-neynar-search/ — changes reflect immediately

# 3. When ready to publish, commit and push to GitHub
cd /root/elizaos-plugin-neynar-search
git add -A && git commit -m "..."
git push origin master
git tag v0.1.2 && git push origin v0.1.2

# 4. Switch engine back to the git dependency
cd /root/agents-ecosystem/engine
# Edit package.json:
#   "@elizaos/plugin-neynar-search": "github:xavier-arosemena/elizaos-plugin-neynar-search"
pnpm install
```

### Development cycle

1. Edit plugin source in `elizaos-plugin-neynar-search/src/`
2. Test with `link:` dependency in the engine project
3. Commit, tag, push to GitHub
4. Switch engine back to `github:` dependency
5. Run `pnpm install` in the engine to pull the latest version

---

## Repository structure

```
elizaos-plugin-neynar-search/
├── src/
│   ├── index.ts                    # Plugin entry point — registers SEARCH_FARCASTER, LIKE_FARCASTER, and REPLY_DIRECT_CAST
│   ├── types.ts                    # NeynarCast, ScoredOpportunity, DmConfig, DmPriorityState, LikeConfig, LikeState, LikeCycleResult
│   ├── actions/
│   │   ├── searchFarcaster.ts      # SEARCH_FARCASTER action (Scout: keyword search → score → deliver)
│   │   ├── likeFarcaster.ts        # LIKE_FARCASTER action (Archon: retrieve deliveries → resolve → batch-like)
│   │   └── replyDirectCast.ts      # REPLY_DIRECT_CAST action (Archon: fetch DMs → filter spam → score → reply)
│   └── lib/
│       ├── neynarClient.ts         # Raw fetch HTTP wrappers (searchCasts, getUserCasts, lookupCast, lookupUserByFid, likeCast, batchLikeCasts, sendDirectCast)
│       ├── scorer.ts               # Three-axis scoring engine
│       ├── likeState.ts            # Like state persistence (daily budget tracking, window reset, load/save)
│       ├── cache.ts                # Search result cache with TTL
│       └── watchlist.ts            # Auto-discovery author watchlist
├── package.json
├── tsconfig.json
├── LICENSE                         # MIT
├── README.md
└── .gitignore
```

---

## License

MIT — see [LICENSE](LICENSE).
