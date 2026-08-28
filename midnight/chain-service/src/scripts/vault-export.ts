/**
 * Usage: npm run vault:export -- <passphrase> <outfile>
 *
 * Encrypts and writes every entry currently in the running config's vault
 * (MIDNIGHT_PRIVATE_STATE_PATH) to <outfile>. Safe to run while the live
 * chain-service is stopped; do NOT run concurrently with a running instance —
 * LevelDB allows only one open handle per path at a time.
 */
import { loadConfig } from "../config.js";
import { Vault } from "../vault/store.js";
import { exportVault, writeBackupFile } from "../vault/backup.js";

const [passphrase, outfile] = process.argv.slice(2);
if (!passphrase || !outfile) {
  console.error("Usage: npm run vault:export -- <passphrase> <outfile>");
  process.exit(1);
}

const config = loadConfig();
const vault = new Vault(`${config.MIDNIGHT_PRIVATE_STATE_PATH}/vault`);
try {
  const file = await exportVault(vault, passphrase);
  writeBackupFile(outfile, file);
  console.log(`Exported ${file.entryCount} entries to ${outfile} (encrypted, mode 0600).`);
} finally {
  await vault.close();
}
