import { config } from 'dotenv';

// Todas las pruebas corren contra la base de datos de pruebas,
// nunca contra la de desarrollo.
config({ path: '.env.test', override: true, quiet: true });
