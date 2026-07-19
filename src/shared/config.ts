import * as fs from 'fs';
import * as yaml from 'yaml';
import { ExperimentConfigSchema, ExperimentConfig } from '../../experiments/version_aware_rag/configs/v3/experiment.schema';
import { getFileChecksum } from './hash';

/**
 * Loads a YAML configuration file and validates it against the Zod schema.
 */
export function loadExperimentConfig(configPath: string): ExperimentConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found at path: ${configPath}`);
  }
  const fileContent = fs.readFileSync(configPath, 'utf8');
  const parsedYaml = yaml.parse(fileContent);
  const result = ExperimentConfigSchema.safeParse(parsedYaml);
  if (!result.success) {
    throw new Error(`Config validation failed:\n${result.error.issues.map(e => `- ${e.path.join('.')}: ${e.message}`).join('\n')}`);
  }
  
  const config = result.data;
  if (config.corpus.checksum) {
    const actualChecksum = getFileChecksum(config.corpus.path);
    if (actualChecksum !== config.corpus.checksum) {
      throw new Error(`Config validation failed:\n- corpus.checksum: Corpus checksum mismatch. Expected: ${config.corpus.checksum}, Got: ${actualChecksum}`);
    }
  }
  
  return config;
}
