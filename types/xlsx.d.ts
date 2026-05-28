declare module 'xlsx' {
  export interface WorkSheet {
    [cell: string]: unknown
  }

  export interface WorkBook {
    SheetNames: string[]
    Sheets: Record<string, WorkSheet>
  }

  export function read(data: ArrayBuffer | Uint8Array | string, options?: Record<string, unknown>): WorkBook

  export function writeFile(workbook: WorkBook, filename: string, options?: Record<string, unknown>): void

  export const utils: {
    sheet_to_json<T = unknown>(worksheet: WorkSheet, options?: Record<string, unknown>): T[]
    json_to_sheet<T = unknown>(data: T[], options?: Record<string, unknown>): WorkSheet
    book_new(): WorkBook
    book_append_sheet(workbook: WorkBook, worksheet: WorkSheet, sheetName?: string): void
  }
}
