import { GameState, InfoResponse, MoveResponse } from "./types";
import {
  applyMove,
  aStarFirstMove,
  buildBlockedSet,
  buildDangerSet,
  buildOpponentZone,
  centerScore,
  coordKey,
  floodFill,
  isCornerCell,
  isEdgeCell,
  manhattenDistance,
} from "./utils";

export function info(): InfoResponse {
  console.log("INFO");
  return {
    apiversion: "1",
    author: "Bubblun",
    color: "#00008B",
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
    if (next.x < 0 || next.x >= width || next.y < 0 || next.y >= height) return false;
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

  // === KILL MODE ===
  // When we are strictly longer than an opponent by more than 1, actively try to
  // cut them off by targeting a cell adjacent to their head.
  const emergency = myHealth < 30;
  for (const opp of opponents) {
    if (opp.length >= myLength) continue; // Only hunt smaller snakes
    const dist = manhattenDistance(myHead, opp.head);
    if (dist > 4) continue; // Too far away to act on

    // Find which candidate moves put us adjacent to the opponent's head
    let bestKillMove: string | null = null;
    let bestKillFill = -1;
    for (const dir of candidates) {
      const next = applyMove(myHead, dir);
      if (
        manhattenDistance(next, opp.head) === 1 &&
        fillScores[dir] >= myLength * 2 &&
        !isCornerCell(next, width, height) &&
        !isEdgeCell(next, width, height)
      ) {
        if (fillScores[dir] > bestKillFill) {
          bestKillFill = fillScores[dir];
          bestKillMove = dir;
        }
      }
    }
    if (bestKillMove) {
      console.log(
        `[T${gameState.turn}] DECISION: ${bestKillMove} [KILL] → targeting ${opp.name} ` +
        `(len=${opp.length}, dist=${dist})`
      );
      return { move: bestKillMove, shout: "COME HERE" };
    }
  }

  // === STOP-GROWING MODE ===
  // If we are much longer than all opponents and healthy, skip food entirely.
  // Being longer than the opponent by 4+ is sufficient — no need to keep eating
  // and risk self-trapping by growing too large.
  const maxOppLength = opponents.length > 0
    ? Math.max(...opponents.map((o) => o.length))
    : 0;
  const lengthAdvantage = myLength - maxOppLength;
  const overgrown = opponents.length > 0 && myLength > 14 && lengthAdvantage > 4 && myHealth > 40;
  if (overgrown) {
    console.log(
      `[T${gameState.turn}] STOP-GROWING: len=${myLength} advantage=${lengthAdvantage} hp=${myHealth} — skipping food`
    );
  }

  // Build A* cost map: wall cells cost 2, opponent-zone cells cost 3 (not fully blocked)
  const opponentZone = buildOpponentZone(gameState, blocked);
  const aStarCostMap = new Map<string, number>();
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const c = { x, y };
      const key = coordKey(c);
      const isWall = isEdgeCell(c, width, height);
      const inZone = opponentZone.has(key);
      if (isWall && inZone) aStarCostMap.set(key, 5);
      else if (inZone) aStarCostMap.set(key, 3);
      else if (isWall) aStarCostMap.set(key, 2);
    }
  }

  // === FOOD RANKING ===
  // Use numeric advantage (minOppDist - myDist): positive = we arrive first
  const rankedFood = board.food
    .map((f) => {
      const myDist = manhattenDistance(myHead, f);
      const minOppDist = opponents.length > 0
        ? Math.min(...opponents.map((o) => manhattenDistance(o.head, f)))
        : Infinity;
      const advantage = minOppDist === Infinity ? 999 : minOppDist - myDist;
      return { food: f, myDist, advantage };
    })
    .sort((a, b) => {
      // Higher advantage first; break ties by distance
      if (b.advantage !== a.advantage) return b.advantage - a.advantage;
      return a.myDist - b.myDist;
    });

  if (rankedFood.length > 0) {
    const foodLog = rankedFood.map(({ food, myDist, advantage }) =>
      `(${food.x},${food.y}) myDist=${myDist} adv=${advantage > 100 ? "∞" : advantage}`
    );
    console.log(`[T${gameState.turn}] FOOD RANKED: ${foodLog.join(" | ")}`);
  }

  // FOOD mode
  if (!overgrown) {
    for (const { food, myDist, advantage } of rankedFood) {
      const contested = advantage <= 0;

      // Skip clearly contested food (opponent arrives 2+ steps earlier) unless emergency
      if (advantage <= -2 && !emergency) {
        console.log(`[T${gameState.turn}] FOOD SKIPPED: (${food.x},${food.y}) adv=${advantage} too contested`);
        continue;
      }

      // Only 1 food left and a same-size-or-larger opponent is closer — not worth the risk
      if (contested && board.food.length === 1 && !emergency) {
        const threateningOpp = opponents.find(
          (o) => manhattenDistance(o.head, food) <= myDist && o.length >= myLength
        );
        if (threateningOpp) {
          console.log(
            `[T${gameState.turn}] FOOD SKIPPED: only food, contested by ${threateningOpp.name} ` +
            `(len=${threateningOpp.length} ≥ ours=${myLength}), not worth the risk`
          );
          continue;
        }
      }

      // Corner food is very dangerous for long snakes — body walls off the escape routes
      if (!emergency && myLength > 10 && isCornerCell(food, width, height)) {
        console.log(`[T${gameState.turn}] FOOD SKIPPED: (${food.x},${food.y}) corner food, len=${myLength} too risky`);
        continue;
      }

      // Edge food is dangerous for longer snakes unless health is low
      if (!emergency && myLength > 12 && myHealth > 40 && isEdgeCell(food, width, height)) {
        console.log(`[T${gameState.turn}] FOOD SKIPPED: (${food.x},${food.y}) edge food, len=${myLength} hp=${myHealth} too risky`);
        continue;
      }

      const m = aStarFirstMove(myHead, food, blocked, width, height, aStarCostMap);

      // Eat-to-freedom check: simulate board state AFTER eating (tail stays since we just ate)
      // and verify the fill from the food position is still safe.
      let fillAfterEat = 0;
      if (m) {
        const afterEatBlocked = buildBlockedSet(gameState, false); // ignoreTails=false: tail stays
        afterEatBlocked.delete(coordKey(food)); // food cell becomes our new head — not blocked
        fillAfterEat = floodFill(food, afterEatBlocked, width, height);
      }
      const fillThreshold = Math.max(myLength + 5, myLength * 0.8);
      const fillOk = m ? fillScores[m] > Math.max(myLength + 4, myLength * 0.75) : false;
      const eatFreedomOk = m ? fillAfterEat > fillThreshold : false;

      console.log(
        `[T${gameState.turn}] FOOD (${food.x},${food.y}) myDist=${myDist} adv=${advantage} ` +
        `astar=${m ?? "none"} fill=${m ? fillScores[m] : "n/a"} fillOk=${fillOk} ` +
        `fillAfterEat=${fillAfterEat} eatFreedomOk=${eatFreedomOk} emergency=${emergency}`
      );

      if (!m || !candidates.includes(m)) {
        console.log(`[T${gameState.turn}] FOOD SKIPPED: no safe path`);
        continue;
      }

      if (!fillOk && !emergency) {
        console.log(`[T${gameState.turn}] FOOD SKIPPED: fill=${fillScores[m]} below threshold=${Math.max(myLength + 4, myLength * 0.75).toFixed(1)} (trap risk)`);
        continue;
      }

      if (!eatFreedomOk && !emergency) {
        console.log(`[T${gameState.turn}] FOOD SKIPPED: fillAfterEat=${fillAfterEat} below threshold=${fillThreshold.toFixed(1)} (eat-to-freedom trap)`);
        continue;
      }

      // For tie food (advantage == 0), require extra fill buffer unless emergency
      if (advantage === 0 && !emergency && fillScores[m] < myLength * 1.5) {
        console.log(`[T${gameState.turn}] FOOD SKIPPED: tied food but fill=${fillScores[m]} < myLength*1.5=${myLength * 1.5} (collision risk)`);
        continue;
      }

      const shout = contested ? "HUNGRY (contested)" : "HUNGRY";
      console.log(`[T${gameState.turn}] DECISION: ${m} [${shout}] → food at (${food.x},${food.y})`);
      return { move: m, shout };
    }
  }

  // === SURVIVE: flood fill + danger/hazard penalty + center preference ===
  const hazardSet = new Set(board.hazards.map(coordKey));
  const foodSet = new Set(board.food.map(coordKey));
  const CENTER_WEIGHT = 5;
  let bestMove = candidates[0];
  let bestScore = -Infinity;

  for (const dir of candidates) {
    const next = applyMove(myHead, dir);
    const key = coordKey(next);
    let score = fillScores[dir];
    const rawScore = score;
    const isDanger = danger.has(key);
    const isHazard = hazardSet.has(key);
    const isFood = foodSet.has(key);

    if (isDanger) score *= 0.1;
    if (isHazard) score *= 0.5;

    // Penalize food cells that are dangerous for long snakes (mirrors food-mode skips)
    if (isFood && !emergency) {
      if (myLength > 10 && isCornerCell(next, width, height)) {
        score = -Infinity; // never accidentally eat corner food when long
      } else if (myLength > 12 && myHealth > 40 && isEdgeCell(next, width, height)) {
        score *= 0.05; // heavily penalize edge food
      }
    }

    // Add center bonus to prefer open board positions over walls/corners
    const cScore = centerScore(next, width, height) * CENTER_WEIGHT;
    score += cScore;

    console.log(
      `[T${gameState.turn}] SURVIVE score: ${dir} raw=${rawScore}` +
      `${isDanger ? " ×0.1(danger)" : ""}${isHazard ? " ×0.5(hazard)" : ""}` +
      `${isFood ? " FOOD" : ""}` +
      ` +center=${cScore.toFixed(2)} final=${score === -Infinity ? "-Inf" : score.toFixed(2)}`
    );

    if (score > bestScore) {
      bestScore = score;
      bestMove = dir;
    }
  }

  console.log(`[T${gameState.turn}] DECISION: ${bestMove} [SURVIVE] score=${bestScore.toFixed(2)}`);
  return { move: bestMove, shout: "SURVIVE" };
}
