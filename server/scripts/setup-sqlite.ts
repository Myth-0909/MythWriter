import { ensureLocalConfig } from "./ensure-local-config";

ensureLocalConfig().catch((error) => {
  console.error(error);
  process.exit(1);
});
