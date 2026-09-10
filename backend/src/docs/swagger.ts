import path from 'path';
import fs from 'fs';
import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';

const OPENAPI_PATH = path.resolve(__dirname, '../../../docs/openapi.yaml');

export function mountApiDocs(app: Express): void {
  const rawSpec = fs.readFileSync(OPENAPI_PATH, 'utf8');
  const spec = YAML.parse(rawSpec);

  app.get('/api/openapi.yaml', (_req, res) => {
    res.type('text/yaml').send(rawSpec);
  });

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec));
}
