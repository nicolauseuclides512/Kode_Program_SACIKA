const { spawn } = require("node:child_process");
const { once } = require("node:events");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");

const {
  callForecastWorker,
  validateWorkerResponse,
} = require("../../services/inventoryForecastService");

const workerRoot = path.resolve(__dirname, "../../../sacika-worker");
const workerApiKey = "integration_worker_secret_at_least_32_characters";

async function findFreePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  server.close();
  await once(server, "close");
  return port;
}

async function waitForWorker(baseUrl, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        const body = await response.json();
        if (body.status === "healthy" && body.security === "configured") return body;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Worker tidak siap: ${lastError?.message || "timeout"}`);
}

function stopProcess(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  setTimeout(() => {
    if (!child.killed) child.kill("SIGKILL");
  }, 2000).unref();
}

test("backend berkomunikasi dengan worker Flask menggunakan kontrak prediksi nyata", {
  timeout: 90000,
}, async (context) => {
  const pythonBinary = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
  const port = await findFreePort();
  const workerUrl = `http://127.0.0.1:${port}`;
  const child = spawn(pythonBinary, ["app.py"], {
    cwd: workerRoot,
    env: {
      ...process.env,
      PORT: String(port),
      FORECAST_WORKER_API_KEY: workerApiKey,
      FORECAST_MIN_OBSERVATIONS: "18",
      FORECAST_MAX_HORIZON: "3",
      PYTHONUNBUFFERED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  context.after(() => stopProcess(child));

  child.once("error", (error) => {
    stderr += `\n${error.message}`;
  });

  try {
    await waitForWorker(workerUrl);

    const periods = Array.from({ length: 24 }, (_, index) => {
      const date = new Date(Date.UTC(2024, index, 1));
      return date.toISOString().slice(0, 7);
    });
    const values = [
      100, 98, 96, 97, 94, 92, 91, 89, 88, 86, 85, 83,
      82, 80, 79, 77, 76, 74, 73, 71, 70, 68, 67, 65,
    ];

    const response = await callForecastWorker({
      product_id: 99,
      target: "ending_inventory",
      frequency: "monthly",
      periods,
      values,
      horizon: 1,
    }, {
      workerUrl,
      workerApiKey,
      timeoutMs: 60000,
    });

    const validated = validateWorkerResponse(response, 99);
    assert.equal(validated.product_id, 99);
    assert.equal(validated.target, "ending_inventory");
    assert.equal(validated.frequency, "monthly");
    assert.equal(validated.forecast_periods.length, 1);
    assert.equal(validated.forecast_values.length, 1);
    assert.equal(Number.isFinite(validated.forecast_values[0]), true);
    assert.equal(validated.forecast_values[0] >= 0, true);
    assert.equal(Array.isArray(validated.candidate_models), true);
    assert.equal(Array.isArray(validated.backtest), true);
    assert.ok(validated.evaluation);
    assert.ok(validated.model_used);
  } catch (error) {
    error.message += `\nWorker stderr:\n${stderr}`;
    throw error;
  }
});
