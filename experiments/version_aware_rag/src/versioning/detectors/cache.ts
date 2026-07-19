import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

export class ResponseCache {
  private cachePath: string;
  private cacheData: Record<string, any> = {};

  constructor(customPath?: string) {
    const rootDir = process.cwd();
    const cacheDir = path.resolve(rootDir, 'experiments/version_aware_rag/data/.cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    this.cachePath = customPath || path.join(cacheDir, 'relation_cache.json');
    if (fs.existsSync(this.cachePath)) {
      try {
        this.cacheData = JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
      } catch (e) {
        this.cacheData = {};
      }
    }
  }

  public getHashKey(model: string, prompt: string, oldText: string, newText: string): string {
    const promptHash = createHash('sha256').update(prompt).digest('hex');
    const oldTextHash = createHash('sha256').update(oldText).digest('hex');
    const newTextHash = createHash('sha256').update(newText).digest('hex');
    const combined = `${model}:${promptHash}:${oldTextHash}:${newTextHash}`;
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

  public clear() {
    this.cacheData = {};
    if (fs.existsSync(this.cachePath)) {
      try {
        fs.unlinkSync(this.cachePath);
      } catch (e) {
        // ignore unlink error if file is missing
      }
    }
  }
}

