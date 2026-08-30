import { spawnSync } from "node:child_process";

const required = [
  "MS_STORE_IDENTITY_NAME",
  "MS_STORE_PUBLISHER",
  "MS_STORE_PUBLISHER_DISPLAY_NAME",
  "WIN_CSC_LINK",
  "WIN_CSC_KEY_PASSWORD",
];

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Variáveis obrigatórias ausentes: ${missing.join(", ")}`);
  console.error("Copie a identidade do produto do Partner Center e configure o certificado PFX de assinatura.");
  process.exit(1);
}

if (process.platform !== "win32") {
  console.error("O pacote Microsoft Store deve ser gerado em Windows (localmente ou pelo GitHub Actions).");
  process.exit(1);
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  npx,
  ["electron-builder", "--win", "appx", "--x64", "--publish", "never"],
  { stdio: "inherit", env: process.env },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
