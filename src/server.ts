import { Coord, GameState, InfoResponse, MoveResponse } from "./types";
import { getOpposite, getRelativePosition, manhattenDistance } from "./utils";

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
  const mode: "food" | "attack" | "defend" = "food";

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

  const safeMoves = Object.keys(isMoveSafe).filter((key) => isMoveSafe[key]);

  if (safeMoves.length == 0) {
    console.log(`MOVE ${gameState.turn}: No safe moves detected! Moving down`);
    return { move: "down", shout: "Take down Magnus!" };
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
  const currentHealth = gameState.you.health;
  const mappedOpponents = gameState.board.snakes
    .filter((snakes) => snakes.id !== gameState.you.id)
    .map((sn) => {
      return {
        health: sn.health,
        head: sn.head,
        id: sn.id,
        relativeToMe: getRelativePosition(gameState.you.head, sn),
        distance: manhattenDistance(myHead, sn.head),
      };
    });
  // const mostLives = mappedOpponents.toSorted((a, b) => b.health - a.health)[0];
  // const closest = mappedOpponents.toSorted(
  //   (a, b) => b.distance - a.distance
  // )[0];
  // if (closest.distance < 2) {
  //   const defend = getOpposite(closest.relativeToMe);
  //   if (defend && safeMoves.includes(defend)) {
  //     return { move: defend, shout: "DEFEND" };
  //   }
  // }

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
  return { move: nextMove, shout: "Take down Magnus!" };
}
