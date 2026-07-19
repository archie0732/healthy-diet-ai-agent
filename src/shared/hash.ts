import * as crypto from 'crypto';
import * as fs from 'fs';

/**
 * Calculates the SHA-256 checksum of a file.
 */
export function getFileChecksum(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found for checksum: ${filePath}`);
  }
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}
