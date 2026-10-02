// OpenNext generates the implementation after Next's source type checking.
// Declare only its public fetch contract so generated bundles cannot change
// application globals such as Buffer during subsequent type checks.
declare module 'movecar-generated-worker' {
  const handler: {
    fetch(
      request: Request,
      env: Record<string, unknown>,
      context: { waitUntil(promise: Promise<unknown>): void },
    ): Promise<Response>;
  };
  export default handler;
}
