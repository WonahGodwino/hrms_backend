// Time slicing for long synchronous loops (PERF-003).
//
// Building a large report (PDFKit, ExcelJS) is CPU work in the same Node process that
// answers API requests. Done in one go, a 3,000-row PDF froze the process for about 4 s.
// A loop that calls `await slice()` on each row hands control back to the event loop
// whenever it has run for `budgetMs`, so other requests are served in between. The
// output is unchanged; the report takes a little longer.
//
//   const slice = timeSlicer()
//   for (const row of rows) {
//     await slice()
//     drawRow(row)
//   }

export const DEFAULT_SLICE_MS = 25

export type Slicer = () => Promise<void> | void

/** Returns a function to call once per iteration; it yields (setImmediate) when the budget is spent. */
export function timeSlicer(budgetMs: number = DEFAULT_SLICE_MS, now: () => number = Date.now): Slicer {
  let sliceStart = now()
  return () => {
    if (now() - sliceStart < budgetMs) return undefined
    return new Promise<void>((resolve) => setImmediate(() => {
      sliceStart = now()
      resolve()
    }))
  }
}
