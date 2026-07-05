import * as fs from 'fs';
import * as path from 'path';

/**
 * Normalizes Unicode artifacts in Markdown text to prevent encoding/rendering glitches
 * in legacy or Windows CLI environments.
 */
export function normalizeText(text: string): string {
  const replacements: { [key: string]: string } = {
    '\u2013': '-',    // en-dash
    '\u2014': '-',    // em-dash
    '\u2022': '*',    // bullet point
    '\u201c': '"',    // left double quote
    '\u201d': '"',    // right double quote
    '\u2018': "'",    // left single quote
    '\u2019': "'",    // right single quote
    '\u00bd': '1/2',  // 1/2 fraction
    '\u2153': '1/3',  // 1/3 fraction
    '\u00bc': '1/4',  // 1/4 fraction
    '\u00be': '3/4',  // 3/4 fraction
    '\uf0b7': '*',    // Wingdings bullet
    '\uf0fc': '*'     // Checkmark bullet
  };

  let normalized = text;
  for (const [char, replacement] of Object.entries(replacements)) {
    normalized = normalized.split(char).join(replacement);
  }
  return normalized;
}

function main() {
  const normalizedDir = path.join(__dirname, '..', 'data', 'normalized');
  if (!fs.existsSync(normalizedDir)) {
    console.error(`Directory not found: ${normalizedDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(normalizedDir).filter(f => f.endsWith('.md'));
  console.log(`Found ${files.length} markdown files to normalize...`);

  for (const file of files) {
    const filePath = path.join(normalizedDir, file);
    console.log(`Processing: ${file}`);
    const content = fs.readFileSync(filePath, 'utf-8');
    const cleaned = normalizeText(content);
    fs.writeFileSync(filePath, cleaned, 'utf-8');
    console.log(`  Successfully normalized ${file}`);
  }
}

if (require.main === module) {
  main();
}
