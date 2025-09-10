import { Coord, GameState, InfoResponse, MoveResponse } from "./types";

export function info(): InfoResponse {
  console.log("INFO");
  return {
    apiversion: "1",
    author: "Bubblun",
    color: "#5AC252",
    head: "default",
    tail: "default",
  };
}

export function start(gameState: GameState): void {
  console.log(`${gameState.game.id} START`);
}

export function end(gameState: GameState): void {
  console.log(`${gameState.game.id} END\n`);
}

export function move(gameState: GameState): MoveResponse {
  let isMoveSafe: { [key: string]: boolean } = {
    up: true,
    down: true,
    left: true,
    right: true,
  };

  // Step 0: Don't move backwards
  const myHead = gameState.you.head;
  const myNeck = gameState.you.body[1];

  if (myNeck.x < myHead.x) {
    isMoveSafe.left = false;
  } else if (myNeck.x > myHead.x) {
    isMoveSafe.right = false;
  } else if (myNeck.y < myHead.y) {
    isMoveSafe.down = false;
  } else if (myNeck.y > myHead.y) {
    isMoveSafe.up = false;
  }

  // Step 1: Prevent moving out of bounds
  const boardWidth = gameState.board.width;
  const boardHeight = gameState.board.height;

  if (myHead.x === 0) {
    isMoveSafe.left = false;
  }
  if (myHead.x === boardWidth - 1) {
    isMoveSafe.right = false;
  }
  if (myHead.y === 0) {
    isMoveSafe.down = false;
  }
  if (myHead.y === boardHeight - 1) {
    isMoveSafe.up = false;
  }

  // Step 2: Prevent colliding with yourself
  const myBody = gameState.you.body;
  myBody.forEach((segment) => {
    if (myHead.x === segment.x - 1 && myHead.y === segment.y) {
      isMoveSafe.right = false; // My body is to the right
    }
    if (myHead.x === segment.x + 1 && myHead.y === segment.y) {
      isMoveSafe.left = false; // My body is to the left
    }
    if (myHead.y === segment.y - 1 && myHead.x === segment.x) {
      isMoveSafe.up = false; // My body is above
    }
    if (myHead.y === segment.y + 1 && myHead.x === segment.x) {
      isMoveSafe.down = false; // My body is below
    }
  });

  // TODO: Step 3 - Prevent your Battlesnake from colliding with other Battlesnakes
  // This would be a great next step! You can loop over `gameState.board.snakes`
  // and apply the same logic as Step 2 for each opponent snake's body.

  // Get all safe moves
  const safeMoves = Object.keys(isMoveSafe).filter((key) => isMoveSafe[key]);

  if (safeMoves.length == 0) {
    console.log(`MOVE ${gameState.turn}: No safe moves detected! Moving down`);
    return { move: "down" };
  }

  // Step 4: Move towards the closest food
  const food = gameState.board.food;
  let closestFood: Coord | undefined;
  let minDistance = Infinity;

  food.forEach((f) => {
    const distance = Math.abs(myHead.x - f.x) + Math.abs(myHead.y - f.y);
    if (distance < minDistance) {
      minDistance = distance;
      closestFood = f;
    }
  });

  let nextMove = safeMoves[Math.floor(Math.random() * safeMoves.length)];

  if (closestFood !== undefined) {
    const preferredMoves: string[] = [];
    if (myHead.x < closestFood.x) {
      preferredMoves.push("right");
    } else if (myHead.x > closestFood.x) {
      preferredMoves.push("left");
    }
    if (myHead.y < closestFood.y) {
      preferredMoves.push("up");
    } else if (myHead.y > closestFood.y) {
      preferredMoves.push("down");
    }

    // Choose a preferred move if it's safe
    const safePreferredMoves = preferredMoves.filter((move) =>
      safeMoves.includes(move)
    );
    if (safePreferredMoves.length > 0) {
      nextMove =
        safePreferredMoves[
          Math.floor(Math.random() * safePreferredMoves.length)
        ];
    }
  }

  console.log(`MOVE ${gameState.turn}: ${nextMove}`);
  return { move: nextMove };
}
