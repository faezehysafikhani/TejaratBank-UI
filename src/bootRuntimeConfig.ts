// Imported first by main.tsx: the application modules that come after it are not evaluated
// until the deployment's settings (and their check) are in place.
import { loadRuntimeConfig } from './runtimeConfig';

await loadRuntimeConfig();
