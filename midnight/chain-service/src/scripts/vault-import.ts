/**
 * Usage: npm run vault:import -- <passphrase> <infile>
 *
 * Decrypts <infile> and writes every entry into the running config's vault
 * (MIDNIGHT_PRIVATE_STATE_PATH). Existing entries with matching credentialIds
 * are overwritten. Fails loudly on a wrong passphrase (GCM auth check) rather
 * than importing garbage.
 */
import { loadConfig } from "../config.js";
import { Vault } from "../vault/store.js";
import { importVault, readBackupFile } from "../vault/backup.js";

const [passphrase, infile] = process.argv.slice(2);
if (!passphrase || !infile) {
  console.error("Usage: npm run vault:import -- <passphrase> <infile>");
  process.exit(1);
}

const config = loadConfig();
const vault = new Vault(`${config.MIDNIGHT_PRIVATE_STATE_PATH}/vault`);
try {
  const file = readBackupFile(infile);
  const count = await importVault(vault, passphrase, file);
  console.log(`Restored ${count} entries from ${infile} (backed up ${file.createdAt}).`);
} finally {
  await vault.close();
}
