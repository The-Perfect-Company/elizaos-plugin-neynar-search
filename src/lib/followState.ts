// =============================================================================
// followState.ts — Persisted state for FOLLOW_FARCASTER / UNFOLLOW_FARCASTER
//
// Shared state between the follow and unfollow actions:
//   - FOLLOW_FARCASTER: records followed FIDs, timestamps
//   - UNFOLLOW_FARCASTER: reads/writes staggered pagination cursor
//
// State file: /app/.neynar-state/follow-state.json
// =============================================================================

import * as fs from "fs";
import * as path from "path";
import { elizaLogger } from "@elizaos/core";
import type { FollowState } from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_STATE_DIR = "/app/.neynar-state";
const DEFAULT_STATE_FILE = path.join(DEFAULT_STATE_DIR, "follow-state.json");

// ---------------------------------------------------------------------------
// Default state factory
// ---------------------------------------------------------------------------

/**
 * Create a fresh FollowState with default values.
 */
export function createDefaultFollowState(): FollowState {
  return {
    followedFids: [],
    followedAt: {},
    followerCursor: null,
    followerPageChecked: 0,
    lastFollowCycle: null,
    lastUnfollowCycle: null,
    followCycleCount: 0,
    unfollowCycleCount: 0,
    totalFollowsExecuted: 0,
    totalUnfollowsExecuted: 0,
  };
}

// ---------------------------------------------------------------------------
// Load / Save
// ---------------------------------------------------------------------------

/**
 * Get the path to the follow state file.
 */
export function getFollowStatePath(statePath?: string): string {
  return statePath || DEFAULT_STATE_FILE;
}

/**
 * Load the persisted FollowState from disk.
 * Returns a default state if the file doesn't exist or is corrupted.
 */
export function loadFollowState(statePath?: string): FollowState {
  const filePath = getFollowStatePath(statePath);

  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as FollowState;

      // Validate required fields
      if (
        Array.isArray(parsed.followedFids) &&
        typeof parsed.followedAt === "object" &&
        typeof parsed.followCycleCount === "number"
      ) {
        elizaLogger.debug(
          `[FOLLOW] State loaded from ${filePath} — ` +
          `${parsed.followedFids.length} followed, ` +
          `followCycles=${parsed.followCycleCount}, ` +
          `unfollowCycles=${parsed.unfollowCycleCount}`
        );
        return parsed;
      }

      elizaLogger.warn("[FOLLOW] State file has invalid structure — resetting to defaults");
    } else {
      elizaLogger.debug(`[FOLLOW] No state file at ${filePath} — starting fresh`);
    }
  } catch (err) {
    elizaLogger.warn(`[FOLLOW] Error loading state from ${filePath}: ${String(err)} — resetting`);
  }

  return createDefaultFollowState();
}

/**
 * Persist FollowState to disk.
 */
export function saveFollowState(state: FollowState, statePath?: string): void {
  const filePath = getFollowStatePath(statePath);

  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");

    elizaLogger.debug(
      `[FOLLOW] State saved to ${filePath} — ` +
      `${JSON.stringify(state).length} bytes`
    );
  } catch (err) {
    elizaLogger.error(`[FOLLOW] Failed to save state to ${filePath}: ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// State mutation helpers
// ---------------------------------------------------------------------------

/**
 * Record that we followed the given FIDs.
 * Appends to followedFids and records timestamps.
 */
export function markFollowed(state: FollowState, fids: number[]): FollowState {
  const now = new Date().toISOString();
  for (const fid of fids) {
    if (!state.followedFids.includes(fid)) {
      state.followedFids.push(fid);
      state.followedAt[String(fid)] = now;
    }
  }
  state.totalFollowsExecuted += fids.length;
  elizaLogger.info(
    `[FOLLOW] markFollowed: recorded ${fids.length} FIDs — total followed: ${state.followedFids.length}`
  );
  return state;
}

/**
 * Record that we unfollowed the given FIDs.
 * Removes from followedFids and cleans up followedAt.
 */
export function markUnfollowed(state: FollowState, fids: number[]): FollowState {
  const fidSet = new Set(fids);
  state.followedFids = state.followedFids.filter((fid) => !fidSet.has(fid));
  for (const fid of fids) {
    delete state.followedAt[String(fid)];
  }
  state.totalUnfollowsExecuted += fids.length;
  elizaLogger.info(
    `[FOLLOW] markUnfollowed: removed ${fids.length} FIDs — total followed: ${state.followedFids.length}`
  );
  return state;
}

/**
 * Update the staggered pagination cursor after fetching one page of followers.
 * When cursor is null, the next cycle starts from page 1 (full pass complete).
 */
export function updateFollowerCursor(
  state: FollowState,
  cursor: string | null,
  pageSize: number
): FollowState {
  state.followerCursor = cursor;
  state.followerPageChecked = pageSize;

  elizaLogger.info(
    `[FOLLOW] updateFollowerCursor: cursor=${cursor || "null (restarting from page 1)"}, ` +
    `pageSize=${pageSize}`
  );

  return state;
}

/**
 * Check if the follow limit for this cycle has been reached.
 */
export function isFollowLimitReached(state: FollowState, maxFollows: number): boolean {
  // This is checked in the action handler before calling followUsers
  return false; // logic handled externally
}
