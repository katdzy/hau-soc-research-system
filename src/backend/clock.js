// One clock for every timestamp the prototype writes. It never hands out the
// same millisecond twice, so "submitted after the verdict", "the newest form"
// and similar checks stay correct when two writes land in the same
// millisecond (a fast double action, or the tests). Ordering between browsers
// is still the server's job in the Firebase build.

let last = 0

/** The current time as an ISO string, strictly later than the previous call. */
export function nowIso() {
  last = Math.max(Date.now(), last + 1)
  return new Date(last).toISOString()
}
