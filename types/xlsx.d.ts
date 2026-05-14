declare module 'xlsx' {
  export interface WorkSheet {}

  export interface WorkBook {
    SheetNames: string[]
    Sheets: Record<string, WorkSheet>
  }

  export function read(data: ArrayBuffer | Uint8Array | string, options?: Record<string, unknown>): WorkBook

  export const utils: {
    sheet_to_json<T = unknown>(worksheet: WorkSheet, options?: Record<string, unknown>): T[]
  }
}
