import { GameState, InfoResponse, MoveResponse } from "./types";
import {
  applyMove,
  aStarFirstMove,
  buildBlockedSet,
  buildDangerSet,
  coordKey,
  findNearestFood,
  floodFill,
  manhattenDistance,
} from "./utils";

export function info(): InfoResponse {
  console.log("INFO");
  return {
    apiversion: "1",
    author: "Bubblun",
    color: "#ead00a",
    head: "smart-caterpillar",
    tail: "coffee",
  };
}

export function start(gameState: GameState): void {
  console.log(`${gameState.game.id} START`);
}

export function end(gameState: GameState): void {
  console.log(`${gameState.game.id} END\n`);
}

export function move(gameState: GameState): MoveResponse {
  const { you, board } = gameState;
  const myHead = you.head;
  const myLength = you.length;
  const myHealth = you.health;
  const { width, height } = board;

  const opponents = board.snakes.filter((s) => s.id !== you.id);

  // Build blocked and danger sets
  const blocked = buildBlockedSet(gameState, true);
  const danger = buildDangerSet(gameState, blocked);

  // Build candidate moves
  const allDirs = ["up", "down", "left", "right"];
  let candidates = allDirs.filter((dir) => {
    const next = applyMove(myHead, dir);
    // Out of bounds
    if (next.x < 0 || next.x >= width || next.y < 0 || next.y >= height) return false;
    // Blocked (body/hazard)
    if (blocked.has(coordKey(next))) return false;
    return true;
  });

  // Remove backward direction (neck check)
  if (you.body.length >= 2) {
    const neck = you.body[1];
    candidates = candidates.filter((dir) => {
      const next = applyMove(myHead, dir);
      return !(next.x === neck.x && next.y === neck.y);
    });
  }

  if (candidates.length === 0) {
    console.log(`MOVE ${gameState.turn}: No safe moves — CORNERED`);
    return { move: "up", shout: "CORNERED" };
  }

  // Flood fill scores for all candidates
  const fillScores: Record<string, number> = {};
  for (const dir of candidates) {
    fillScores[dir] = floodFill(applyMove(myHead, dir), blocked, width, height);
  }

  // Mode selection
  const minOpponentLength = opponents.length > 0
    ? Math.min(...opponents.map((o) => o.length))
    : Infinity;

  const nearbyWeakOpponent = opponents
    .filter((o) => o.length < myLength && manhattenDistance(myHead, o.head) <= 4)
    .sort((a, b) => manhattenDistance(myHead, a.head) - manhattenDistance(myHead, b.head))[0];

  const wantsFood = myHealth < 40 || myLength <= minOpponentLength;
  const wantsKill = !wantsFood && nearbyWeakOpponent !== undefined;

  // FOOD mode
  if (wantsFood) {
    const target = findNearestFood(myHead, board.food, blocked, width, height);
    if (target) {
      const m = aStarFirstMove(myHead, target, blocked, width, height);
      if (m && candidates.includes(m)) {
        console.log(`MOVE ${gameState.turn}: ${m} [HUNGRY]`);
        return { move: m, shout: "HUNGRY" };
      }
    }
    // Fall through to SURVIVE
  }

  // KILL mode
  if (wantsKill && nearbyWeakOpponent) {
    const m = aStarFirstMove(myHead, nearbyWeakOpponent.head, blocked, width, height);
    if (m && candidates.includes(m) && fillScores[m] > myLength / 2) {
      console.log(`MOVE ${gameState.turn}: ${m} [KILL]`);
      return { move: m, shout: "KILL" };
    }
    // Fall through to SURVIVE
  }

  // SURVIVE: score each candidate by flood fill, penalize danger and hazard
  const hazardSet = new Set(board.hazards.map(coordKey));
  let bestMove = candidates[0];
  let bestScore = -Infinity;

  for (const dir of candidates) {
    const next = applyMove(myHead, dir);
    const key = coordKey(next);
    let score = fillScores[dir];

    if (danger.has(key)) score = 0;
    if (hazardSet.has(key)) score *= 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestMove = dir;
    }
  }

  console.log(`MOVE ${gameState.turn}: ${bestMove} [SURVIVE]`);
  return { move: bestMove, shout: "SURVIVE" };
}
