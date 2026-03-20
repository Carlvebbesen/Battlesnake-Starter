import { GameState, InfoResponse, MoveResponse } from "./types";
import {
  applyMove,
  aStarFirstMove,
  buildBlockedSet,
  buildDangerSet,
  coordKey,
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

  // === STATE SNAPSHOT ===
  const opponentSummary = opponents.map((o) => ({
    name: o.name,
    length: o.length,
    health: o.health,
    head: o.head,
    distToMe: manhattenDistance(myHead, o.head),
  }));
  console.log(
    `[T${gameState.turn}] HEAD=(${myHead.x},${myHead.y}) len=${myLength} hp=${myHealth} ` +
    `opponents=${opponents.length} food=${board.food.length} hazards=${board.hazards.length}`
  );
  if (opponentSummary.length > 0) {
    console.log(`[T${gameState.turn}] OPPONENTS: ${JSON.stringify(opponentSummary)}`);
  }

  if (candidates.length === 0) {
    console.log(`[T${gameState.turn}] CORNERED — no safe moves`);
    return { move: "up", shout: "CORNERED" };
  }

  // Flood fill scores for all candidates
  const fillScores: Record<string, number> = {};
  for (const dir of candidates) {
    fillScores[dir] = floodFill(applyMove(myHead, dir), blocked, width, height);
  }

  // === CANDIDATE SCORES ===
  {
    const hazardSetDebug = new Set(board.hazards.map(coordKey));
    const candidateLog = candidates.map((dir) => {
      const next = applyMove(myHead, dir);
      const key = coordKey(next);
      const isDanger = danger.has(key);
      const isHazard = hazardSetDebug.has(key);
      return `${dir}(fill=${fillScores[dir]}${isDanger ? ",DANGER" : ""}${isHazard ? ",HAZARD" : ""})`;
    });
    console.log(`[T${gameState.turn}] CANDIDATES: ${candidateLog.join(" | ")}`);
  }

  // Rank food: uncontested (we arrive first) sorted before contested
  const rankedFood = board.food
    .map((f) => {
      const myDist = manhattenDistance(myHead, f);
      const minOppDist = opponents.length > 0
        ? Math.min(...opponents.map((o) => manhattenDistance(o.head, f)))
        : Infinity;
      return { food: f, myDist, contested: myDist >= minOppDist };
    })
    .sort((a, b) => {
      if (a.contested !== b.contested) return a.contested ? 1 : -1;
      return a.myDist - b.myDist;
    });

  // === FOOD RANKING ===
  if (rankedFood.length > 0) {
    const foodLog = rankedFood.map(({ food, myDist, contested }) =>
      `(${food.x},${food.y}) myDist=${myDist} ${contested ? "CONTESTED" : "free"}`
    );
    console.log(`[T${gameState.turn}] FOOD RANKED: ${foodLog.join(" | ")}`);
  }

  // FOOD mode: always try to eat to grow (stay longest), but not into a trap
  for (const { food, myDist, contested } of rankedFood) {
    const m = aStarFirstMove(myHead, food, blocked, width, height);
    const fillOk = m ? fillScores[m] > myLength / 2 : false;
    const emergency = myHealth < 30;
    console.log(
      `[T${gameState.turn}] FOOD (${food.x},${food.y}) myDist=${myDist} contested=${contested} ` +
      `astar=${m ?? "none"} fill=${m ? fillScores[m] : "n/a"} fillOk=${fillOk} emergency=${emergency}`
    );
    if (m && candidates.includes(m)) {
      if (fillOk || emergency) {
        const shout = contested ? "HUNGRY (contested)" : "HUNGRY";
        console.log(`[T${gameState.turn}] DECISION: ${m} [${shout}] → food at (${food.x},${food.y})`);
        return { move: m, shout };
      } else {
        console.log(`[T${gameState.turn}] FOOD SKIPPED: fill=${fillScores[m]} ≤ myLength/2=${myLength / 2} (trap risk)`);
      }
    } else if (m && !candidates.includes(m)) {
      console.log(`[T${gameState.turn}] FOOD SKIPPED: astar move "${m}" not in candidates`);
    } else {
      console.log(`[T${gameState.turn}] FOOD SKIPPED: no path found`);
    }
  }

  // SURVIVE: score each candidate by flood fill, penalize danger and hazard
  const hazardSet = new Set(board.hazards.map(coordKey));
  let bestMove = candidates[0];
  let bestScore = -Infinity;

  for (const dir of candidates) {
    const next = applyMove(myHead, dir);
    const key = coordKey(next);
    let score = fillScores[dir];
    const rawScore = score;
    const isDanger = danger.has(key);
    const isHazard = hazardSet.has(key);

    if (isDanger) score *= 0.1;
    if (isHazard) score *= 0.5;

    console.log(
      `[T${gameState.turn}] SURVIVE score: ${dir} raw=${rawScore}` +
      `${isDanger ? " ×0.1(danger)" : ""}${isHazard ? " ×0.5(hazard)" : ""} final=${score.toFixed(2)}`
    );

    if (score > bestScore) {
      bestScore = score;
      bestMove = dir;
    }
  }

  console.log(`[T${gameState.turn}] DECISION: ${bestMove} [SURVIVE] score=${bestScore.toFixed(2)}`);
  return { move: bestMove, shout: "SURVIVE" };
}
