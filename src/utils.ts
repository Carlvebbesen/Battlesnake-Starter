import { Battlesnake, Coord } from "./types";

export const manhattenDistance = (myHead: Coord, snakeHead: Coord) =>
  Math.abs(myHead.x - snakeHead.x) + Math.abs(myHead.y - snakeHead.y);

export function getRelativePosition(
  myHead: Coord,
  targetSnake: Battlesnake
): "up" | "down" | "left" | "right" | null {
  const targetHead = targetSnake.head;

  // Calculate the horizontal and vertical distance to the target's head
  const dx = targetHead.x - myHead.x;
  const dy = targetHead.y - myHead.y;

  // If the snake isn't at your exact location
  if (dx === 0 && dy === 0) {
    return null; // Or "same position"
  }

  // Check if vertical distance is greater than horizontal distance
  if (Math.abs(dy) > Math.abs(dx)) {
    return dy > 0 ? "up" : "down";
  } else {
    // Horizontal distance is greater or they are equal
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
      // Return null or the original direction if it's not a valid move
      return null;
  }
}
