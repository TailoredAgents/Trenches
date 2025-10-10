export function deepMerge<T extends Record<string, any>, U extends Record<string, any>>(target: T, source: U): T & U {
  const output: Record<string, any> = Array.isArray(target) ? [...(target as any)] : { ...target };
  if (!source) return output as T & U;
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      output[key] = [...value];
    } else if (value && typeof value === 'object') {
      output[key] = deepMerge(
        (output[key] && typeof output[key] === 'object' ? output[key] : {}),
        value as Record<string, any>
      );
    } else {
      output[key] = value;
    }
  }
  return output as T & U;
}
