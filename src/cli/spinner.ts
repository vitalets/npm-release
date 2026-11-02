import { clearLine, cursorTo } from 'node:readline';

export async function withSpinner<T>(message: string, operation: () => Promise<T>): Promise<T> {
  if (!process.stdout.isTTY) return operation();
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frame = 0;
  const render = () => {
    cursorTo(process.stdout, 0);
    clearLine(process.stdout, 0);
    process.stdout.write(`${frames[frame++ % frames.length]} ${message}`);
  };
  render();
  const timer = setInterval(render, 80);
  try {
    return await operation();
  } finally {
    clearInterval(timer);
    cursorTo(process.stdout, 0);
    clearLine(process.stdout, 0);
  }
}
