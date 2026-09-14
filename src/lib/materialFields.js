// Canonical option lists for material fields.
//
// Shared so the Material form and the search filters cannot drift: the search
// used to build its sieve options from whatever sizes happened to be saved
// already, which meant the list was incomplete (a size nobody had used yet was
// unselectable) and alphabetically sorted, putting #100 before #16.
//
// Order is meaningful — coarse to fine — so it must be preserved, never sorted.
export const SIEVE_SIZES = ['2"', '1.5"', '1"', '3/4"', '1/2"', '3/8"', '#4', '#8', '#16', '#30', '#50', '#100', '#200']
