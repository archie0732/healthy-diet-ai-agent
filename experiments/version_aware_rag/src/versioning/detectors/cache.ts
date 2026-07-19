import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

export class ResponseCache {
  private cachePath: string;
  private cacheData: Record<string, any> = {};

  constructor() {
    const rootDir = process.cwd();
    const cacheDir = path.resolve(rootDir, 'experiments/version_aware_rag/data/.cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    this.cachePath = path.join(cacheDir, 'relation_cache.json');
    if (fs.existsSync(this.cachePath)) {
      try {
        this.cacheData = JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
      } catch (e) {
        this.cacheData = {};
      }
    }
  }

  public getHashKey(model: string, prompt: string, oldText: string, newText: string): string {
    const combined = `${model}_${prompt}_${oldText}_${newText}`;
    return createHash('sha256').update(combined).digest('hex');
  }

  public get(key: string): any | null {
    return this.cacheData[key] || null;
  }

  public set(key: string, value: any) {
    this.cacheData[key] = value;
    try {
      fs.writeFileSync(this.cachePath, JSON.stringify(this.cacheData, null, 2), 'utf8');
    } catch (e) {
      console.warn(`Failed to write relation cache: ${e}`);
    }
  }
}
