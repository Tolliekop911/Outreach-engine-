// Cleaning and normalization for raw lead rows coming off a purchased list.
// Everything here is pure (no I/O) so it is easy to test.

// Map many possible column header spellings to our canonical lead fields.
// Keys are compared case-insensitively with spaces/underscores stripped.
const HEADER_ALIASES = {
  email: ['email', 'emailaddress', 'e-mail', 'mail', 'workemail'],
  phone: ['phone', 'phonenumber', 'mobile', 'cell', 'cellphone', 'telephone', 'tel'],
  firstName: ['first', 'firstname', 'fname', 'givenname'],
  lastName: ['last', 'lastname', 'lname', 'surname', 'familyname'],
  title: ['title', 'jobtitle', 'credential', 'credentials', 'role', 'position'],
  organization: ['organization', 'org', 'company', 'clinic', 'practice', 'employer', 'facility'],
  specialty: ['specialty', 'speciality', 'discipline', 'focus'],
  city: ['city', 'town'],
  state: ['state', 'province', 'region'],
  country: ['country'],
};

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]);

function canonKey(header) {
  return String(header || '').toLowerCase().replace(/[\s_.-]/g, '');
}

// Build a map from the source file's headers to our canonical field names.
// Returns { mapping: { sourceHeader -> field }, unmapped: [sourceHeader...] }.
export function buildHeaderMapping(headers) {
  const mapping = {};
  const unmapped = [];
  for (const header of headers) {
    const key = canonKey(header);
    let matched = null;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(key)) {
        matched = field;
        break;
      }
    }
    if (matched && !Object.values(mapping).includes(matched)) {
      mapping[header] = matched;
    } else {
      unmapped.push(header);
    }
  }
  return { mapping, unmapped };
}

export function cleanEmail(value) {
  if (!value) return null;
  const email = String(value).trim().toLowerCase();
  // Simple, forgiving validity check; we are filtering junk, not RFC-validating.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

// Normalize a US phone number to E.164 (+1XXXXXXXXXX). Returns null if it does
// not look like a usable US number.
export function cleanPhone(value) {
  if (!value) return null;
  let digits = String(value).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  if (digits[0] === '0' || digits[0] === '1') return null; // invalid US area code
  return `+1${digits}`;
}

function cleanName(value) {
  if (!value) return null;
  const name = String(value).trim().replace(/\s+/g, ' ');
  return name || null;
}

function cleanState(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const upper = raw.toUpperCase();
  if (US_STATES.has(upper)) return upper;
  return raw; // leave full names / unknowns as-is for later mapping
}

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

// Turn one raw row (object keyed by source headers) into a canonical lead, with
// any unmapped source columns preserved under `custom`.
export function normalizeRow(row, mapping, unmapped) {
  const lead = {
    email: null, phone: null, first_name: null, last_name: null,
    title: null, organization: null, specialty: null,
    city: null, state: null, country: 'US',
    custom: {},
  };

  for (const [sourceHeader, field] of Object.entries(mapping)) {
    const value = row[sourceHeader];
    switch (field) {
      case 'email': lead.email = cleanEmail(value); break;
      case 'phone': lead.phone = cleanPhone(value); break;
      case 'firstName': lead.first_name = cleanName(value); break;
      case 'lastName': lead.last_name = cleanName(value); break;
      case 'state': lead.state = cleanState(value); break;
      case 'country': lead.country = cleanText(value) || 'US'; break;
      default: lead[field] = cleanText(value);
    }
  }

  for (const header of unmapped) {
    const value = cleanText(row[header]);
    if (value !== null) lead.custom[header] = value;
  }

  return lead;
}

// A lead is usable only if we can reach it on some channel.
export function isReachable(lead) {
  return Boolean(lead.email || lead.phone);
}

// Stable dedupe key: prefer email, fall back to phone.
export function dedupeKey(lead) {
  return lead.email ? `e:${lead.email}` : lead.phone ? `p:${lead.phone}` : null;
}
