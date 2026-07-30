import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { env, pipeline } from "@huggingface/transformers";

const ROOT = process.cwd();
const MODEL_ROOT = path.join(
  ROOT,
  "experiments/version_aware_rag/data/models/v5_r2_19_minilm",
);
const CACHE = path.join(MODEL_ROOT, "cache");
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const REVISION = "751bff37182d3f1213fa05d7196b954e230abad9";
const PACKAGE_PATH = path.join(
  ROOT,
  "node_modules/@huggingface/transformers/package.json",
);
const NATIVE_RUNTIME_DIR = path.join(
  ROOT,
  "node_modules/onnxruntime-node/bin/napi-v6/win32/x64",
);
const NATIVE_RUNTIME_FILES = [
  path.join(NATIVE_RUNTIME_DIR, "onnxruntime.dll"),
  path.join(NATIVE_RUNTIME_DIR, "onnxruntime_binding.node"),
];
const sha256 = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");
const listFiles = async (directory: string): Promise<string[]> => {
  const output: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await listFiles(absolute)));
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
};

await mkdir(CACHE, { recursive: true });
const packageText = await readFile(PACKAGE_PATH, "utf8");
const packageJson = JSON.parse(packageText);
if (packageJson.version !== "4.2.0") {
  throw new Error(`Unexpected Transformers.js version ${packageJson.version}.`);
}
env.cacheDir = CACHE;
env.allowRemoteModels = true;
env.allowLocalModels = false;
env.useFSCache = true;
env.useBrowserCache = false;

const extractor = await pipeline("feature-extraction", MODEL_ID, {
  revision: REVISION,
  dtype: "q8",
  device: "cpu",
});
const testInputs = [
  "potassium excretion can be impaired in kidney disease",
  "short-term trials and long-term observational evidence differ",
];
const output = await extractor(testInputs, {
  pooling: "mean",
  normalize: true,
});
const vectors = output.tolist() as number[][];
if (
  vectors.length !== testInputs.length ||
  vectors.some(
    (vector) =>
      vector.length !== 384 ||
      vector.some((value) => !Number.isFinite(value)) ||
      Math.abs(
        Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) - 1,
      ) > 1e-5,
  )
) {
  throw new Error("MiniLM smoke-test vector contract failed.");
}
await extractor.dispose();

const cacheFiles = (await listFiles(CACHE)).sort();
if (!cacheFiles.some((file) => /model_quantized\.onnx$/.test(file))) {
  throw new Error("Expected q8 ONNX weight was not cached.");
}
const artifacts = await Promise.all(
  cacheFiles.map(async (file) => ({
    path: path.relative(MODEL_ROOT, file).replaceAll("\\", "/"),
    byte_length: (await stat(file)).size,
    sha256: sha256(await readFile(file)),
  })),
);
const manifest = {
  schema_version: "v5-r2.19-minilm-model-manifest-1",
  status: "model_cached_and_smoke_tested",
  model_id: MODEL_ID,
  revision: REVISION,
  task: "feature-extraction",
  dtype: "q8",
  pooling: "mean",
  normalization: "l2",
  dimensions: 384,
  device: "native_windows_x64_cpu",
  blocked_postinstall_scripts_executed: false,
  remote_loading_allowed_during_diagnostic: false,
  package: {
    name: packageJson.name,
    version: packageJson.version,
    package_json_sha256: sha256(packageText),
    bun_lock_sha256: sha256(await readFile(path.join(ROOT, "bun.lock"))),
  },
  native_runtime: await Promise.all(
    NATIVE_RUNTIME_FILES.map(async (file) => ({
      path: path.relative(ROOT, file).replaceAll("\\", "/"),
      sha256: sha256(await readFile(file)),
    })),
  ),
  cache_artifacts: artifacts,
  smoke_test: {
    inputs: testInputs,
    vector_sha256: sha256(JSON.stringify(vectors)),
    finite_normalized_384d: true,
  },
};
await writeFile(
  path.join(MODEL_ROOT, "MODEL_MANIFEST.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify({
  status: manifest.status,
  cache_artifact_count: artifacts.length,
  model_weight: artifacts.find((artifact) =>
    artifact.path.endsWith("model_quantized.onnx")),
  smoke_test_vector_sha256: manifest.smoke_test.vector_sha256,
}, null, 2));
