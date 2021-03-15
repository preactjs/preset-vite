import path from "path";

/**
 * Normalize paths to match rollup's path normalization. All path separators
 * are converted to posix and duplicate seperators are merged.
 * Example:
 *   C:\\temp\\\\foo\\bar\\..\\ -> C:/temp/foo/bar
 */
export function toRollupPath(fileName: string) {
	return path.normalize(fileName).split(path.sep).join(path.posix.sep);
}
