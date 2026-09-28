// Which inspected supply items are reported for purchase.
//
// Every item below its minimum is `low`. A low item is reported for purchase
// unless someone unticked its "Report" box (result.report === false) — used
// for items that are short but only tracked for information, or that are
// refilled from stock elsewhere in the building rather than bought.
//
// `report` lives on each entry of inspections.results (JSONB), so there is no
// schema change. Untouched means reported: every record saved before the box
// existed reads exactly as it did.
//
// flag_count, the "Need restock" / "Items Low" figures, the yellow highlight
// and the "To Order" column all go through here, so an unticked item drops out
// of every one of them together.

export function needsOrder(r) {
  return !!r?.low && r.report !== false
}

// Status cell text. 'LOW' is what the report builders highlight.
export function statusText(r) {
  if (!r?.low) return 'OK'
  return r.report === false ? 'LOW · no order' : 'LOW'
}

// "To Order" cell: blank for anything not being ordered.
export function orderQty(r) {
  return needsOrder(r) ? (r.qty_needed || '') : ''
}

export function flagCount(results) {
  return (results || []).filter(needsOrder).length
}
