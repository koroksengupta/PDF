/**
 * Feature switches for tools still being worked on. A switched-off tool is hidden from
 * the home screen and its #link is ignored; its code stays in the repo so it can be
 * developed and tested on its own branch, then switched on with a one-line change.
 */
export const FEATURES = {
  /** Fill form: in progress on the `claude/fill-form` branch. */
  fillForm: false,
} as const
