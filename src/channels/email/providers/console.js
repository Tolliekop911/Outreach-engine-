// Console adapter: does not send anything, just logs. Used for local testing
// and whenever EMAIL_PROVIDER=console, so the pipeline runs with no credentials.
export const consoleProvider = {
  name: 'console',
  async send({ from, fromName, to, subject }) {
    const id = `console-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[email:console] ${fromName} <${from}> -> ${to} | ${subject} | id=${id}`);
    return { providerId: id };
  },
};
