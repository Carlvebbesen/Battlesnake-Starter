import { Hono } from "hono";
import { end, info, move, start } from "./server";

const app = new Hono();

app.get("/", (c) => {
  return c.json(info());
});

app.post("/start", async (c) => {
  const gameState = await c.req.json();
  start(gameState);
  return c.text("ok");
});

app.post("/move", async (c) => {
  const gameState = await c.req.json();
  return c.json(move(gameState));
});

app.post("/end", async (c) => {
  const gameState = await c.req.json();
  end(gameState);
  return c.text("ok");
});

export default app;
