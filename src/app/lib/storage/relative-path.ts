// Path of an uploaded file relative to the project root, for storing in the
// database (shared by the payroll, staff and leave upload routes).
import path from 'path'

export function getRelativePath(absolutePath: string): string {
  const projectRoot = process.cwd()
  if (absolutePath.startsWith(projectRoot)) {
    return path.relative(projectRoot, absolutePath)
  }
  return absolutePath
}
