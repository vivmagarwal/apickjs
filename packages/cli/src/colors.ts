/**
 * ANSI color helpers.
 *
 * Disabled when NO_COLOR is set or output is not a TTY.
 */

const enabled = !process.env.NO_COLOR && process.stdout.isTTY !== false;

function wrap(code: string, resetCode: string) {
  return (text: string) => enabled ? `\x1b[${code}m${text}\x1b[${resetCode}m` : text;
}

export const colors = {
  green: wrap('32', '39'),
  red: wrap('31', '39'),
  cyan: wrap('36', '39'),
  yellow: wrap('33', '39'),
  dim: wrap('2', '22'),
  bold: wrap('1', '22'),
};

export function success(msg: string): void {
  console.log(colors.green(`  [success] ${msg}`));
}

export function error(msg: string): void {
  console.error(colors.red(`  [error] ${msg}`));
}

export function info(msg: string): void {
  console.log(colors.cyan(`  [info] ${msg}`));
}

export function warn(msg: string): void {
  console.warn(colors.yellow(`  [warn] ${msg}`));
}
