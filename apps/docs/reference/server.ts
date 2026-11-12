export async function importServerModule<Module>(path: string): Promise<Module> {
  const url = new URL(`src/${path}`, import.meta.resolve('@oaknational/mcp-server/package.json'));
  return (await import(url.href)) as Module;
}
