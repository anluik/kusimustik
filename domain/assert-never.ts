/**
 * Compile-time exhaustiveness guard for discriminated unions.
 *
 * Call it in the `default:` branch of every `switch` over an element or answer
 * type. Adding a variant to the union then turns every unhandled switch into a
 * type error, which is the whole reason the union is modelled the way it is.
 *
 * Never widen the parameter or add a fallback branch to make a build pass —
 * handle the new case.
 */
export function assertNever(value: never, context = "value"): never {
    throw new Error(`Unhandled ${context}: ${JSON.stringify(value)}`);
}
