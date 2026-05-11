# Shared Context

## Purpose

This shared area provides request-scoped context creation and attachment. It gives higher-level modules a common way to expose writer resources, reader resources, request state, and optional enhancers.

## Architecture

```text
request
  -> buildContextFactory()
	  -> Context instance
		  -> writer resource
		  -> selected reader resource
		  -> request state attachment
```

## File Structure

| File                | Role                                                    |
| ------------------- | ------------------------------------------------------- |
| `../../../index.ts` | Root package export surface for this shared area        |
| `services.ts`       | Context class, attachment helpers, and factory builders |
| `context.test.ts`   | Shared area tests                                       |

## Key Responsibilities

- Create request-scoped context objects.
- Attach context to request state in a framework-agnostic way.
- Support reader selection and optional context enhancers.
- Act as the common dependency boundary for request-aware modules.

## Dependencies

- Related shared area: [../requests](../requests)
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Main implementation: [services.ts](services.ts)
- Tests: [context.test.ts](context.test.ts)
