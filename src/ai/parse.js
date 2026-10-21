// Small helpers for reading Claude responses. Pure, no I/O.

// Concatenate the text blocks of a Messages API response.
export function firstText(response) {
  if (!response?.content) return '';
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

// Parse a JSON object from a model response, tolerating stray prose or code
// fences around it. Returns the object, or null if none can be parsed.
export function parseJsonObject(text) {
  if (!text) return null;
  let s = text.trim();
  // Strip ```json ... ``` fences if present.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // Fall back to the outermost braces.
  if (s[0] !== '{') {
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    s = s.slice(start, end + 1);
  }
  try {
    const obj = JSON.parse(s);
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}
