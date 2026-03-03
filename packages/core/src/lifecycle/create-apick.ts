/**
 * Factory function for creating and booting an Apick instance.
 *
 * @example
 *   const apick = await createApick({ appDir: __dirname });
 *   await apick.listen();
 */

import { Apick, type ApickOptions } from './apick.js';

export async function createApick(options: ApickOptions): Promise<Apick> {
  const apick = new Apick(options);
  await apick.load();
  return apick;
}
