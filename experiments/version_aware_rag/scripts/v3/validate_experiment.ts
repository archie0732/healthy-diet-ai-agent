import { loadExperimentConfig } from '../../../../src/shared/config';

function main() {
  const args = process.argv.slice(2);
  let configPath = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && i + 1 < args.length) {
      configPath = args[i + 1];
      i++;
    }
  }

  if (!configPath) {
    console.error('Error: Please provide a configuration file via --config <yaml_path>');
    process.exit(1);
  }

  try {
    const config = loadExperimentConfig(configPath);
    console.log(`Config is valid! Checked file: ${configPath}`);
    console.log(`Experiment ID: ${config.experiment.id}`);
    process.exit(0);
  } catch (error: any) {
    console.error(`Validation failed:\n${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
