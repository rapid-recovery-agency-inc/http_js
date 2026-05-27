export type BooleanString = 'true' | 'false';

export interface ProtocolDefinition {
  readonly attributes?: readonly string[];
  readonly methods?: readonly string[];
  readonly name: string;
}

export function createProtocolDefinition(
  definition: ProtocolDefinition,
): ProtocolDefinition {
  return {
    attributes: definition.attributes ?? [],
    methods: definition.methods ?? [],
    name: definition.name,
  };
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function protocolConformanceErrors(
  value: unknown,
  protocol: ProtocolDefinition,
): string[] {
  const errors: string[] = [];

  for (const attribute of protocol.attributes ?? []) {
    if (!isObjectLike(value) || !(attribute in value)) {
      errors.push(`missing attribute '${attribute}'`);
    }
  }

  for (const method of protocol.methods ?? []) {
    if (!isObjectLike(value) || !(method in value)) {
      errors.push(`missing method '${method}'`);
      continue;
    }

    const candidate = value[method];
    if (typeof candidate !== 'function') {
      errors.push(`member '${method}' is not callable`);
    }
  }

  return errors;
}

export function conformsToProtocol(
  value: unknown,
  protocol: ProtocolDefinition,
): boolean {
  return protocolConformanceErrors(value, protocol).length === 0;
}

export function assertConformsToProtocol(
  value: unknown,
  protocol: ProtocolDefinition,
  variableName = 'value',
): void {
  const errors = protocolConformanceErrors(value, protocol);

  if (errors.length > 0) {
    throw new TypeError(
      `${variableName} does not conform to protocol ${protocol.name}: ${errors.join(', ')}`,
    );
  }
}

export function toBooleanString(
  value: boolean | number | string,
): BooleanString {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    return value === 1 ? 'true' : 'false';
  }

  const lowerCased = value.toLowerCase();
  if (lowerCased === 'true') {
    return 'true';
  }
  if (lowerCased === 'false') {
    return 'false';
  }

  throw new Error(`Expected boolean, number, string, got ${typeof value}`);
}
