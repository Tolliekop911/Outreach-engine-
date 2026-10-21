// Email provider adapters. Each adapter exposes:
//   async send({ from, fromName, to, subject, html }) -> { providerId }
// Add a new provider by creating a module here and registering it below.
import config from '../../../config/index.js';
import { consoleProvider } from './console.js';
import { sendgridProvider } from './sendgrid.js';

const PROVIDERS = {
  console: consoleProvider,
  sendgrid: sendgridProvider,
};

export function getEmailProvider() {
  const name = config.email.provider || 'console';
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Unknown EMAIL_PROVIDER "${name}" (have: ${Object.keys(PROVIDERS).join(', ')})`);
  }
  return provider;
}
