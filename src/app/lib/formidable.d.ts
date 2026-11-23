declare module 'formidable' {
  import { IncomingMessage } from 'http'

  export type Fields = Record<string, unknown>
  export type Files = Record<string, formidable.File[] | formidable.File>

  export interface File {
    filepath: string
    newFilename: string
    originalFilename: string
    mimetype: string
    size: number
  }

  export default class Formidable {
    parse(req: IncomingMessage, callback: (err: unknown, fields: Fields, files: Files) => void): void
  }
}
