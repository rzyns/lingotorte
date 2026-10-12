import type { IncomingMessage, ServerResponse } from 'node:http';
import { canonicalAuthority, rawHeaders, freezePolicy, deny, AdmissionError } from './requestAdmission.ts';

export function publicIngress(publicOrigins: readonly string[]) {
  const policy = freezePolicy(publicOrigins, publicOrigins);
  return (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    try {
      const fields = rawHeaders(request);
      if (fields.get('host')?.length !== 1) throw new AdmissionError(400);
      if (!policy.authorities.includes(canonicalAuthority(fields.get('host')![0]!))) throw new AdmissionError(403);
      for (const name of Object.keys(request.headers)) if (name === 'forwarded' || name.startsWith('x-forwarded-')) delete request.headers[name];
      // http-proxy uses headers; scrub raw fields as well for future adapters.
      request.rawHeaders = request.rawHeaders.filter((_, index, all) => { const name = all[index - index % 2]!.toLowerCase(); return name !== 'forwarded' && !name.startsWith('x-forwarded-'); });
      next();
    } catch (error) { deny(response, error); }
  };
}
