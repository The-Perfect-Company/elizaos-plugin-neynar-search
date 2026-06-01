// =============================================================================
// @elizaos/plugin-neynar-search — ElizaOS plugin entry point
//
// Registers three actions:
//   SEARCH_FARCASTER  — Topic discovery and opportunity scoring
//   LIKE_FARCASTER    — Batch like with daily budget, rate limiting, dedup
//   REPLY_DIRECT_CAST — Direct Cast (DM) processing and reply (ISSUE #9)
// =============================================================================

import type { Plugin } from "@elizaos/core";
import { searchFarcasterAction } from "./actions/searchFarcaster.js";
import { likeFarcasterAction } from "./actions/likeFarcaster.js";
import { replyDirectCastAction } from "./actions/replyDirectCast.js";

export const neynarSearchPlugin: Plugin = {
  name: "@elizaos/plugin-neynar-search",
  description:
    "Farcaster engagement discovery, like, and DM reply actions via Neynar REST API. " +
    "Provides SEARCH_FARCASTER (scout/topic discovery), LIKE_FARCASTER " +
    "(batch like with daily budget, rate limiting, dedup), and REPLY_DIRECT_CAST " +
    "(DM processing, spam filtering, priority scoring, and reply sending).",
  actions: [searchFarcasterAction, likeFarcasterAction, replyDirectCastAction],
  evaluators: [],
  providers: [],
};

export default neynarSearchPlugin;

// Named re-exports for convenience
export { searchFarcasterAction } from "./actions/searchFarcaster.js";
export { likeFarcasterAction } from "./actions/likeFarcaster.js";
export { replyDirectCastAction } from "./actions/replyDirectCast.js";
export { createPluginConfig } from "./actions/searchFarcaster.js";
export { lookupCast, searchCasts, getUserCasts, searchAllKeywords, likeCast, batchLikeCasts, sendDirectCast, lookupUserByFid } from "./lib/neynarClient.js";
export type {
  NeynarCast,
  ScoredOpportunity,
  PluginConfig,
  ScoutCycleState,
  MonitoredProfile,
  LikeConfig,
  LikeState,
  LikeCycleResult,
  DirectCastNotification,
  DmConfig,
  DmPriorityState,
} from "./types.js";
