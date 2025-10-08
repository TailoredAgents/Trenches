type ServicePorts = Partial<Record<string, { port?: number } | undefined>> | undefined;
type EndpointOverrides = Partial<Record<string, { baseUrl?: string }>> | undefined;

const LOCALHOST = 'http://127.0.0.1';

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

export function getServiceBaseUrl(
  services: ServicePorts,
  endpoints: EndpointOverrides,
  key: string
): string {
  const endpoint = endpoints?.[key];
  if (endpoint?.baseUrl) {
    return normalizeBaseUrl(endpoint.baseUrl);
  }
  const service = services?.[key];
  if (service?.port) {
    return `${LOCALHOST}:${service.port}`;
  }
  return LOCALHOST;
}

export function buildServiceUrl(baseUrl: string, path: string): string {
  if (!path) {
    return baseUrl;
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path, normalizedBase).toString();
}

export function resolveServiceUrl(
  services: ServicePorts,
  endpoints: EndpointOverrides,
  key: string,
  path?: string
): string {
  const base = getServiceBaseUrl(services, endpoints, key);
  return path ? buildServiceUrl(base, path) : base;
}
