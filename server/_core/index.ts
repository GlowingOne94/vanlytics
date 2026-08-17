import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerAuthRoutes } from "../auth";
import { registerStripeWebhook } from "./stripeWebhook";
import { registerMobileApi } from "../mobileApi";
import { syncAllOrganizations } from "../violationsSync";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Stripe's webhook needs the raw, unparsed body to verify its signature —
  // must be registered before the global JSON parser below.
  registerStripeWebhook(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerAuthRoutes(app);
  registerMobileApi(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // Daily NYC violations sync — a short delay after startup lets the DB
  // connection settle first, then repeats every 24 hours. A single
  // long-running Node process with setInterval is enough here; if this
  // ever needs to run across multiple server instances, it should move to
  // a proper scheduled job instead so it doesn't run once per instance.
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  setTimeout(() => {
    syncAllOrganizations().catch(err => console.error("[violations sync] Initial run failed:", err));
    setInterval(() => {
      syncAllOrganizations().catch(err => console.error("[violations sync] Scheduled run failed:", err));
    }, ONE_DAY_MS);
  }, 30_000);
}

startServer().catch(console.error);
