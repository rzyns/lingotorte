import { nativeExecutable } from '../../domain/src/nativePathsNode.ts';

/** Operator/service selection only; never pass browser payload fields here.
 * No probing, installation or fallback: a missing Python affects Python work only.
 * The platform seam selects the default; explicit paths use the host native guard.
 */
export function selectPythonExecutable(
  injected: string | undefined = undefined,
  env: Readonly<NodeJS.ProcessEnv> = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const selected = injected ?? env.LINGOTORTE_PYTHON_PATH ?? (platform === 'win32' ? 'python' : 'python3');
  try { return nativeExecutable(selected); }
  catch { throw new TypeError('Python executable configuration must be one executable name or fully qualified native path (LINGOTORTE_PYTHON_PATH).'); }
}

export const PYTHON_UNAVAILABLE_MESSAGE = 'Python executable is unavailable. Configure LINGOTORTE_PYTHON_PATH with one installed executable.';
