import { Battlesnake, Coord, GameState } from "./types";

export const manhattenDistance = (myHead: Coord, snakeHead: Coord) =>
  Math.abs(myHead.x - snakeHead.x) + Math.abs(myHead.y - snakeHead.y);

export function getRelativePosition(
  myHead: Coord,
  targetSnake: Battlesnake
): "up" | "down" | "left" | "right" | null {
  const targetHead = targetSnake.head;

  const dx = targetHead.x - myHead.x;
  const dy = targetHead.y - myHead.y;

  if (dx === 0 && dy === 0) {
    return null;
  }

  if (Math.abs(dy) > Math.abs(dx)) {
    return dy > 0 ? "up" : "down";
  } else {
    return dx > 0 ? "right" : "left";
  }
}

export function getOpposite(direction?: string | null) {
  switch (direction) {
    case "up":
      return "down";
    case "down":
      return "up";
    case "left":
      return "right";
    case "right":
      return "left";
    default:
      return null;
  }
}

export function coordKey(c: Coord): string {
  return `${c.x},${c.y}`;
}

export function getNeighbors(c: Coord, width: number, height: number): Coord[] {
  const neighbors: Coord[] = [];
  if (c.x > 0) neighbors.push({ x: c.x - 1, y: c.y });
  if (c.x < width - 1) neighbors.push({ x: c.x + 1, y: c.y });
  if (c.y > 0) neighbors.push({ x: c.x, y: c.y - 1 });
  if (c.y < height - 1) neighbors.push({ x: c.x, y: c.y + 1 });
  return neighbors;
}

export function applyMove(head: Coord, dir: string): Coord {
  switch (dir) {
    case "up":    return { x: head.x, y: head.y + 1 };
    case "down":  return { x: head.x, y: head.y - 1 };
    case "left":  return { x: head.x - 1, y: head.y };
    case "right": return { x: head.x + 1, y: head.y };
    default:      return head;
  }
}

export function buildBlockedSet(gameState: GameState, ignoreTails: boolean): Set<string> {
  const blocked = new Set<string>();
  const { you, board } = gameState;

  // Add hazard cells
  for (const h of board.hazards) {
    blocked.add(coordKey(h));
  }

  // Add own body (skip head — it vacates; start from body[1])
  for (let i = 1; i < you.body.length; i++) {
    if (ignoreTails && i === you.body.length - 1) {
      const tail = you.body[i];
      const beforeTail = you.body[i - 1];
      // Skip tail only if it will vacate (snake didn't just eat — segments differ)
      if (tail.x !== beforeTail.x || tail.y !== beforeTail.y) continue;
    }
    blocked.add(coordKey(you.body[i]));
  }

  // Add opponent bodies (include head — it won't vacate)
  for (const snake of board.snakes) {
    if (snake.id === you.id) continue;
    for (let i = 0; i < snake.body.length; i++) {
      if (ignoreTails && i === snake.body.length - 1) {
        const tail = snake.body[i];
        const beforeTail = snake.body[i - 1];
        if (tail.x !== beforeTail.x || tail.y !== beforeTail.y) continue;
      }
      blocked.add(coordKey(snake.body[i]));
    }
  }

  return blocked;
}

export function buildDangerSet(gameState: GameState, blocked: Set<string>): Set<string> {
  const danger = new Set<string>();
  const { you, board } = gameState;
  const myLength = you.length;

  for (const snake of board.snakes) {
    if (snake.id === you.id) continue;
    if (snake.length < myLength) continue; // Only fear equal or larger snakes

    const { width, height } = board;
    for (const neighbor of getNeighbors(snake.head, width, height)) {
      if (!blocked.has(coordKey(neighbor))) {
        danger.add(coordKey(neighbor));
      }
    }
  }

  return danger;
}

export function floodFill(
  start: Coord,
  blocked: Set<string>,
  width: number,
  height: number
): number {
  const queue: Coord[] = [start];
  const visited = new Set<string>([coordKey(start)]);
  let count = 0;

  while (queue.length > 0) {
    const cur = queue.shift()!;
    count++;
    for (const neighbor of getNeighbors(cur, width, height)) {
      const key = coordKey(neighbor);
      if (!visited.has(key) && !blocked.has(key)) {
        visited.add(key);
        queue.push(neighbor);
      }
    }
  }

  return count;
}

export function findNearestFood(
  head: Coord,
  food: Coord[],
  blocked: Set<string>,
  width: number,
  height: number
): Coord | null {
  if (food.length === 0) return null;

  const foodSet = new Set(food.map(coordKey));
  const queue: Coord[] = [head];
  const visited = new Set<string>([coordKey(head)]);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (foodSet.has(coordKey(cur))) return cur;

    for (const neighbor of getNeighbors(cur, width, height)) {
      const key = coordKey(neighbor);
      if (!visited.has(key) && !blocked.has(key)) {
        visited.add(key);
        queue.push(neighbor);
      }
    }
  }

  return null;
}

interface AStarNode {
  coord: Coord;
  g: number;
  f: number;
  firstDir: string;
}

export function aStarFirstMove(
  start: Coord,
  goal: Coord,
  blocked: Set<string>,
  width: number,
  height: number
): string | null {
  const dirs = ["up", "down", "left", "right"];
  const open: AStarNode[] = [];
  const gScore = new Map<string, number>();

  gScore.set(coordKey(start), 0);

  // Seed open list with initial moves
  for (const dir of dirs) {
    const next = applyMove(start, dir);
    if (next.x < 0 || next.x >= width || next.y < 0 || next.y >= height) continue;
    if (blocked.has(coordKey(next))) continue;
    const g = 1;
    const f = g + manhattenDistance(next, goal);
    open.push({ coord: next, g, f, firstDir: dir });
    gScore.set(coordKey(next), g);
  }

  while (open.length > 0) {
    // Find lowest f
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i;
    }
    const current = open.splice(bestIdx, 1)[0];

    if (current.coord.x === goal.x && current.coord.y === goal.y) {
      return current.firstDir;
    }

    for (const neighbor of getNeighbors(current.coord, width, height)) {
      const key = coordKey(neighbor);
      if (blocked.has(key)) continue;
      const tentativeG = current.g + 1;
      if (tentativeG < (gScore.get(key) ?? Infinity)) {
        gScore.set(key, tentativeG);
        open.push({
          coord: neighbor,
          g: tentativeG,
          f: tentativeG + manhattenDistance(neighbor, goal),
          firstDir: current.firstDir,
        });
      }
    }
  }

  return null;
}
