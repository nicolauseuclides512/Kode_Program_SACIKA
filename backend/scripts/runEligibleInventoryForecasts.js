require("dotenv").config({ path: `${__dirname}/../.env` });

const database = require("../config/database");
const { runInventoryForecastBatch } = require("../services/inventoryForecastService");

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--horizon") {
      options.horizon = argv[index + 1];
      index += 1;
    } else if (arg === "--concurrency") {
      options.concurrency = argv[index + 1];
      index += 1;
    } else if (arg === "--product-ids") {
      options.productIds = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

async function main() {
  try {
    const result = await runInventoryForecastBatch(
      database,
      parseArgs(process.argv.slice(2)),
    );
    console.log(JSON.stringify(result, null, 2));
    if (result.failed_count > 0) process.exitCode = 2;
  } catch (error) {
    console.error(error.message);
    if (error.details) console.error(JSON.stringify(error.details, null, 2));
    process.exitCode = 1;
  } finally {
    await database.end();
  }
}

main();
