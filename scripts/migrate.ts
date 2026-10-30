import { input, rawlist } from "@inquirer/prompts";
import shell from "shelljs";

const RUN_ALL = "RUN_ALL";
const REVERT_ALL = "REVERT_ALL";
const DOWN_AND_UP = "DOWN_AND_UP";
const RUN_MIGRATIONS = "RUN_MIGRATIONS";
const SHOW_MIGRATIONS = "SHOW_MIGRATIONS";
const REVERT_MIGRATIONS = "REVERT_MIGRATIONS";
const GENERATE_MIGRATION = "GENERATE_MIGRATION";
const SEEDER_DATA_SOURCE = "SEEDER_DATA_SOURCE";
const MIGRATE_DATA_SOURCE = "MIGRATE_DATA_SOURCE";

type RunTypeormCommand = "generate" | "revert" | "run" | "show";

async function main() {
  const datasource = await rawlist({
    choices: [
      {
        name: "Migrations",
        value: MIGRATE_DATA_SOURCE,
      },
      {
        name: "Seeders",
        value: SEEDER_DATA_SOURCE,
      },
    ],
    message: "What data source do you want to use?",
  });

  const datasourcesFullPath: Record<string, string> = {
    [MIGRATE_DATA_SOURCE]: "./src/database/appDataSource.ts",
    [SEEDER_DATA_SOURCE]: "./src/database/seeders/seedersDataSource.ts",
  };

  const datasourceFullPath = datasourcesFullPath[datasource];

  const choices = [
    {
      name: "Run migrations",
      value: RUN_MIGRATIONS,
    },
    {
      name: "Run all migrations",
      value: RUN_ALL,
    },
    {
      name: "Revert all migrations",
      value: REVERT_ALL,
    },
    {
      name: "Down and up migrations",
      value: DOWN_AND_UP,
    },
    {
      name: "Revert migrations",
      value: REVERT_MIGRATIONS,
    },
    {
      name: "Show the status of migrations",
      value: SHOW_MIGRATIONS,
    },
    {
      name: "Generate migration",
      value: GENERATE_MIGRATION,
    },
  ];

  const task = await rawlist({
    choices,
    message: "Select a task to run:",
  });

  type Tasks = (() => Promise<void> | void) | undefined;

  const TASKS: Record<string, Tasks> = {
    [DOWN_AND_UP]: () => {
      shell.exec(`${runTypeorm("revert")} -d ${datasourceFullPath}`);
      shell.exec(`${runTypeorm("run")} -d ${datasourceFullPath}`);
    },
    [GENERATE_MIGRATION]: async () => {
      const filename = await input({
        default: "coreSchema",
        message: "Migration name",
      });

      const outMigration = `./src/database/migrations/${filename}`;

      shell.exec(`${runTypeorm("generate")} -p -d ${datasourceFullPath} ${outMigration}`);
    },
    [REVERT_ALL]: () => {
      shell.exec(`${runTypeorm("revert")} -d ${datasourcesFullPath[SEEDER_DATA_SOURCE]}`);
      shell.exec(`${runTypeorm("revert")} -d ${datasourcesFullPath[MIGRATE_DATA_SOURCE]}`);
    },
    [REVERT_MIGRATIONS]: () => {
      shell.exec(`${runTypeorm("revert")} -d ${datasourceFullPath}`);
    },
    [RUN_ALL]: () => {
      shell.exec(`${runTypeorm("run")} -d ${datasourcesFullPath[MIGRATE_DATA_SOURCE]}`);
      shell.exec(`${runTypeorm("run")} -d ${datasourcesFullPath[SEEDER_DATA_SOURCE]}`);
    },
    [RUN_MIGRATIONS]: () => {
      shell.exec(`${runTypeorm("run")} -d ${datasourceFullPath}`);
    },
    [SHOW_MIGRATIONS]: () => {
      shell.exec(`${runTypeorm("show")} -d ${datasourcesFullPath[SEEDER_DATA_SOURCE]}`);
      shell.exec(`${runTypeorm("show")} -d ${datasourcesFullPath[MIGRATE_DATA_SOURCE]}`);
    },
  };

  try {
    await TASKS[task]?.();
  } catch (error) {
    console.error("error in migration:", error);
  }
}

function runTypeorm(command: RunTypeormCommand) {
  return `pnpm run typeorm migration:${command}`;
}

void main();
