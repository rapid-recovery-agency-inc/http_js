import {
  assertConformsToProtocol,
  conformsToProtocol,
  createProtocolDefinition,
  protocolConformanceErrors,
  toBooleanString,
} from '../protocols';

describe('utils protocols', () => {
  const protocol = createProtocolDefinition({
    name: 'ExampleProtocol',
    attributes: ['name'],
    methods: ['run'],
  });

  it('returns conformance errors for missing members', () => {
    expect(protocolConformanceErrors({}, protocol)).toEqual([
      "missing attribute 'name'",
      "missing method 'run'",
    ]);
  });

  it('checks protocol conformance and asserts with a useful error', () => {
    const valid = { name: 'worker', run() {} };

    expect(conformsToProtocol(valid, protocol)).toBe(true);
    expect(() => assertConformsToProtocol({}, protocol, 'candidate')).toThrow(
      "candidate does not conform to protocol ExampleProtocol: missing attribute 'name', missing method 'run'",
    );
  });

  it('converts boolean-like values to boolean strings', () => {
    expect(toBooleanString(true)).toBe('true');
    expect(toBooleanString(false)).toBe('false');
    expect(toBooleanString(1)).toBe('true');
    expect(toBooleanString('false')).toBe('false');
    expect(() => toBooleanString('maybe')).toThrow(
      'Expected bool, int, or str, got string',
    );
  });
});
