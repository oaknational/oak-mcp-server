import { createPreviewServer } from './serve.mts';

const port = Number(process.env['PORT'] ?? 4173);
createPreviewServer().listen(port, () => {
  console.log(`Docs preview at http://localhost:${String(port)}/`);
});
