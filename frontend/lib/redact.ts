/**
 * Strip the obvious direct identifiers from resume text before it is sent for
 * extraction.
 *
 * This is a convenience, not a guarantee, and the UI treats it as one: the
 * redacted text is shown in an editable box so the student can see exactly
 * what will leave their browser and cut anything else themselves. A regex
 * cannot know that "I worked with my brother Tom at his firm" is identifying;
 * the person reading it can.
 *
 * The point of doing it at all: the extraction step only needs degrees,
 * institutions, years and grades. An email address in the payload buys nothing
 * and costs the student something.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Loose on purpose: international formats vary wildly, and a false positive
// here costs a phone number the model never needed anyway.
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;
const URL_WITH_HANDLE = /\b(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com)\/[^\s]+/gi;

export function redactPII(text: string): string {
  return text
    .replace(EMAIL, "[email removed]")
    .replace(URL_WITH_HANDLE, "[profile link removed]")
    .replace(PHONE, "[phone removed]");
}
