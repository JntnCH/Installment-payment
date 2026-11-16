import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { request as httpsRequest } from "https";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerProviderOAuthRoutes } from "./providerOAuth";
import { registerTelegramMiniAppAuthRoutes } from "./telegramMiniAppAuth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { startMonthlyBillSyncWorker } from "../googleSheets";

const FIREBASE_AUTH_HOST = "income-expenses-by-manus.firebaseapp.com";

function proxyFirebaseAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.originalUrl.startsWith("/__/auth/")) {
    next();
    return;
  }

  const requestHeaders = { ...req.headers, host: FIREBASE_AUTH_HOST };
  delete requestHeaders.connection;

  const upstream = httpsRequest(
    {
      hostname: FIREBASE_AUTH_HOST,
      port: 443,
      method: req.method,
      path: req.originalUrl,
      headers: requestHeaders,
    },
    (upstreamResponse) => {
      const responseHeaders = { ...upstreamResponse.headers };
      delete responseHeaders.connection;
      delete responseHeaders["transfer-encoding"];

      res.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
      upstreamResponse.pipe(res);
    }
  );

  upstream.on("error", (error) => {
    console.error("Firebase Auth reverse proxy error:", error);
    if (!res.headersSent) {
      res.status(502).send("Firebase Authentication proxy is unavailable");
    } else {
      res.end();
    }
  });

  req.pipe(upstream);
}

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

  // Must run before body parsers so Firebase Auth GET/POST requests are proxied unchanged.
  app.use(proxyFirebaseAuth);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerProviderOAuthRoutes(app);
  registerTelegramMiniAppAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  await startMonthlyBillSyncWorker();
  const port = parseInt(process.env.PORT || "3000");
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
  });
}

startServer().catch(console.error);
